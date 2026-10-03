import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const appOrigin = 'http://127.0.0.1:5982'
const mediaOrigin = 'http://127.0.0.1:5981'
const pagePath = '/stores/the-market-at-macvicar'
const wall = JSON.parse(
  readFileSync(resolve('docs/plans/market-at-macvicar/gallery-wall.json'), 'utf8'),
) as {
  cover: { photoId: string; alt: string }
  gallery: Array<{ photoId: string; alt: string }>
}
const media = [wall.cover, ...wall.gallery]
const allowedPhotoIds = new Set(media.map((item) => item.photoId))

async function restrictPreviewRequests(
  page: Page,
  unavailablePhotoId?: string,
  allowedAppOrigin?: string,
) {
  const blockedRequests: string[] = []
  const mediaResponses: Array<{ id: string; status: number; contentType: string | undefined }> = []

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      (url.origin === appOrigin || url.origin === allowedAppOrigin) &&
      request.method() === 'GET'
    )
      return route.continue()

    const match = url.pathname.match(/^\/photos\/([0-9]+)\.webp$/)
    if (
      url.origin === mediaOrigin &&
      request.method() === 'GET' &&
      match &&
      allowedPhotoIds.has(match[1])
    ) {
      if (match[1] === unavailablePhotoId)
        return route.fulfill({ status: 503, contentType: 'image/webp', body: '' })
      return route.continue()
    }

    blockedRequests.push(request.method() + ' ' + url.href)
    return route.abort()
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.origin !== mediaOrigin) return
    const match = url.pathname.match(/^\/photos\/([0-9]+)\.webp$/)
    if (match)
      mediaResponses.push({
        id: match[1],
        status: response.status(),
        contentType: response.headers()['content-type'],
      })
  })
  return { blockedRequests, mediaResponses }
}

test('opens the real store route and its complete gallery on desktop and mobile', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const { blockedRequests, mediaResponses } = await restrictPreviewRequests(page)

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
    await page.goto(pagePath)

    const detailHeading = page.getByRole('heading', {
      name: 'The Market at Macvicar',
    })
    await expect(detailHeading).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('region', { name: 'About this store' })).toContainText(
      '2307 SW 10th Ave, Topeka, KS 66604',
    )
    await expect(page.getByRole('link', { name: 'Call (785) 409-4277' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Email the store' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Facebook' })).toBeVisible()
    await expect(
      page.getByText('Local preview only. Save and store claim actions are unavailable.'),
    ).toBeVisible()
    const hours = page.locator('.store-hours')
    await expect(hours.getByText('Tuesday', { exact: true })).toBeVisible()
    await expect(hours.getByText('10:00 AM–5:00 PM', { exact: true })).toHaveCount(4)
    await expect(hours.getByText('Saturday', { exact: true })).toBeVisible()
    await expect(hours.getByText('10:00 AM–4:00 PM', { exact: true })).toHaveCount(1)
    await expect(hours.getByText('Monday', { exact: true })).toBeVisible()
    const source = page.getByRole('region', { name: 'Source & freshness' })
    await expect(source.getByText('October 3, 2026', { exact: true })).toHaveCount(2)
    await expect(source).toContainText(/user-confirmed hours/i)
    await expect(page.getByText('10:00', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'See all 51 photos' })).toBeVisible()

    const detailLabels = await page.locator('.store-gallery__print').evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label')),
    )
    expect(detailLabels).toEqual(
      media.map((item, index) => 'Show image ' + (index + 1) + ': ' + item.alt),
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }))
    await page.screenshot({
      path: testInfo.outputPath('macvicar-details-' + width + '.png'),
      fullPage: false,
    })

    await page.getByRole('link', { name: 'See all 51 photos' }).click()
    await expect(page.getByRole('heading', { name: 'Store photos' })).toBeVisible()
    await expect(page.locator('.store-photos__body img')).toHaveCount(51)
    // This separate all-assets check forces complete loading after the fresh-page lazy check.
    await page.locator('.store-photos__body img').evaluateAll((images) => {
      images.forEach((image) => {
        if (image instanceof HTMLImageElement) image.loading = 'eager'
      })
    })
    await expect
      .poll(
        () =>
          page.locator('.store-photos__body img').evaluateAll(
            (images) =>
              images.filter(
                (image) =>
                  image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
              ).length,
          ),
        { timeout: 30_000 },
      )
      .toBe(51)

    const loadedPhotoIds = await page.locator('.store-photos__body img').evaluateAll((images) =>
      images.map((image) => {
        const path = new URL(image.getAttribute('src') ?? '').pathname
        return path.split('/').pop()?.replace(/\.webp$/u, '') ?? ''
      }),
    )
    expect([...loadedPhotoIds].sort()).toEqual([...allowedPhotoIds].sort())
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }))
    await page.screenshot({
      path: testInfo.outputPath('macvicar-gallery-' + width + '.png'),
      fullPage: false,
    })

    const opener = page.locator('.store-photos__tile[data-photo-index]').first()
    await opener.scrollIntoViewIfNeeded()
    await opener.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(opener).toBeFocused()
  }

  expect(blockedRequests).toEqual([])
  expect(new Set(mediaResponses.map((response) => response.id))).toEqual(allowedPhotoIds)
  expect(mediaResponses.every((response) => response.status === 200)).toBe(true)
  expect(mediaResponses.every((response) => response.contentType?.startsWith('image/webp'))).toBe(
    true,
  )
})

test('loads lower photo wall images when scrolled into view', async ({ page }) => {
  const { blockedRequests, mediaResponses } = await restrictPreviewRequests(page)

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(pagePath + '/photos')
  await expect(page.getByRole('heading', { name: 'Store photos' })).toBeVisible()

  const images = page.locator('.store-photos__body img')
  await expect(images).toHaveCount(51)
  const cover = page.locator(
    `.store-photos__body img[src$="${wall.cover.photoId}.webp"]`,
  )
  await expect(cover).toBeInViewport()
  await expect
    .poll(
      () =>
        cover.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      { timeout: 30_000 },
    )
    .toBe(true)
  await cover.evaluate(async (image) => {
    if (!(image instanceof HTMLImageElement)) throw new Error('Cover is not an image.')
    await image.decode()
  })

  const initialReadiness = await images.evaluateAll((elements) =>
    elements.map((element) => {
      const image = element as HTMLImageElement
      return {
        loading: image.loading,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
      }
    }),
  )
  expect(initialReadiness).toHaveLength(51)
  expect(initialReadiness.every((image) => image.loading === 'lazy')).toBe(true)
  expect(
    initialReadiness.filter((image) => image.complete && image.naturalWidth > 0).length,
  ).toBeLessThan(51)

  const lowerTile = page.locator('.store-photos__tile[data-photo-index="50"]')
  const lowerImage = lowerTile.locator('img')
  await expect(lowerImage).toHaveCount(1)
  expect(
    await lowerImage.evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBe(0)
  await lowerTile.scrollIntoViewIfNeeded()
  await expect
    .poll(
      () =>
        lowerImage.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      { timeout: 30_000 },
    )
    .toBe(true)
  await lowerImage.evaluate(async (image) => {
    if (!(image instanceof HTMLImageElement)) throw new Error('Lower tile is not an image.')
    await image.decode()
  })

  const lowerPhotoId = wall.gallery[wall.gallery.length - 1].photoId
  expect(
    mediaResponses.some((response) => response.id === wall.cover.photoId && response.status === 200),
  ).toBe(true)
  expect(
    mediaResponses.some((response) => response.id === lowerPhotoId && response.status === 200),
  ).toBe(true)
  expect(blockedRequests).toEqual([])
})

test('uses the normal not-found state outside the exact preview host and slug', async ({ browser }) => {
  const cases = [
    { origin: appOrigin, storePath: '/stores/not-the-market-at-macvicar' },
    { origin: 'http://localhost:5982', storePath: pagePath },
  ]

  for (const scenario of cases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    const { blockedRequests, mediaResponses } = await restrictPreviewRequests(
      page,
      undefined,
      scenario.origin === 'http://localhost:5982' ? scenario.origin : undefined,
    )

    for (const path of [scenario.storePath, scenario.storePath + '/photos']) {
      await page.goto(scenario.origin + path)
      await expect(page.getByRole('heading', { name: 'Store not found' })).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'The Market at Macvicar', exact: true }),
      ).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Store photos' })).toHaveCount(0)
      await expect(page.locator('.store-gallery__print')).toHaveCount(0)
      await expect(page.locator('.store-photos__body img')).toHaveCount(0)
    }

    expect(blockedRequests).toEqual([])
    expect(mediaResponses).toEqual([])
    await context.close()
  }
})

test('keeps the photo wall usable when one selected image fails', async ({ page }) => {
  const failedPhoto = wall.gallery[0]
  const { blockedRequests, mediaResponses } = await restrictPreviewRequests(page, failedPhoto.photoId)

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(pagePath + '/photos')
  await expect(page.getByRole('heading', { name: 'Store photos' })).toBeVisible()

  const failedTile = page.locator('.store-photos__tile[data-photo-index="1"]')
  await failedTile.scrollIntoViewIfNeeded()
  await expect(failedTile).toBeDisabled()
  await expect(failedTile.getByText('Unavailable', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /back to the market at macvicar/i })).toBeVisible()

  const usableTile = page.locator('.store-photos__tile[data-photo-index="2"]')
  await usableTile.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  expect(blockedRequests).toEqual([])
  expect(
    mediaResponses.some(
      (response) => response.id === failedPhoto.photoId && response.status === 503,
    ),
  ).toBe(true)
  const successfulResponses = mediaResponses.filter((response) => response.status === 200)
  expect(successfulResponses.length).toBeGreaterThan(0)
  expect(successfulResponses.every((response) => response.contentType?.startsWith('image/webp'))).toBe(
    true,
  )
})
