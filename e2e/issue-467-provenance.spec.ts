import { expect, test } from '@playwright/test'

const disclosureText = 'Fictional listing for product review.'
const freshnessStates = ['current', 'stale', 'unknown'] as const

test('keeps fictional disclosure beside freshness on Browse and Details', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('at-theme')) localStorage.setItem('at-theme', 'light')
  })
  await page.goto('/stores')
  await expect(page.locator('.catalog-card')).toHaveCount(12)
  await expect(page.locator('.catalog-card .listing-fictional-disclosure')).toHaveCount(12)

  for (const theme of ['light', 'dark'] as const) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    for (const status of freshnessStates) {
      const freshnessSelector = `.catalog-card__freshness--${status}`
      const card = page
        .locator('.catalog-card')
        .filter({ has: page.locator(freshnessSelector) })
        .first()
      const freshness = card.locator(freshnessSelector)
      const disclosure = card.locator('.listing-fictional-disclosure')

      await expect(card).toBeVisible()
      await expect(freshness).toBeVisible()
      await expect(disclosure).toHaveText(disclosureText)
      expect(
        await freshness.evaluate((element) =>
          element.nextElementSibling?.matches('.listing-fictional-disclosure'),
        ),
      ).toBe(true)

      const detailsHref = await card.locator('.catalog-card__details').getAttribute('href')
      expect(detailsHref).toMatch(/^\/stores\/[a-z0-9-]+$/u)
      await page.goto(detailsHref!)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      await expect(
        page.getByLabel('Listing status').locator(`.status-badge--${status}`),
      ).toBeVisible()
      const provenance = page.getByRole('region', { name: 'Source & freshness' })
      const eyebrow = provenance.locator('.eyebrow')
      await expect(eyebrow).toHaveText('Listing information')
      await expect(eyebrow).toBeVisible()
      const contrast = await eyebrow.evaluate((element) => {
        const foreground = getComputedStyle(element).color
        const surface = getComputedStyle(
          element.closest('.store-detail__provenance')!,
        ).backgroundColor
        const luminance = (value: string) => {
          const channels = value
            .match(/[\d.]+/gu)!
            .slice(0, 3)
            .map((channel) => Number(channel) / (value.startsWith('color(srgb ') ? 1 : 255))
          const linear = channels.map((channel) =>
            channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
          )
          return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
        }
        const [lighter, darker] = [luminance(foreground), luminance(surface)].sort(
          (first, second) => second - first,
        )
        return (lighter! + 0.05) / (darker! + 0.05)
      })
      expect(contrast, `${theme} provenance eyebrow contrast`).toBeGreaterThanOrEqual(4.5)

      const detailDisclosure = provenance.getByText(disclosureText)
      await expect(detailDisclosure).toBeVisible()
      expect(
        await detailDisclosure.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return (
            rect.width > 0 && rect.height > 0 && element.closest('[aria-hidden="true"]') === null
          )
        }),
      ).toBe(true)

      await page.goto('/stores')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    }
  }
})
