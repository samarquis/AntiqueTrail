import { expect, test } from '@playwright/test'

const STORE_ID = '10000000-0000-4000-8000-000000000001'
const claimUrl = (state = 'success') =>
  `/partner/claim?reviewAs=shopper-a&reviewState=${state}&claimStore=${STORE_ID}`

async function acceptTerms(page: import('@playwright/test').Page) {
  await page.getByRole('checkbox', { name: /read the updated material terms/i }).check()
  await page.getByRole('checkbox', { name: /continue voluntarily/i }).check()
  await page.getByRole('button', { name: 'Accept updated terms' }).click()
}

test('ordinary-account claim is exact and never exposes submitted evidence', async ({
  page,
}, testInfo) => {
  await page.goto(claimUrl())
  await acceptTerms(page)
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
  await page.getByLabel('Evidence reference').fill('case-ref-170')
  await page.getByRole('button', { name: 'Submit authority signal' }).click()
  await expect(page.getByText('Claim status: verification_pending.')).toBeVisible()
  await expect(page.getByText('case-ref-170')).toHaveCount(0)
  await expect(
    page.getByText(/another claimant|other claimant|authority signals verified/i),
  ).toHaveCount(0)
  if (process.env.CAPTURE_ISSUE_170_EVIDENCE === 'true') {
    await page.screenshot({
      path: `docs/evidence/issue-170/${testInfo.project.name}-verification-pending.png`,
      fullPage: true,
    })
  }
})

test('loading, empty, error, changes-requested, and conflict states are truthful', async ({
  page,
}) => {
  await page.goto(claimUrl('loading'))
  await expect(page.getByText('Checking material terms…')).toBeVisible()

  await page.goto(claimUrl('empty'))
  await expect(page.getByText('Checking material terms…')).toHaveCount(0)
  await expect(page.getByText(/Claim status:/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Accept updated terms' })).toBeVisible()

  await page.goto(claimUrl('error'))
  await expect(page.getByRole('alert')).toContainText("We couldn't continue this invitation")

  await page.goto(claimUrl('permission-denied'))
  await expect(page.getByText('Claim status: changes_requested.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request authority recheck' })).toBeVisible()

  await page.goto(claimUrl('blocked'))
  await expect(page.getByText('Claim status: conflict.')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('administrator review')
  await expect(page.getByRole('button', { name: 'Request authority recheck' })).toBeVisible()
  await expect(page.getByLabel('Evidence reference')).toHaveCount(0)
})

test('keyboard focus, semantic live status, and forced colors remain usable', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto(claimUrl('loading'))
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('status').first()).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
})
