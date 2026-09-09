import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
const query = (state: string) =>
  `reviewAs=representative&reviewState=success&reviewBilling=${state}&reviewPurchase=free`
test('paid disclosures and fresh consent are accessible at narrow width', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto(`/for-stores?${query('sales_open')}`)
  await expect(page.getByRole('heading', { name: 'Optional photo memberships' })).toBeVisible()
  await expect(page.getByText(/Gallery: cover plus 15.*\$12.00/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add or claim my store' }).first()).toBeVisible()
  await page.goto(`/store-portal/plans?${query('sales_open')}`)
  await expect(page.getByRole('heading', { name: 'Photo plans', exact: true })).toBeVisible()
  const checkout = page.getByRole('button', { name: 'Continue to secure Checkout' })
  await expect(checkout).toBeDisabled()
  await page.getByRole('checkbox').check()
  await expect(checkout).toBeEnabled()
  await page.getByRole('combobox').selectOption('full_gallery')
  await expect(checkout).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('paid-plans.png'), fullPage: true })
  const a11y = await new AxeBuilder({ page }).include('main').analyze()
  expect(a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  )
})
test('off and servicing hide public prices while Free acquisition stays available', async ({
  page,
}) => {
  for (const state of ['off_prelaunch', 'servicing_only']) {
    await page.goto(`/for-stores?${query(state)}`)
    await expect(page.getByRole('button', { name: 'Add or claim my store' }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Optional photo memberships' })).toHaveCount(0)
    await expect(page.getByText(/\$12\.00|\$19\.00/)).toHaveCount(0)
    await page.goto(`/store-portal/plans?${query(state)}`)
    await expect(page.getByRole('button', { name: 'Continue to secure Checkout' })).toHaveCount(0)
    if (state === 'servicing_only')
      await expect(page.getByRole('button', { name: 'Cancel paid membership' })).toBeVisible()
    else await expect(page.getByRole('heading', { name: 'Photo membership' })).toHaveCount(0)
  }
})
