import { expect, test, type Page } from '@playwright/test'

async function expectMinimumTargets(page: Page) {
  const undersized = await page
    .locator('main a, main button, main input, main select, main textarea, main [role="button"]')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        if (!(element instanceof HTMLElement) || element.hidden) return []
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return []
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height || (rect.width >= 48 && rect.height >= 48)) return []
        return [
          {
            name: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80),
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          },
        ]
      }),
    )
  expect(undersized, 'Store Details actions smaller than 48 × 48 CSS pixels').toEqual([])
}

async function openPrimaryStore(page: Page) {
  await page.goto('/stores?q=Blue&area=topeka-ks')
  const storeLink = page.getByRole('link', { name: 'Blue Finch Curios', exact: true })
  await expect(storeLink).toBeVisible()
  await storeLink.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, 480))
  await storeLink.click()
  await expect(page).toHaveURL(/\/stores\/blue-finch-curios$/)
  const heading = page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
}

test.describe('Store Details decision-screen contract', () => {
  test('shows the complete visit decision hierarchy and honest source information', async ({
    page,
  }) => {
    await openPrimaryStore(page)

    await expect(page.getByRole('heading', { name: 'About this store' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hours', exact: true })).toBeVisible()
    await expect(
      page.getByText(/Open now|Closed now|Closed today|Open state unavailable/),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: /special hours & exceptions/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Contact & location' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Latest updates' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Source & freshness' })).toBeVisible()
    await expect(page.getByText('Step-free entrance at the blue front door')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Late-summer lighting collection' }),
    ).toBeVisible()
    await expect(page.getByText('Antique Trail Synthetic Store fixture')).toBeVisible()
    await expect(page.getByText('Labor Day', { exact: true })).toBeVisible()
    await expect(page.getByText(/September 7, 2026.*Closed/)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /visit official website.*new window/i }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /instagram.*new window/i })).toBeVisible()

    const navigate = page.getByRole('link', { name: /navigate in maps.*opens in a new window/i })
    await expect(navigate).toHaveAttribute('target', '_blank')
    const navigationHref = await navigate.getAttribute('href')
    expect(navigationHref).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//)
    expect(decodeURIComponent(navigationHref ?? '')).toContain('100 Synthetic Avenue')
    await expect(page.getByRole('link', { name: 'Add to Trip', exact: true })).toHaveAttribute(
      'href',
      /\/trips\/new\?addStoreId=/,
    )
    await expectMinimumTargets(page)
  })

  test('supports gallery selection, enlargement, focus containment, and focus return', async ({
    page,
  }) => {
    await openPrimaryStore(page)
    const galleryChoices = page.getByRole('group', { name: 'Choose a store photo' })
    await expect(galleryChoices).toBeVisible()
    const choices = galleryChoices.getByRole('button')
    expect(await choices.count()).toBeGreaterThan(1)

    const second = choices.nth(1)
    await second.focus()
    await page.keyboard.press('Enter')
    await expect(second).toHaveAttribute('aria-pressed', 'true')

    const enlarge = page.getByRole('button', { name: /^Enlarge image:/ })
    await enlarge.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    const close = dialog.getByRole('button', { name: 'Close enlarged image' })
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(enlarge).toBeFocused()
  })

  test('keeps the gallery usable when a selected image request is blocked', async ({ page }) => {
    let blockedRequests = 0
    await page.route(/blue-finch-curios-gallery-aisle\.webp(?:\?.*)?$/u, async (route) => {
      blockedRequests += 1
      await route.abort('failed')
    })

    await page.goto('/stores/blue-finch-curios')
    const gallery = page.locator('.store-gallery')
    const choices = page.getByRole('group', { name: 'Choose a store photo' }).getByRole('button')
    await expect(choices).toHaveCount(4)
    await expect.poll(() => blockedRequests).toBeGreaterThan(0)

    const failedChoice = choices.nth(1)
    await failedChoice.click()
    await expect(failedChoice).toHaveAttribute('aria-pressed', 'true')
    await expect(gallery.getByRole('img', { name: 'Store image unavailable' })).toBeVisible()
    await expect(gallery).toContainText('Photo unavailable')
    await expect(failedChoice).toContainText('Unavailable')

    await choices.first().click()
    await expect(choices.first()).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /^Enlarge image:/ })).toBeVisible()
  })

  test('recovers from an enlarged-image failure and returns focus inside the gallery', async ({
    page,
  }) => {
    await page.goto('/stores/blue-finch-curios')
    const gallery = page.locator('.store-gallery')
    const enlarge = page.getByRole('button', { name: /^Enlarge image:/ })
    await enlarge.click()

    const dialog = page.getByRole('dialog')
    const enlargedImage = dialog.getByRole('img')
    await expect(enlargedImage).toBeVisible()
    await enlargedImage.evaluate((image) => image.dispatchEvent(new Event('error')))

    await expect(dialog).toHaveCount(0)
    await expect(gallery.getByRole('img', { name: 'Store image unavailable' })).toBeVisible()
    await expect(gallery).toContainText('Photo unavailable')
    await expect(gallery.locator(':focus')).toHaveCount(1)
    await expect(gallery.getByRole('group', { name: 'Choose a store photo' })).toContainText(
      'Unavailable',
    )
  })

  test('returns to the exact Browse query, scroll position, and originating store', async ({
    page,
  }) => {
    await page.goto('/stores?q=Blue&area=topeka-ks')
    const storeLink = page.getByRole('link', { name: 'Blue Finch Curios', exact: true })
    await storeLink.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, 420))
    await storeLink.click()
    const expectedScroll = await page.evaluate(() => {
      const saved = JSON.parse(
        window.sessionStorage.getItem('antique-trail:browse-return') ?? '{}',
      ) as { scrollY?: number }
      return saved.scrollY
    })
    expect(expectedScroll).toEqual(expect.any(Number))
    await page.getByRole('link', { name: 'Back to Browse' }).click()

    await expect(page).toHaveURL(/\/stores\?q=Blue&area=topeka-ks$/)
    await expect(storeLink).toBeFocused()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(expectedScroll)
  })

  test('reflows at the 320px CSS viewport equivalent to 200% zoom', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/stores/blue-finch-curios')
    await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible()
    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(overflow.body).toBeLessThanOrEqual(1)
    expect(overflow.document).toBeLessThanOrEqual(1)
    await expectMinimumTargets(page)
  })

  test('captures the ordered desktop, tablet, and mobile review views', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'One deterministic evidence set is sufficient.')
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'tablet', width: 900, height: 1000 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/stores/blue-finch-curios')
      await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible()
      await page.screenshot({
        path: `docs/evidence/ui-02/store-details-${viewport.name}.png`,
        fullPage: true,
      })
    }
  })

  test('keeps sparse and not-found recovery inside the Store Details contract', async ({
    page,
  }) => {
    await page.goto('/stores/cedar-brass')
    await expect(page.getByRole('heading', { level: 1, name: 'Cedar & Brass' })).toBeFocused()
    await expect(page.getByText(/contact details have not been supplied/i)).toBeVisible()
    await expect(page.getByText(/accessibility information is unavailable/i)).toBeVisible()
    await expect(page.getByText(/has not published any updates/i)).toBeVisible()
    await expect(page.getByText(/source information unavailable/i)).toBeVisible()

    await page.goto('/stores/not-a-real-store')
    await expect(page.getByRole('heading', { level: 1, name: 'Store not found' })).toBeFocused()
    await expect(page.getByRole('link', { name: 'Back to stores' })).toHaveAttribute(
      'href',
      '/stores',
    )
  })
})
