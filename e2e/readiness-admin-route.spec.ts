import { expect, test } from '@playwright/test'

const reviewUrl = (path: string, identity: string, state = 'success') =>
  `${path}?reviewAs=${identity}&reviewState=${state}`

test('administrator readiness route renders the bounded workspace', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(reviewUrl('/admin/readiness', 'administrator'))
  await expect(page.getByRole('heading', { name: /regional readiness operations/i })).toBeVisible()
  await expect(page.getByText(/no accepted synthetic subjects yet/i)).toBeVisible()
})

test('non-administrator readiness access redirects without exposing the workspace', async ({
  page,
}) => {
  await page.goto(reviewUrl('/admin/readiness', 'shopper-a'))
  await expect(page).toHaveURL(/\/stores/)
  await expect(page.getByRole('heading', { name: /regional readiness operations/i })).toHaveCount(0)
})
