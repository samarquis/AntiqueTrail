import { expect, test, type Page } from '@playwright/test'

// In review mode the anonymous catalog exposes blue-finch-curios; a fully
// populated evaluation wall carries 50 media there.
const baseSlug = 'blue-finch-curios'
const photosHref = `/stores/${baseSlug}/photos?reviewAs=anonymous&reviewState=success`
const detailsHref = `/stores/${baseSlug}?reviewAs=anonymous&reviewState=success`
// The wall has 1 cover + 49 evaluation media. Two become full-bleed features,
// the remaining 48 render as tiles.
const allMediaCount = 50
const featureCount = 2
const tileCount = allMediaCount - featureCount
const columnCount: Record<string, number> = { chromium: 6, mobile: 2 }

const tiles = (page: Page) => page.locator('.store-photos__body .store-photos__tile')

async function waitForWallReady(page: Page) {
  await tiles(page)
    .nth(tileCount - 1)
    .waitFor({ state: 'visible' })
  await expect(page.locator('.store-photos__feature')).toHaveCount(featureCount)
}

async function openWall(page: Page) {
  await page.goto(photosHref)
  await waitForWallReady(page)
}

for (const project of ['chromium', 'mobile'] as const) {
  test(`fixture wall ${project} renders 50 photos as features and tiles`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== project,
      `One deterministic run for ${project} is sufficient.`,
    )
    await openWall(page)
    await expect(tiles(page)).toHaveCount(tileCount)
    await expect(page.locator('.store-photos__feature')).toHaveCount(featureCount)
    await expect(page.locator('.store-photos__count')).toHaveText('50 photos')
    await expect(page.locator('.evaluation-note')).toHaveText(
      /Internal only · Generated template art, not a real store listing/,
    )
    expect(
      await page.evaluate(() => {
        const grid = document.querySelector('.store-photos__body')
        if (!grid) return 1
        return window.getComputedStyle(grid).gridTemplateColumns.split(' ').length
      }),
    ).toBe(columnCount[project])
  })
}

test('fixture wall lightbox supports keyboard flow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One interaction run is sufficient.')
  await openWall(page)
  // media[0] is the cover feature; the first tile is media[1].
  const firstTile = tiles(page).first()
  await firstTile.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('status')).toHaveText('Photo 2 of 50')
  const firstTileLabel = await firstTile.getAttribute('aria-label')
  expect(firstTileLabel).toBeTruthy()
  const lightboxImg = dialog.locator('.store-photos__lightbox-figure img')
  await expect(lightboxImg).toHaveAttribute('alt', /.+/)
  expect(firstTileLabel).toContain(await lightboxImg.getAttribute('alt'))
  await expect(dialog.getByRole('button', { name: /close enlarged photo/i })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('status')).toHaveText('Photo 3 of 50')
  await page.keyboard.press('ArrowLeft')
  await expect(dialog.getByRole('status')).toHaveText('Photo 2 of 50')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(firstTile).toBeFocused()
})

test('fixture wall honors prefers-reduced-motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One desktop interaction run is sufficient.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openWall(page)
  await expect(page.locator('.store-photos')).not.toHaveClass(/store-photos--reveal/)
  await expect(tiles(page)).toHaveCount(tileCount)
})

test('missing image tile shows the solid fallback state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One desktop interaction run is sufficient.')
  await openWall(page)
  await expect(page.locator('.store-photos__missing')).toHaveCount(0)
  await expect(page.locator('.store-photos__tile-unavailable')).toHaveCount(0)
})

test('evaluation note is visible on details page gallery', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One desktop interaction run is sufficient.')
  await page.goto(detailsHref)
  await expect(page.locator('.store-detail__evaluation-note')).toHaveText(/Internal only/)
})
