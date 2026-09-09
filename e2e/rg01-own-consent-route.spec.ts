import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const route = '/account/research/rg-01?reviewAs=shopper-a&reviewState=success'

test('eligible shopper can explicitly consent and withdraw without private evidence fields', async ({
  page,
}) => {
  await page.goto(route)
  await expect(page.getByRole('heading', { name: 'RG-01 consent' })).toBeVisible()
  const consent = page.getByRole('checkbox', { name: /agree to participate/i })
  await expect(consent).not.toBeChecked()
  await expect(page.getByRole('button', { name: /give consent/i })).toBeDisabled()
  await consent.check()
  await page.getByRole('button', { name: /give consent/i }).click()
  await expect(page.getByRole('status')).toContainText('Your consent is saved.')
  await page.getByRole('button', { name: /withdraw consent/i }).click()
  await expect(page.getByRole('heading', { name: /withdraw your consent/i })).toBeVisible()
  await page.getByRole('button', { name: /^withdraw consent$/i }).click()
  await expect(page.getByRole('status')).toContainText('Your consent is withdrawn.')
  await expect(page.locator('body')).not.toContainText(/metrics|subject id|dedup|sibling/i)
  await expect(new AxeBuilder({ page }).analyze()).resolves.toEqual(
    expect.objectContaining({ violations: [] }),
  )
})

test('denied RG-01 projection stays generic and offers Retry', async ({ page }) => {
  await page.goto('/account/research/rg-01?reviewAs=shopper-a&reviewState=blocked')
  await expect(page.getByRole('alert')).toContainText('No consent change was saved.')
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/metrics|subject id|dedup|sibling/i)
})

test('More exposes RG-01 only after the server projection is available', async ({ page }) => {
  await page.goto('/more?reviewAs=shopper-a&reviewState=success')
  await expect(page.getByRole('link', { name: 'Research participation' })).toHaveAttribute(
    'href',
    '/account/research/rg-01',
  )
  await page.goto('/more?reviewAs=shopper-a&reviewState=blocked')
  await expect(page.getByRole('link', { name: 'Research participation' })).toHaveCount(0)
})
