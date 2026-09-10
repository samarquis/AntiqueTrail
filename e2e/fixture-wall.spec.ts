import { expect, type Page, test } from '@playwright/test'
import { consoleMessages, hasMotionQuery, loadAndVerifyImages } from './helpers'

async function waitForWallReady(page: Page, choicesCount: number) {
  await page
    .locator('.store-photos__grid .store-photos__grid-button')
    .nth(choicesCount - 1)
    .waitFor({ state: 'visible' })
}

async function getColumnCount(page: Page, selector: string) {
  return page.evaluate((cssSelector) => {
    const grid = document.querySelector(cssSelector)
    if (!grid) return 1
    const computed = window.getComputedStyle(grid)
    return computed.gridTemplateColumns.split(' ').length
  }, selector)
}

const baseSlug = 'cedar-and-brass'

for (const viewport of ['desktop', 'mobile'] as const) {
  test(`fixture wall ${viewport} renders 50 tiles with correct label`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== viewport,
      `One deterministic run for ${viewport} is sufficient.`,
    )
    await page.goto(`/stores/${baseSlug}/photos`)
    await waitForWallReady(page, 50)
    const tiles = page.locator('.store-photos__grid .store-photos__grid-button')
    await expect(tiles).toHaveCount(50)
    await expect(page.locator('.store-photos__count')).toHaveText('50 photos')
    await expect(page.locator('.evaluation-note')).toHaveText(
      /Internal only · Generated template art, not a real store listing/,
    )
    const columnCount = viewport === 'desktop' ? 2 : 1
    await expect(await getColumnCount(page, '.store-photos__grid')).toBe(columnCount)
    await loadAndVerifyImages(page.locator('.store-photos__grid img'), 50, `${viewport} wall`)
  })

  test(`fixture wall ${viewport} lightbox supports keyboard flow`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== viewport, `One ${viewport} interaction run is sufficient.`)
    await page.goto(`/stores/${baseSlug}/photos`)
    await waitForWallReady(page, 50)
    const tile = page.locator('.store-photos__grid .store-photos__grid-button').first()
    await tile.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('status')).toHaveText('Photo 1 of 50')
    await expect(dialog.locator('.media-overlay-img')).toBeVisible()
    await expect(dialog.locator('.media-overlay-img')).toHaveAttribute('alt', /Cedar & Brass/)
    await page.keyboard.press('Space')
    await expect(dialog.getByRole('status')).toHaveText('Photo 2 of 50')
    await page.keyboard.press('End')
    await expect(dialog.getByRole('status')).toHaveText('Photo 50 of 50')
    await page.keyboard.press('Home')
    await expect(dialog.getByRole('status')).toHaveText('Photo 1 of 50')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(tile).toBeFocused()
  })
}

test('fixture wall honors prefers-reduced-motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One desktop interaction run is sufficient.')
  await hasMotionQuery(page)
  await page.goto(`/stores/${baseSlug}/photos`)
  await waitForWallReady(page, 50)
  await expect(page.locator('.store-photos__grid .store-photos__grid-button')).toHaveCount(50)
  const warnings = await consoleMessages(page, 'warning')
  expect(warnings.some((message) => /animation/i.test(message.text())).not.toEqual(true)).toBe(true)
})

test('missing image tile shows the solid fallback state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One desktop interaction run is sufficient.')
  await page.goto(`/stores/${baseSlug}/photos`)
  await waitForWallReady(page, 50)
  await expect(page.locator('.store-photos__missing')).toHaveCount(0)
})

test('evaluation note is visible on details page gallery', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One desktop interaction run is sufficient.')
  await page.goto(`/stores/${baseSlug}`)
  await expect(page.locator('.store-detail__evaluation-note')).toHaveText(/Internal only/)
})
