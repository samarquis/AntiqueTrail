import { expect, test, type Locator, type Page } from '@playwright/test'

type CardMetrics = {
  id: string
  name: string
  summary: string
  summaryLength: number
  imageRatio: number | null
  imageSize: { width: number; height: number } | null
  sourceImageRatio: number | null
  sourceImageSize: { width: number; height: number } | null
  card: { x: number; y: number; width: number; height: number }
  actions: Array<{ label: string; x: number; y: number; width: number; height: number }>
}

async function waitForBrowse(page: Page) {
  await page.goto('/stores')
  await expect(
    page.getByRole('heading', { level: 1, name: /discover local antiques/iu }),
  ).toBeVisible()
  await expect(page.locator('.catalog-card')).toHaveCount(12)
}

async function waitForCardImage(card: Locator) {
  const image = card.locator('.catalog-card__image')
  if ((await image.count()) === 0) return
  await image.scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const img = element as HTMLImageElement
        return img.complete && img.naturalWidth > 0
      }),
    )
    .toBe(true)
}

async function cardMetrics(card: Locator): Promise<CardMetrics> {
  return card.evaluate(async (element) => {
    const rect = element.getBoundingClientRect()
    const image = element.querySelector<HTMLImageElement>('.catalog-card__image')
    const summary = element.querySelector('.catalog-card__body > p:not([class])')?.textContent ?? ''
    const source = image?.getAttribute('src')
    const sourceImage = source ? new Image() : null
    if (sourceImage && source) {
      sourceImage.src = source
      if (!sourceImage.complete) {
        await new Promise<void>((resolve) => {
          sourceImage.addEventListener('load', () => resolve(), { once: true })
          sourceImage.addEventListener('error', () => resolve(), { once: true })
        })
      }
    }
    const actions = Array.from(
      element.querySelectorAll<HTMLElement>(
        '.catalog-card__actions a, .catalog-card__actions button',
      ),
    ).map((action) => {
      const actionRect = action.getBoundingClientRect()
      return {
        label: action.getAttribute('aria-label') ?? action.textContent?.trim() ?? '',
        x: actionRect.x + window.scrollX,
        y: actionRect.y + window.scrollY,
        width: actionRect.width,
        height: actionRect.height,
        relativeY: actionRect.y - rect.y,
      }
    })

    return {
      id: element.id.replace('catalog-map-store-', ''),
      name: element.querySelector('h2')?.textContent?.trim() ?? '',
      summary,
      summaryLength: summary.length,
      imageRatio: image?.naturalHeight ? image.naturalWidth / image.naturalHeight : null,
      imageSize: image?.naturalHeight
        ? { width: image.naturalWidth, height: image.naturalHeight }
        : null,
      sourceImageRatio: sourceImage?.naturalHeight
        ? sourceImage.naturalWidth / sourceImage.naturalHeight
        : null,
      sourceImageSize: sourceImage?.naturalHeight
        ? { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight }
        : null,
      card: {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      },
      actions,
    }
  })
}

async function loadMetrics(page: Page): Promise<CardMetrics[]> {
  const cards = page.locator('.catalog-card')
  const metrics: CardMetrics[] = []
  for (let index = 0; index < (await cards.count()); index += 1) {
    const card = cards.nth(index)
    await waitForCardImage(card)
    metrics.push(await cardMetrics(card))
  }
  return metrics
}

function representativeCards(metrics: CardMetrics[]): CardMetrics[] {
  const shortest = [...metrics].sort(
    (first, second) => first.summaryLength - second.summaryLength,
  )[0]
  const longest = [...metrics].sort(
    (first, second) => second.summaryLength - first.summaryLength,
  )[0]
  const differentImage = metrics.find(
    (item) =>
      item.id !== shortest.id &&
      item.id !== longest.id &&
      item.sourceImageRatio !== null &&
      item.sourceImageRatio !== shortest.sourceImageRatio,
  )
  const third =
    differentImage ?? metrics.find((item) => item.id !== shortest.id && item.id !== longest.id)
  return [shortest, longest, third!]
}

async function applyTestOnlyImageRatios(page: Page, samples: CardMetrics[]) {
  const dimensions = [
    { width: 640, height: 360 },
    { width: 640, height: 400 },
    { width: 400, height: 300 },
  ] as const
  const varied: CardMetrics[] = []
  const photoFixtures = new Map<number, Buffer>()

  await page.route(
    (url) => url.searchParams.has('issue416Ratio'),
    async (route) => {
      const index = Number(new URL(route.request().url()).searchParams.get('issue416Ratio'))
      const photo = photoFixtures.get(index)
      if (!photo) throw new Error(`missing test-only photo fixture: ${index}`)
      await route.fulfill({ contentType: 'image/png', body: photo })
    },
  )

  for (const [index, { id }] of samples.entries()) {
    const size = dimensions[index]
    if (!size) throw new Error('expected three representative cards')
    const image = cardById(page, id).locator('.catalog-card__image')
    await image.scrollIntoViewIfNeeded()
    const source = await image.getAttribute('src')
    if (!source) throw new Error(`missing cover source for store ${id}`)
    const originalPhoto = new URL(source, page.url())
    const photoData = await page.evaluate(
      async ({ sourceUrl, imageSize }) => {
        const photo = new Image()
        photo.src = sourceUrl
        await photo.decode()
        const scale = Math.max(
          imageSize.width / photo.naturalWidth,
          imageSize.height / photo.naturalHeight,
        )
        const sourceWidth = imageSize.width / scale
        const sourceHeight = imageSize.height / scale
        const canvas = document.createElement('canvas')
        canvas.width = imageSize.width
        canvas.height = imageSize.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('2D canvas context unavailable')
        context.imageSmoothingQuality = 'high'
        context.drawImage(
          photo,
          (photo.naturalWidth - sourceWidth) / 2,
          (photo.naturalHeight - sourceHeight) / 2,
          sourceWidth,
          sourceHeight,
          0,
          0,
          imageSize.width,
          imageSize.height,
        )
        return canvas.toDataURL('image/png')
      },
      { sourceUrl: originalPhoto.href, imageSize: size },
    )
    const encodedPhoto = photoData.split(',')[1]
    if (!encodedPhoto) throw new Error(`could not encode test-only photo fixture for ${id}`)
    photoFixtures.set(index, Buffer.from(encodedPhoto, 'base64'))

    const testSource = new URL(originalPhoto)
    testSource.searchParams.set('issue416Ratio', String(index))
    await image.evaluate((element, imageSource) => {
      const img = element as HTMLImageElement
      img
        .closest('picture')
        ?.querySelectorAll('source')
        .forEach((source) => source.remove())
      img.removeAttribute('srcset')
      img.removeAttribute('sizes')
      img.loading = 'eager'
      img.src = imageSource
    }, testSource.href)
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const img = element as HTMLImageElement
          return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
        }),
      )
      .toBe(true)
    varied.push(await cardMetrics(cardById(page, id)))
  }

  return varied
}

function cardById(page: Page, id: string): Locator {
  return page.locator(`#catalog-map-store-${id}`)
}

async function scrollCardToTop(card: Locator) {
  await card.evaluate((element) => {
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top,
      behavior: 'instant',
    })
  })
}

async function isInsideViewport(locator: Locator, height: number) {
  const box = await locator.boundingBox()
  return box !== null && box.y >= 0 && box.y + box.height <= height
}

function saveBottomFromCardTop(metrics: CardMetrics) {
  const save = metrics.actions.find(({ label }) => label.startsWith('Save '))
  if (!save) throw new Error(`missing Save action for ${metrics.id}`)
  return save.y - metrics.card.y + save.height
}

test('desktop Browse cards have consistent rows and keep facts and actions in view', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await waitForBrowse(page)
  const metrics = await loadMetrics(page)
  const samples = representativeCards(metrics)

  // Restore the main-branch spacing declarations for a controlled before/after measurement.
  const baselineStyle = await page.addStyleTag({
    content: `
      .catalog-card__freshness { padding-top: 1rem !important; }
      .catalog-card__actions { margin-top: 1rem !important; padding-top: 1rem !important; }
    `,
  })
  const baselineLongCard = await cardMetrics(cardById(page, samples[1].id))
  await baselineStyle.evaluate((style) => style.remove())
  const candidateLongCard = await cardMetrics(cardById(page, samples[1].id))
  const beforeAfter = {
    viewport: { width: 1280, height: 800 },
    baseline: {
      card: baselineLongCard.card,
      saveBottomFromCardTop: saveBottomFromCardTop(baselineLongCard),
    },
    candidate: {
      card: candidateLongCard.card,
      saveBottomFromCardTop: saveBottomFromCardTop(candidateLongCard),
    },
  }
  expect(beforeAfter.baseline.saveBottomFromCardTop).toBeGreaterThan(800)
  expect(beforeAfter.candidate.saveBottomFromCardTop).toBeLessThanOrEqual(800)
  expect(baselineLongCard.card.height - candidateLongCard.card.height).toBeCloseTo(12, 1)
  await testInfo.attach('desktop-density-before-after.json', {
    body: Buffer.from(JSON.stringify(beforeAfter, null, 2)),
    contentType: 'application/json',
  })
  console.log(`ISSUE-416 DESKTOP BEFORE/AFTER ${JSON.stringify(beforeAfter)}`)

  // Keep real catalog photo pixels while cropping deterministic test-only aspect ratios.
  const testOnlyRatioSamples = await applyTestOnlyImageRatios(page, samples)
  const testOnlySourceRatios = testOnlyRatioSamples.map((item) => item.sourceImageRatio)
  expect(testOnlySourceRatios.every((ratio) => ratio !== null)).toBe(true)
  expect(
    new Set(testOnlySourceRatios).size,
    'test-only cover sources should have distinct aspect ratios',
  ).toBe(3)

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: testInfo.outputPath('desktop-browse.png') })
  await scrollCardToTop(cardById(page, samples[0].id))
  await page.screenshot({ path: testInfo.outputPath('desktop-short-card.png') })
  await scrollCardToTop(cardById(page, samples[1].id))
  await page.screenshot({ path: testInfo.outputPath('desktop-long-card.png') })

  const rowMetrics = await page.locator('.catalog-card').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { id: element.id, y: rect.y + window.scrollY, height: rect.height }
    }),
  )
  const rows = new Map<number, number[]>()
  for (const item of rowMetrics) {
    const heights = rows.get(item.y) ?? []
    heights.push(item.height)
    rows.set(item.y, heights)
  }
  const rowHeightDifferences = Array.from(rows.values()).map(
    (heights) => Math.max(...heights) - Math.min(...heights),
  )

  await testInfo.attach('desktop-card-geometry.json', {
    body: Buffer.from(
      JSON.stringify({ rowMetrics, rowHeightDifferences, samples, testOnlyRatioSamples }, null, 2),
    ),
    contentType: 'application/json',
  })
  console.log(
    `ISSUE-416 DESKTOP GEOMETRY ${JSON.stringify({ rowMetrics, rowHeightDifferences, samples, testOnlyRatioSamples })}`,
  )

  expect(new Set(samples.map((item) => item.summaryLength)).size).toBeGreaterThan(1)
  for (const difference of rowHeightDifferences) {
    expect(
      difference,
      'cards in one desktop grid row should have equal outer heights',
    ).toBeLessThanOrEqual(1)
  }

  for (const { id } of testOnlyRatioSamples) {
    const card = cardById(page, id)
    await scrollCardToTop(card)
    const save = card.locator('.catalog-card__private-actions').locator('a, button').first()
    for (const locator of [
      card.locator('h2'),
      card.locator('.catalog-card__area'),
      card.locator('.catalog-card__hours'),
      card.locator('.catalog-card__freshness'),
      card.getByRole('link', { name: /view store/iu }),
      save,
    ]) {
      await expect(locator).toBeVisible()
      expect(await isInsideViewport(locator, 800), `${id}: ${await locator.innerText()}`).toBe(true)
    }
    await expect(save).toHaveAttribute(
      'aria-label',
      new RegExp(`Save ${await card.locator('h2').innerText()} \\(requires sign-in\\)`),
    )
  }
})

test('390px Browse cards keep text unclipped and action targets at least 48px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await waitForBrowse(page)
  const metrics = await loadMetrics(page)
  const samples = representativeCards(metrics)
  const mobileSamples: Array<{
    id: string
    name: string
    clipped: string[]
    targets: Array<{ label: string; width: number; height: number }>
  }> = []

  for (const [index, { id }] of samples.entries()) {
    const card = cardById(page, id)
    await scrollCardToTop(card)
    if (index === 1) {
      await page.screenshot({ path: testInfo.outputPath('mobile-long-card.png') })
    }
    mobileSamples.push(
      await card.evaluate((element) => {
        const textNodes = Array.from(
          element.querySelectorAll<HTMLElement>(
            'h2, .catalog-card__area, .catalog-card__categories li, .catalog-card__body > p, .catalog-card__hours *, .catalog-card__actions a, .catalog-card__actions button',
          ),
        ).filter((node) => node.textContent?.trim())
        const clipped = textNodes
          .filter(
            (node) =>
              node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
          )
          .map((node) => node.textContent?.trim() ?? '')
        const targets = Array.from(
          element.querySelectorAll<HTMLElement>(
            '.catalog-card__actions a, .catalog-card__actions button',
          ),
        ).map((target) => {
          const rect = target.getBoundingClientRect()
          return {
            label: target.getAttribute('aria-label') ?? target.textContent?.trim() ?? '',
            width: rect.width,
            height: rect.height,
          }
        })
        return {
          id: element.id.replace('catalog-map-store-', ''),
          name: element.querySelector('h2')?.textContent?.trim() ?? '',
          clipped,
          targets,
        }
      }),
    )
  }

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: testInfo.outputPath('mobile-browse.png') })
  await testInfo.attach('mobile-card-geometry.json', {
    body: Buffer.from(
      JSON.stringify({ viewportWidth: 390, pageWidth, samples, mobileSamples }, null, 2),
    ),
    contentType: 'application/json',
  })
  console.log(
    `ISSUE-416 MOBILE GEOMETRY ${JSON.stringify({ viewportWidth: 390, pageWidth, samples, mobileSamples })}`,
  )

  expect(pageWidth, 'Browse should not overflow horizontally at 390px').toBeLessThanOrEqual(390)
  for (const sample of mobileSamples) {
    expect(sample.clipped, `${sample.id}: clipped text`).toEqual([])
    for (const target of sample.targets) {
      expect(target.width, `${sample.id}: ${target.label} width`).toBeGreaterThanOrEqual(48)
      expect(target.height, `${sample.id}: ${target.label} height`).toBeGreaterThanOrEqual(48)
    }
  }
})
