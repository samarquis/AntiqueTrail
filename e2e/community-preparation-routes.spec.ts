import { expect, test } from '@playwright/test'

const runId = '00000000-0000-4000-8000-000000000263'
const admin = '?reviewAs=administrator&reviewState=success'

test.describe('issue #263 community preparation and current-area gate', () => {
  test('administrator reaches the bounded preparation list and exact run detail', async ({
    page,
  }) => {
    await page.goto(`/admin/more${admin}`)
    await page.getByRole('link', { name: 'Communities' }).click()
    await expect(page).toHaveURL(/\/admin\/communities$/)
    await expect(page.getByRole('heading', { name: 'Communities' })).toBeVisible()
    await expect(page.getByText('Cedar Valley')).toBeVisible()
    await page.getByRole('link', { name: 'Cedar Valley' }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/communities/${runId}`))
    await expect(page.getByRole('heading', { name: 'Cedar Valley' })).toBeVisible()
    await expect(
      page.getByText('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toBeVisible()
    await expect(page.getByText(/Nothing here activates public visibility/)).toHaveCount(0)
  })

  test('exact current-area gate exposes predicates and records the separate tester decision', async ({
    page,
  }) => {
    await page.goto(`/admin/communities/${runId}/gate${admin}`)
    await expect(page.getByRole('heading', { name: 'Community Expansion Gate' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Gate predicate outcomes' })).toContainText(
      'monitoring: true',
    )
    await expect(page.getByRole('button', { name: 'Pass gate' })).toBeVisible()
    await page.getByRole('button', { name: 'Pass gate' }).click()
    await expect(page.getByRole('status')).toContainText('Current-area gate passed.')
  })

  test('the route reflows at 320 CSS pixels and keeps keyboard focus visible', async ({ page }) => {
    await page.goto(`/admin/communities/${runId}/gate${admin}`)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.getByRole('link', { name: 'Back to run' }).focus()
    await expect(page.getByRole('link', { name: 'Back to run' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
  })
})
