import { expect, test, type Page } from '@playwright/test'

const reviewUrl = (path: string, identity: string, state = 'success') =>
  `${path}?reviewAs=${identity}&reviewState=${state}`

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page
      .locator('body')
      .evaluate((body) =>
        Array.from(body.querySelectorAll<HTMLElement>('*')).flatMap((element) =>
          element.getBoundingClientRect().right > document.documentElement.clientWidth + 1
            ? [element.tagName]
            : [],
        ),
      ),
  ).toEqual([])
}

test.describe('UI-10 integrated product acceptance', () => {
  test('public, shopper, representative, and administrator journeys retain their boundaries', async ({
    page,
  }) => {
    await page.goto('/stores')
    await expect(page.getByRole('heading', { level: 1, name: 'Browse stores' })).toBeFocused()
    await expect(page.getByRole('link', { name: 'Blue Finch Curios', exact: true })).toBeVisible()

    await page.goto(reviewUrl('/saved', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Saved stores' })).toBeVisible()
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()

    await page.goto(reviewUrl('/store-portal', 'representative'))
    await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible()
    await expect(
      page.getByRole('definition').filter({ hasText: 'Hours verified 12 days ago' }),
    ).toBeVisible()

    await page.goto(reviewUrl('/admin', 'administrator'))
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
    await page.getByRole('button', { name: 'Review Blue Finch Curios' }).click()
    await expect(page.getByLabel('Current and requested listing preview')).toContainText(
      'Requested address',
    )

    await page.goto(reviewUrl('/admin', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toHaveCount(0)
  })

  test('state variants stay honest across the integrated role surfaces', async ({ page }) => {
    const cases = [
      ['/saved', 'shopper-a', 'loading', 'Loading'],
      ['/shares', 'shopper-b', 'empty', 'No'],
      ['/store-portal', 'representative', 'error', 'Store Portal access is unavailable'],
      ['/admin', 'administrator', 'blocked', 'This item is not available.'],
    ] as const
    for (const [path, identity, state, copy] of cases) {
      await page.goto(reviewUrl(path, identity, state))
      await expect(page.locator('main')).toContainText(copy)
    }
  })

  test('keyboard focus, forced colors, reduced motion, and 200% reflow preserve function', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/store-portal', 'representative'))
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
    expect(
      await focused.evaluate((element) => {
        const style = getComputedStyle(element)
        return style.outlineStyle !== 'none' || style.boxShadow !== 'none'
      }),
    ).toBe(true)

    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' })
    await page.goto(reviewUrl('/admin/access', 'administrator'))
    await expect(page.getByRole('heading', { level: 1, name: 'Access & Safety' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Preview revoke Blue Finch/ })).toBeVisible()

    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none' })
    await page.goto('/stores')
    await page.setViewportSize({ width: 640, height: 900 })
    await page.evaluate(() => {
      document.body.style.zoom = '2'
    })
    await expect(page.getByRole('heading', { level: 1, name: 'Browse stores' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('captures integrated approval evidence when explicitly requested', async ({
    page,
  }, testInfo) => {
    test.skip(!process.env.CAPTURE_UI10_EVIDENCE, 'Evidence capture is opt-in.')
    const targets = [
      ['/stores', 'public-browse'],
      [reviewUrl('/saved', 'shopper-a'), 'shopper-saved'],
      [reviewUrl('/store-portal', 'representative'), 'representative-portal'],
      [reviewUrl('/admin', 'administrator'), 'admin-queue'],
    ] as const
    for (const [url, slug] of targets) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.screenshot({
        path: `docs/evidence/ui-10/${testInfo.project.name}-${slug}.png`,
        fullPage: true,
      })
    }
  })
})
