import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function openOwnerBillingStatus(page: Page, billingState: string) {
  await page.goto(
    `/owner/stores?reviewAs=store-owner&reviewState=success&reviewBilling=${billingState}`,
  )
  await page.getByRole('button', { name: 'Open Blue Finch Curios' }).click()
  await page.getByRole('link', { name: 'Billing status' }).click()
  await expect(page.getByRole('heading', { name: 'Billing status' })).toBeVisible()
}

test('Owner billing status shows actual state without paid actions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })

  for (const state of ['off_prelaunch', 'servicing_only', 'sales_open']) {
    await openOwnerBillingStatus(page, state)

    if (state === 'off_prelaunch') {
      await expect(page.getByText('Free')).toBeVisible()
      await expect(page.getByText('No paid subscription')).toBeVisible()
      await expect(page.getByText('Paid plan sales are closed.')).toBeVisible()
    } else {
      await expect(page.getByText('Gallery')).toBeVisible()
      await expect(page.getByText('Active', { exact: true })).toBeVisible()
      await expect(page.getByText('Oct 1, 2026')).toBeVisible()
      await expect(
        page.getByText(state === 'sales_open' ? 'Open' : 'Closed', { exact: true }),
      ).toBeVisible()
      if (state === 'servicing_only')
        await expect(page.getByText('Paid plan sales are closed.')).toBeVisible()
    }

    await expect(
      page.getByText('No billing actions are available in this workspace.'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /upgrade|change|cancel|refund|payment/i }),
    ).toHaveCount(0)
    await expect(page.getByText(/\$|USD|Stripe/i)).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  }
})
