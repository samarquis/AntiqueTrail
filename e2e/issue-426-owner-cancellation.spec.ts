import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('Owner reviews exact cancellation consequence and pending provider recovery accessibly', async ({
  page,
}) => {
  await page.goto(
    '/owner/stores?reviewAs=store-owner&reviewState=success&reviewBilling=servicing_only&reviewOwnerCancel=available',
  )
  await page.getByRole('button', { name: 'Open Blue Finch Curios' }).click()
  await page.getByRole('link', { name: 'Billing status' }).click()
  await page.getByRole('button', { name: 'Cancel renewal' }).click()
  await expect(
    page.getByRole('heading', { name: 'Confirm cancellation for Blue Finch Curios' }),
  ).toBeVisible()
  await expect(page.getByText(/October 31, 2026/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByRole('status')).toContainText('Confirmation is pending.')
  await expect(page.getByRole('button', { name: 'Cancel renewal' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Refresh billing' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Owner denial requires refresh and never claims provider success', async ({ page }) => {
  await page.goto(
    '/owner/stores?reviewAs=store-owner&reviewState=success&reviewBilling=servicing_only&reviewOwnerCancel=denied',
  )
  await page.getByRole('button', { name: 'Open Blue Finch Curios' }).click()
  await page.getByRole('link', { name: 'Billing status' }).click()
  await page.getByRole('button', { name: 'Cancel renewal' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByRole('alert')).toContainText('Refresh billing before confirming again.')
  await expect(page.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled()
})
