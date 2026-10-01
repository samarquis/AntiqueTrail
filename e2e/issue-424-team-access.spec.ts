import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('Store Owner can submit a team invitation from a narrow workspace by keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/owner/stores?reviewAs=store-owner&reviewState=success')
  await page.getByRole('button', { name: 'Manage team access for Blue Finch Curios' }).click()

  await expect(page.getByText('No team members or pending invitations.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  const email = page.getByLabel('Verified teammate email')
  await email.fill('editor@example.test')
  await page.getByLabel('Store role').selectOption('listing_editor')
  await email.press('Enter')
  await expect(
    page.getByRole('status').filter({
      hasText: 'If that verified account exists, an invitation is ready to accept.',
    }),
  ).toBeVisible()

  await page.goto('/owner/invitations?reviewAs=store-owner&reviewState=success')
  await expect(page.getByRole('heading', { name: 'Team invitations' })).toBeVisible()
  await expect(page.getByText('No pending team invitations.')).toBeVisible()
})
