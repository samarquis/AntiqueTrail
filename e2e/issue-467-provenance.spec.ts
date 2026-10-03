import { expect, test } from '@playwright/test'

const disclosureText = 'Fictional listing for product review.'
const freshnessStates = ['current', 'stale', 'unknown'] as const

test('keeps fictional disclosure beside freshness on Browse and Details', async ({ page }) => {
  await page.goto('/stores')
  await expect(page.locator('.catalog-card')).toHaveCount(12)
  await expect(page.locator('.catalog-card .listing-fictional-disclosure')).toHaveCount(12)

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

    await expect(
      page.getByLabel('Listing status').locator(`.status-badge--${status}`),
    ).toBeVisible()
    const provenance = page.getByRole('region', { name: 'Source & freshness' })
    const detailDisclosure = provenance.getByText(disclosureText)
    await expect(detailDisclosure).toBeVisible()
    expect(
      await detailDisclosure.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && element.closest('[aria-hidden="true"]') === null
      }),
    ).toBe(true)

    await page.goto('/stores')
  }
})
