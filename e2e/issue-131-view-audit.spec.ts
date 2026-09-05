import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('selected record audit and direct-route denial', async ({ page }) => {
  await page.goto('/admin?reviewAs=administrator')
  await page.getByRole('button', { name: 'Review Blue Finch Curios' }).click()
  await page.getByLabel('Decision reason').fill('Retain my exact review context')
  await page.getByRole('button', { name: /View Audit for/ }).click()
  await expect(page).toHaveURL(/\/admin\/audit$/)
  await expect(page.getByRole('heading', { name: 'View Audit' })).toBeFocused()
  await expect(page.getByRole('region', { name: 'Record audit' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  for (const width of [1280, 768, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(page.getByRole('link', { name: 'Back to Review' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to Review' }).click()
  await expect(page.getByLabel('Decision reason')).toHaveValue('Retain my exact review context')
  await expect(page.getByRole('button', { name: /View Audit for/ })).toBeFocused()
  await page.goto('/admin/audit?reviewAs=administrator')
  await expect(page.getByRole('alert')).toContainText('This item is not available.')
  await expect(page.getByRole('region', { name: 'Record audit' })).toHaveCount(0)
})

test('grant audit uses its exact scope and refresh loses the reference', async ({ page }) => {
  await page.goto('/admin/access?reviewAs=administrator')
  await page
    .getByRole('button', { name: /View Audit for/ })
    .first()
    .click()
  await expect(page.getByRole('region', { name: 'Record audit' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Record audit' })).toHaveCount(0)
})
