import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('approved Owner selects an exact store and enters existing Portal', async ({
  page,
}, testInfo) => {
  await page.goto('/owner/stores?reviewAs=store-owner&reviewState=success')
  await expect(page.getByRole('heading', { name: 'Your store workspace' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Blue Finch Curios' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const target = await page.getByRole('button', { name: 'Open Blue Finch Curios' }).boundingBox()
  expect(target?.height).toBeGreaterThanOrEqual(48)
  await page.screenshot({ path: testInfo.outputPath('owner-workspace.png'), fullPage: true })
  await page.getByRole('button', { name: 'Open Blue Finch Curios' }).click()
  await expect(page).toHaveURL(/\/store-portal/)
  await expect(page.getByRole('heading', { name: /Blue Finch Curios/ })).toBeVisible()
  await page.goto('/admin?reviewAs=store-owner&reviewState=success')
  await expect(page).toHaveURL(/\/stores/)
  await expect(page.getByRole('heading', { name: /Administrator workspace/i })).toHaveCount(0)
})

test('revoked Owner session returns to sign-in without exposing store choices', async ({
  page,
}) => {
  await page.goto('/owner/stores?reviewAs=store-owner&reviewState=success&reviewSession=revoked')
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await expect(page.getByRole('button', { name: 'Open Blue Finch Curios' })).toHaveCount(0)
})
test('denied Owner grant exposes recovery without stale store choices', async ({ page }) => {
  await page.goto('/owner/stores?reviewAs=store-owner&reviewState=permission-denied')
  await expect(page.getByRole('alert')).toContainText('Store workspace access is unavailable.')
  await expect(page.getByRole('button', { name: 'Check access again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Blue Finch Curios' })).toHaveCount(0)
})
