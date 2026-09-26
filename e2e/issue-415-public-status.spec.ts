import { expect, test } from '@playwright/test'

test('public status explains availability and reaches Help and Browse', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/status')

  await expect(page.getByRole('heading', { level: 1, name: 'Service status' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(
    'Browsing fictional store listings is available',
  )
  await expect(page.getByRole('status')).toContainText(
    'Live service updates and support contacts are not published',
  )
  await expect(page.getByText(/S-01|release gate|monitoring/i)).toHaveCount(0)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)

  for (const name of ['Help', 'Browse stores']) {
    const target = await page.getByRole('link', { name, exact: true }).boundingBox()
    expect(target?.width).toBeGreaterThanOrEqual(48)
    expect(target?.height).toBeGreaterThanOrEqual(48)
  }

  await page.getByRole('link', { name: 'Help' }).click()
  await expect(page).toHaveURL(/\/help$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible()

  await page.goto('/status')
  await page.getByRole('link', { name: 'Browse stores' }).click()
  await expect(page).toHaveURL(/\/stores$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Browse stores' })).toBeVisible()
  expect(consoleErrors).toEqual([])
})
