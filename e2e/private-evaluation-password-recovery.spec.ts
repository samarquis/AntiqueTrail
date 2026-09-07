import { expect, test } from '@playwright/test'

test.describe('issue #252 password recovery', () => {
  test('routes a recovery callback to a scrubbed, dedicated replacement form', async ({ page }) => {
    await page.goto(
      '/auth/callback?reviewAs=shopper-a&reviewState=success&returnTo=%2Fstores#token_hash=review-recovery-a&type=recovery',
    )

    await expect(page).toHaveURL(/\/auth\/recovery\?returnTo=%2Fstores$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Set a new password' })).toBeFocused()
    const newPassword = page.getByRole('textbox', { name: 'New password', exact: true })
    const confirmPassword = page.getByRole('textbox', {
      name: 'Confirm new password',
      exact: true,
    })
    await expect(newPassword).toHaveAttribute('autocomplete', 'new-password')
    await expect(confirmPassword).toHaveAttribute('autocomplete', 'new-password')
    await expect(page).not.toHaveURL(/token_hash|review-recovery-a/)
    await expect(page.locator('body')).not.toContainText('review-recovery-a')
    await expect
      .poll(() =>
        page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
      )
      .toEqual({ local: [], session: [] })

    await newPassword.fill('short')
    await confirmPassword.fill('short')
    await page.getByRole('button', { name: 'Set new password' }).click()
    await expect(page.getByRole('alert')).toHaveText(/12 through 128 characters/i)
  })
})
