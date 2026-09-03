import { expect, test } from '@playwright/test'

const url =
  '/research/photo-tiers/17500000-0000-4000-8000-000000000003?reviewAs=shopper-a&reviewState=success'

test.describe('issue #175 private inactive commercial research', () => {
  test('renders the exact noindex offer without purchase or provider traffic', async ({ page }) => {
    test.setTimeout(90_000)
    const providerRequests: string[] = []
    page.on('request', (request) => {
      if (/stripe|billing-checkout|billing-portal/i.test(request.url()))
        providerRequests.push(request.url())
    })
    await page.goto(url)
    await expect(
      page.getByRole('heading', { name: 'Compare optional photo capacity' }),
    ).toBeVisible({ timeout: 45_000 })
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    )
    await expect(page.getByText(/Cover plus 15 gallery photos/)).toContainText('$12.00')
    await expect(page.getByText(/no plan-count cap/)).toContainText('$19.00')
    await expect(page.getByText(/reason, recovery step, and appeal path/)).toBeVisible()
    await expect(page.getByText(/full refund within 48 hours/i)).toBeVisible()
    await expect(
      page.getByText(/upgrades take effect immediately with prorated charges/i),
    ).toBeVisible()
    await expect(page.getByText(/downgrades take effect at renewal/i)).toBeVisible()
    await expect(page.getByText(/14-day grace period/)).toBeVisible()
    await expect(page.getByText(/delete after a 30-day grace period/i)).toBeVisible()
    await expect(page.getByText(/payment never affects publication/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /checkout|buy|upgrade/i })).toHaveCount(0)
    expect(providerRequests).toEqual([])
  })

  test('records a minimized refusal without exposing free-form personal data', async ({ page }) => {
    await page.goto(url)
    await page.getByLabel('Which would you choose?').selectOption('refused')
    await page.getByLabel('Primary reason').selectOption('prefer_not_to_say')
    await page.getByLabel('Record this minimized research response').check()
    await page.getByRole('button', { name: 'Record response' }).click()
    await expect(page.getByRole('status')).toContainText('No purchase was made')
    await expect(page.locator('textarea')).toHaveCount(0)
  })

  test('reflows at the 320 CSS-pixel 200-percent equivalent and forced colors', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
    await page.goto(url)
    await expect(
      page.getByRole('heading', { name: 'Compare optional photo capacity' }),
    ).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflow).toBe(false)
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
  })
})
