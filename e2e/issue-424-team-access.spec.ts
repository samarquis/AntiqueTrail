import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('Store Owner can submit a team invitation from a narrow workspace by keyboard', async ({
  page,
}) => {
  // 320 CSS px also covers the effective narrow layout required at 200% zoom.
  await page.setViewportSize({ width: 320, height: 812 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce', forcedColors: 'active' })
  await page.goto('/owner/stores?reviewAs=store-owner&reviewState=success')
  await page.addStyleTag({
    content:
      '* { letter-spacing: 0.12em !important; line-height: 1.5 !important; word-spacing: 0.16em !important; }',
  })
  await page.getByRole('button', { name: 'Manage team access for Blue Finch Curios' }).click()

  await expect(page.getByText('Jordan Editor — Listing Editor')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await page.getByRole('button', { name: 'Remove Jordan Editor' }).click()
  await expect(page.getByRole('group', { name: 'Confirm team access removal' })).toBeVisible()
  await expect(page.getByText('Jordan Editor — Listing Editor')).toBeVisible()
  await page.getByRole('button', { name: 'Keep access' }).click()
  await expect(page.getByText('Jordan Editor — Listing Editor')).toBeVisible()
  await page.getByRole('button', { name: 'Remove Jordan Editor' }).click()
  await page.getByRole('button', { name: 'Confirm remove Jordan Editor' }).click()
  await expect(page.getByText('Jordan Editor — Listing Editor')).toHaveCount(0)

  const email = page.getByLabel('Verified teammate email')
  await email.fill('editor@example.test')
  await page.getByLabel('Store role').selectOption('listing_editor')
  await email.press('Enter')
  await expect(
    page.getByRole('status').filter({
      hasText: 'If that verified account exists, an invitation is ready to accept.',
    }),
  ).toBeVisible()
  await expect(page.getByText('Listing Editor — awaiting acceptance')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel Listing Editor invitation' }).click()
  await expect(page.getByText('Listing Editor — awaiting acceptance')).toHaveCount(0)

  await page.goto('/owner/invitations?reviewAs=store-owner&reviewState=success')
  await expect(page.getByRole('heading', { name: 'Team invitations' })).toBeVisible()
  await expect(page.getByText('No pending team invitations.')).toBeVisible()
})

test('Site Admin can remove synthetic team access through the review console', async ({ page }) => {
  await page.goto('/admin/partners?reviewAs=administrator&reviewState=success')
  await page.getByLabel('Exact claim ID').fill('claim-synthetic')
  await page.getByRole('button', { name: 'Open exact claim' }).click()
  await expect(page.getByText('Jordan Editor — Listing Editor')).toBeVisible()
  await page.getByRole('button', { name: 'Remove team access for Jordan Editor' }).click()
  await expect(page.getByRole('group', { name: 'Confirm team access removal' })).toBeVisible()
  await expect(page.getByText('Jordan Editor — Listing Editor')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm remove Jordan Editor' }).click()
  await expect(page.getByText('Jordan Editor — Listing Editor')).toHaveCount(0)
})
