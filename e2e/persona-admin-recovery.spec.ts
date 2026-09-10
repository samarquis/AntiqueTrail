import { expect, test } from '@playwright/test'

const reviewUrl = (mode: 'stale' | 'pending' | 'interrupted') =>
  `/admin?reviewAs=administrator&reviewState=success&reviewAdminDecision=${mode}`

async function openApproval(page: import('@playwright/test').Page) {
  await page.goto(reviewUrl('stale'))
  await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
  await page.getByRole('button', { name: 'Review Blue Finch Curios' }).click()
  await page.getByLabel('Decision reason').fill('Address confirmed from submitted evidence')
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
}

test.describe('Administrator recovery diagnostic (#326, local fixture only)', () => {
  test('rejects a stale decision, retains its reason, and refreshes before reapplying', async ({
    page,
  }) => {
    await openApproval(page)
    await page.getByRole('button', { name: 'Confirm approve', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('This case changed before your decision')
    await expect(page.getByLabel('Confirm case decision')).toHaveCount(0)
    await expect(page.getByLabel('Decision reason')).toHaveValue(
      'Address confirmed from submitted evidence',
    )
    const refresh = page.getByRole('button', { name: 'Refresh case' })
    await expect(refresh).toBeFocused()
    await refresh.click()
    await expect(page.getByRole('status')).toHaveCount(0)
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm approve', exact: true }).click()
    await expect(page.getByLabel('Resolved case outcome')).toContainText('Case case-1 is approved.')
  })

  test('coalesces repeated confirmation while the exact decision is pending', async ({ page }) => {
    await page.goto(reviewUrl('pending'))
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
    await page.getByRole('button', { name: 'Review Blue Finch Curios' }).click()
    await page.getByLabel('Decision reason').fill('Address confirmed from submitted evidence')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    const confirm = page.getByRole('button', { name: 'Confirm approve', exact: true })
    await confirm.dblclick()
    const applying = page.getByRole('button', { name: 'Applying decision…' })
    await expect(applying).toBeDisabled()
    await expect(applying).toBeFocused()
    await expect(page.getByLabel('Resolved case outcome')).toContainText('Case case-1 is approved.')
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeFocused()
    await expect(page.getByRole('status')).not.toContainText('could not be completed')
  })

  test('reload during a pending decision reports no fabricated success and reconciles the fixture state', async ({
    page,
  }) => {
    await page.goto(reviewUrl('interrupted'))
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
    await page.getByRole('button', { name: 'Review Blue Finch Curios' }).click()
    await page.getByLabel('Decision reason').fill('Address confirmed from submitted evidence')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm approve', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Applying decision…' })).toBeDisabled()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review Blue Finch Curios' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Review Juniper House Antiques' })).toBeVisible()
    await expect(page.getByText('Case approved.', { exact: true })).toHaveCount(0)
  })
})
