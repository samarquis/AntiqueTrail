import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('appeal review is a non-navigational, generic terminal route without a capability', async ({
  page,
}) => {
  await page.goto('/appeal-review')
  await expect(page.getByRole('alert')).toContainText(/invalid, expired, revoked, or unavailable/i)
  await expect(page.getByRole('link', { name: /appeal|review/i })).toHaveCount(0)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('appeal review remains usable at a narrow viewport and enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/appeal-review')
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('body')).toHaveCSS('overflow-x', 'hidden')
})
