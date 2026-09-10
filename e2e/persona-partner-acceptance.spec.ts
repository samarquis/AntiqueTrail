import { expect, test } from '@playwright/test'

const recipientInvitationUrl = (token: string) =>
  `/trip-invitations?reviewAs=shopper-b&reviewState=success#token=${token}`

test.describe('issue 320 synthetic one-trip partner acceptance', () => {
  test('recipient accepts one invitation through the settled canonical plan transition', async ({
    page,
  }, testInfo) => {
    await page.goto('/trips?reviewAs=shopper-b&reviewState=success')
    await expect(page.getByText('No trips yet.')).toBeVisible()
    await expect(page.getByText("Avery's antique day")).toHaveCount(0)

    await page.goto(recipientInvitationUrl('review-trip-invite-shopper-b'))
    await expect(page.getByRole('status')).toHaveText('You joined this one trip as Trip Partner.')
    await expect(page.getByRole('link', { name: 'Open shared trip' })).toHaveAttribute(
      'href',
      '/trips/trip-a/plan',
    )
    await page.screenshot({ path: testInfo.outputPath('accepted-partner.png'), fullPage: true })

    await page.getByRole('link', { name: 'Open shared trip' }).click()
    await expect(page).toHaveURL(/\/trips\/trip-a\/plan$/)
    await expect(page.getByRole('heading', { level: 1, name: "Avery's antique day" })).toBeVisible()
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()
    await expect(page.getByText('Creator private rating 5 — Walnut secretary')).toHaveCount(0)
    await expect(page.getByText('Unrelated creator trip')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('shared-trip-plan.png'), fullPage: true })
  })

  for (const token of [
    'not-a-fixture-token',
    'review-trip-invite-expired-shopper-b',
    'review-trip-invite-revoked-shopper-b',
    'review-trip-invite-shopper-a',
  ]) {
    test(`denies the ${token} recipient fixture`, async ({ page }) => {
      await page.goto(recipientInvitationUrl(token))
      await expect(page.getByRole('alert')).toContainText(/couldn't update this trip/i)
      await expect(page.getByText("Avery's antique day")).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Open shared trip' })).toHaveCount(0)
    })
  }
})
