import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('Administrator can prepare, freeze, and review a bounded RG-01 run', async ({ page }) => {
  await page.goto('/admin/evidence/rg-01?reviewAs=administrator&reviewState=success')
  await expect(page.getByRole('heading', { name: 'Evidence runs' })).toBeVisible()
  await expect(page.getByRole('link', { name: /11111111-1111/ })).toBeVisible()
  await page.getByRole('link', { name: /11111111-1111/ }).click()
  await expect(page.getByRole('heading', { name: /11111111-1111/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /freeze current calculation/iu })).toBeVisible()
  await page.getByRole('button', { name: /freeze current calculation/iu }).click()
  await expect(page.getByText('Current', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /review frozen digest/iu })).toBeVisible()
  await page.getByRole('button', { name: /review frozen digest/iu }).click()
  await expect(page.getByRole('heading', { name: /review frozen rg-01 evidence/iu })).toBeVisible()
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  expect(await new AxeBuilder({ page }).analyze()).toMatchObject({ violations: [] })
})

test('missing Administrator/session is denied without private evidence', async ({ page }) => {
  await page.goto('/admin/evidence/rg-01')
  await expect(page.getByRole('heading', { name: /browse stores/iu })).toBeVisible()
  await expect(page.getByText(/manifest digest|subject|dedup/iu)).toHaveCount(0)
})
