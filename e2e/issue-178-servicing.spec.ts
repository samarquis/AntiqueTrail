import { expect, test } from '@playwright/test'

const route = (state: string) =>
  `/store-portal/billing?reviewAs=representative&reviewState=success&reviewBilling=${state}`

test('servicing-only cancellation preserves future intent until explicit confirmation', async ({
  page,
}) => {
  await page.goto(route('servicing_only'))
  await expect(page.getByRole('heading', { name: 'Photo membership' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review Full Gallery upgrade' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel paid membership' }).click()
  await expect(page.getByRole('heading', { name: 'Confirm cancellation' })).toBeVisible()
  await expect(page.getByText(/This replaces the scheduled change to Free/)).toBeVisible()
  await page.getByRole('button', { name: 'Keep current arrangement' }).click()
  await expect(page.getByText(/Scheduled change: Free/)).toBeVisible()
  await expect(page.getByText(/Request recorded/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel paid membership' }).click()
  await page.getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByText(/Request recorded/)).toBeVisible()
  await expect(page.getByText(/Current plan: Gallery/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('upgrade displays future cancellation and requires fresh consent at 320 pixels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto(route('sales_open'))
  await page.getByRole('button', { name: 'Review Full Gallery upgrade' }).click()
  await expect(page.getByText(/Your accepted change to Free/)).toBeVisible()
  const confirm = page.getByRole('button', { name: 'Confirm change' })
  await expect(confirm).toBeDisabled()
  await page.getByRole('checkbox', { name: /I agree to this paid change/ }).check()
  await expect(confirm).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await confirm.click()
  await expect(page.getByText(/awaiting verification or reconciliation/)).toBeVisible()
})

test('staged-off membership exposes no prices or paid controls', async ({ page }) => {
  await page.goto(route('off_prelaunch'))
  await expect(page.getByRole('heading', { name: 'Photo membership' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancel paid membership' })).toHaveCount(0)
  await expect(page.getByText('$19.00')).toHaveCount(0)
})
