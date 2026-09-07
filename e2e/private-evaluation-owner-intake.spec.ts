import { expect, test } from '@playwright/test'

test('synthetic availability adapter permits the normal owner search branch', async ({ page }) => {
  await page.goto('/for-stores?reviewAs=anonymous&reviewState=success')
  await expect(page.getByRole('heading', { name: /Help antique shoppers/ })).toBeVisible()
  await page.getByRole('button', { name: 'Add or claim my store' }).first().click()
  await page.getByLabel('Public store name').fill('Blue Finch')
  await page.getByRole('button', { name: 'Search stores' }).click()
  await expect(page.getByRole('link', { name: 'Claim Blue Finch Curios' })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
})

test('synthetic closed intake presents no collection controls', async ({ page }) => {
  await page.goto('/for-stores?reviewAs=anonymous&reviewState=blocked')
  await expect(page.getByRole('heading', { name: /Help antique shoppers/ })).toBeVisible()
  await page.getByRole('button', { name: 'Add or claim my store' }).first().click()
  await expect(page.getByRole('status')).toContainText('Store applications are not open yet')
  await expect(page.getByRole('textbox')).toHaveCount(0)
})
