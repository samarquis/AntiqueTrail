import { expect, test } from '@playwright/test'

const CLAIM_URL =
  '/partner/claim?reviewAs=representative&reviewState=success&claimStore=10000000-0000-4000-8000-000000000001'

test('staged public claim is exact, reason-neutral, and never exposes submitted evidence', async ({
  page,
}) => {
  await page.goto(CLAIM_URL)

  await page.getByRole('checkbox', { name: /read the updated material terms/i }).check()
  await page.getByRole('checkbox', { name: /continue voluntarily/i }).check()
  await page.getByRole('button', { name: 'Accept updated terms' }).click()
  await expect(
    page.getByText('Selected listing is ready for a server-authoritative claim check.'),
  ).toBeVisible()
  await page.getByLabel('Relationship to the store').fill('Owner')
  await page
    .getByLabel('Authority statement')
    .fill('I am authorized to manage this one exact listing.')
  await page.getByRole('button', { name: 'Submit claim' }).click()

  await expect(page.getByText('Claim status: submitted.')).toBeVisible()
  await expect(page.getByText('Approved scope: this store only (Blue Finch Curios).')).toBeVisible()
  await expect(page.getByText(/another claimant|other claimant/i)).toHaveCount(0)

  await page.getByLabel('Evidence reference').fill('case-ref-170')
  await page.getByRole('button', { name: 'Submit authority signal' }).click()
  await expect(page.getByText('Claim status: verification_pending.')).toBeVisible()
  await expect(page.getByText('case-ref-170')).toHaveCount(0)
  await expect(page.getByText(/authority signals verified/i)).toHaveCount(0)
})
