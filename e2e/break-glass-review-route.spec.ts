import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('invalid packet link is generic, scrubbed, and accessible', async ({ page }) => {
  await page.goto(`/break-glass-review#token=${'A'.repeat(43)}`)
  await expect(page.getByRole('heading', { name: 'Review one closed access packet' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('invalid, expired, or unavailable')
  expect(new URL(page.url()).hash).toBe('')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
