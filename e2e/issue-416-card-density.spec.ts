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
  await expect(page.getByRole('heading', { level: 1, name: /browse stores/iu })).toBeVisible()
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

test('desktop Browse cards have consistent rows and keep facts and actions in view', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await waitForBrowse(page)
  const metrics = await loadMetrics(page)
  const samples = representativeCards(metrics)
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

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: testInfo.outputPath('desktop-browse.png') })
  await testInfo.attach('desktop-card-geometry.json', {
    body: Buffer.from(JSON.stringify({ rowMetrics, rowHeightDifferences, samples }, null, 2)),
    contentType: 'application/json',
  })
  console.log(
    `ISSUE-416 DESKTOP GEOMETRY ${JSON.stringify({ rowMetrics, rowHeightDifferences, samples })}`,
  )

  expect(new Set(samples.map((item) => item.summaryLength)).size).toBeGreaterThan(1)
  for (const difference of rowHeightDifferences) {
    expect(
      difference,
      'cards in one desktop grid row should have equal outer heights',
    ).toBeLessThanOrEqual(1)
  }

  for (const [index, { id }] of samples.entries()) {
    const card = cardById(page, id)
    await scrollCardToTop(card)
    if (index === 1) {
      await page.screenshot({ path: testInfo.outputPath('desktop-long-card.png') })
    }
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
