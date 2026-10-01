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

test('Owner billing status reports unavailable data without leaking partial state', async ({
  page,
}) => {
  await openOwnerBillingStatus(page, 'unavailable')

  await expect(page.getByRole('alert')).toContainText(
    "We couldn't complete this billing action. Please try again.",
  )
  await expect(page.getByText('Free')).toHaveCount(0)
  await expect(page.getByText('Gallery')).toHaveCount(0)
  await expect(page.getByText('No paid subscription')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /upgrade|change|cancel|refund|payment/i }),
  ).toHaveCount(0)
})

test('Representative retains the existing paid servicing route', async ({ page }) => {
  await page.goto(
    '/store-portal/billing?reviewAs=representative&reviewState=success&reviewBilling=servicing_only',
  )

  await expect(page.getByRole('heading', { name: 'Photo membership' })).toBeVisible()
  await expect(page.getByText(/Current plan: Gallery · Paid through/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel paid membership' })).toBeVisible()
})

test('revoked Owner cannot load billing status or see billing details', async ({ page }) => {
  await page.goto(
    '/store-portal/billing?reviewAs=store-owner&reviewState=success&reviewSession=revoked&reviewBilling=off_prelaunch',
  )
  await expect(page.getByRole('heading', { name: 'Store Portal unavailable' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'Store Portal access is unavailable for this account or session.',
  )
  await expect(page.getByRole('heading', { name: 'Billing status' })).toHaveCount(0)
  await expect(page.getByText('Free')).toHaveCount(0)
  await expect(page.getByText('No paid subscription')).toHaveCount(0)
})
