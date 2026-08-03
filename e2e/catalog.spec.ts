import { expect, test } from '@playwright/test'

test.describe('Synthetic catalog journey', () => {
  test('browses, filters, and opens a store without permission prompts', async ({ page }) => {
    const permissionPrompts: string[] = []
    page.on('dialog', (dialog) => permissionPrompts.push(dialog.type()))

    await page.goto('/stores')
    await expect(page.getByRole('heading', { name: 'Browse stores' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Blue Finch Curios' })).toBeVisible()

    await page.getByLabel('Search stores').fill('Cedar')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByRole('link', { name: 'Cedar & Brass' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Blue Finch Curios' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Cedar & Brass' }).click()
    await expect(page.getByRole('heading', { name: 'Cedar & Brass' })).toBeVisible()
    expect(permissionPrompts).toEqual([])
  })

  test('keeps zero-result and not-found states explicit', async ({ page }) => {
    await page.goto('/stores?q=does-not-exist')
    await expect(page.getByText('No stores match those filters.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible()

    await page.goto('/stores/not-a-real-store')
    await expect(page.getByRole('heading', { name: 'Store not found' })).toBeVisible()
  })
})
