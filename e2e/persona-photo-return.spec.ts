import { expect, test, type Page } from '@playwright/test'

const reviewUrl = (path: string, identity = 'anonymous', state = 'success') =>
  `${path}${path.includes('?') ? '&' : '?'}reviewAs=${identity}&reviewState=${state}`

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(overflow.body).toBeLessThanOrEqual(1)
  expect(overflow.root).toBeLessThanOrEqual(1)
}

async function expectGalleryControls(page: Page) {
  for (const control of await page.getByRole('dialog').getByRole('button').all()) {
    const bounds = await control.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    })
    expect(bounds.width).toBeGreaterThanOrEqual(48)
    expect(bounds.height).toBeGreaterThanOrEqual(48)
  }
}

test.describe('issue 327 photo exploration return-context diagnostic', () => {
  test('uses actual browsing links to retain the gallery, Details, and Browse context', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/stores?q=Blue&area=topeka-ks'))
    const store = page.getByRole('link', { name: 'Blue Finch Curios', exact: true })
    await expect(store).toBeVisible()
    await store.click()
    const photos = page.getByRole('link', { name: /See all 3 photos/i })
    await expect(photos).toBeVisible()
    await photos.click()
    const expectedDetailsScroll = await page.evaluate(() => {
      const saved = JSON.parse(
        window.sessionStorage.getItem('antique-trail:store-return') ?? '{}',
      ) as { scrollY?: number }
      return saved.scrollY
    })
    expect(expectedDetailsScroll).toEqual(expect.any(Number))
    await expect(page).toHaveURL(/\/stores\/blue-finch-curios\/photos/)

    const tiles = page.getByRole('button', { name: /View photo \d+:/ })
    await expect(page.getByText('3 photos', { exact: true })).toBeVisible()
    // The lead image is a feature; the two remaining photos are tile controls.
    await expect(tiles).toHaveCount(2)
    const scrolledTile = tiles.first()
    await scrolledTile.scrollIntoViewIfNeeded()
    await scrolledTile.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expectGalleryControls(page)
    await dialog.getByRole('button', { name: 'Next photo' }).click()
    await dialog.getByRole('button', { name: 'Previous photo' }).click()
    await dialog.getByRole('button', { name: 'Close enlarged photo' }).click()
    await expect(scrolledTile).toBeFocused()

    await scrolledTile.click()
    await page.keyboard.press('Escape')
    await expect(scrolledTile).toBeFocused()
    await page.getByRole('link', { name: 'Back to Blue Finch Curios' }).click()
    await expect(page.getByRole('heading', { name: 'Blue Finch Curios' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(expectedDetailsScroll)
    await expect(photos).toBeFocused()
    await page.getByRole('link', { name: 'Back to Browse' }).click()
    await expect(page).toHaveURL(
      /\/stores\?q=Blue&area=topeka-ks&reviewAs=anonymous&reviewState=success$/,
    )
    await expect(store).toBeFocused()
  })

  test('keeps many and failed-image states named and returnable', async ({ page }) => {
    await page.goto(reviewUrl('/stores/willow-wren/photos'))
    await expect(page.getByText('50 photos', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /View photo \d+:/ })).toHaveCount(49)

    await page.route(
      /\/images\/(?:synthetic-stores|synthetic-fixtures)\/.*\.(?:svg|webp)(?:\?.*)?$/u,
      (route) => route.abort('failed'),
    )
    await page.goto(reviewUrl('/stores/willow-wren/photos'))
    await expect(page.getByRole('img', { name: 'Photo unavailable' }).first()).toBeVisible()
    const unavailable = page.getByRole('button', { name: /unavailable/i }).first()
    await expect(unavailable).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Back to Willow & Wren' })).toBeVisible()
  })

  test.skip('records the unavailable zero-image fixture seam', async () => {
    // All current deterministic stores carry a cover image. Do not fabricate a
    // client-only zero-media state inside this browser diagnostic: a fixture
    // owner must supply one before it can be counted as observed evidence.
  })

  test.skip('records the unavailable one-image fixture seam', async () => {
    // The review harness does not expose the demo catalog's one-image store.
    // Do not claim this variant is covered until an owned fixture supplies it.
  })

  test('recovers an interrupted private action without a cancelled write', async ({ page }) => {
    await page.goto(reviewUrl('/stores/blue-finch-curios'))
    await page.getByRole('link', { name: /save blue finch curios.*requires sign-in/i }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeFocused()

    const signInUrl = new URL(page.url())
    signInUrl.searchParams.set('reviewState', 'error')
    await page.goto(signInUrl.toString())
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeFocused()
    await page.getByLabel('Email').fill('shopper-a@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    const signInError = page.getByRole('alert').filter({
      hasText: "We couldn't sign you in. Check your details and try again.",
    })
    await expect(signInError).toBeVisible()
    await page.getByRole('link', { name: 'Cancel and return without saving' }).click()
    await expect(page).toHaveURL(/\/stores\/blue-finch-curios(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: 'Blue Finch Curios' })).toBeFocused()
    await expect(
      page.getByRole('link', { name: /save blue finch curios.*requires sign-in/i }),
    ).toBeVisible()
    await expect(
      page.evaluate(() => sessionStorage.getItem('antique-trail:jit-private-action:v1')),
    ).resolves.toBeNull()
    await expect(page.getByText('Store saved after sign-in.')).toHaveCount(0)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme} theme, reduced motion, and 200% reflow keep photo controls usable`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.addInitScript((value) => localStorage.setItem('at-theme', value), theme)
      await page.setViewportSize({ width: 320, height: 800 })
      await page.goto(reviewUrl('/stores/blue-finch-curios/photos'))
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expectNoHorizontalOverflow(page)
      const tile = page.getByRole('button', { name: /View photo 2:/ }).first()
      await expect(tile).toBeVisible()
      expect(
        await tile.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration)),
      ).toBeLessThanOrEqual(0.00001)
      await tile.click()
      await expectGalleryControls(page)
      await expectNoHorizontalOverflow(page)
      await page.screenshot({ path: `docs/evidence/issue-327/${theme}-320-reduced-motion.png` })
    })
  }
})
