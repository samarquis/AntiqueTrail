import { expect, test, type Page } from '@playwright/test'
async function open(page: Page, state = 'success') {
  await page.goto(`/stores/add?reviewAs=shopper-a&reviewState=${state}`)
  if (state !== 'success') return
  await page.getByRole('checkbox', { name: /read the updated material terms/i }).check()
  await page.getByRole('checkbox', { name: /continue voluntarily/i }).check()
  await page.getByRole('button', { name: 'Accept updated terms' }).click()
}
async function start(page: Page) {
  await page.getByLabel('Store name', { exact: true }).fill('Synthetic Maple Antiques')
  await page.getByLabel('Street address in Topeka').fill('171 Fictional Street')
  await page.getByRole('button', { name: 'Search existing listings' }).click()
  await page.getByRole('button', { name: 'Continue add-store application' }).click()
  await page.getByLabel('Primary category').selectOption({ label: 'Antiques' })
  await page.getByLabel('Short summary').fill('A synthetic store')
  await page.getByLabel('Description', { exact: true }).fill('Antiques and vintage pieces')
  await page.getByRole('group', { name: 'Monday', exact: true }).getByLabel('Closed').uncheck()
  await page.getByRole('checkbox', { name: /I confirm these store facts/ }).check()
}
test('ordinary account searches, saves, supplies evidence and submits without a grant', async ({
  page,
}) => {
  await open(page)
  await start(page)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()
  await page.getByLabel('Evidence reference', { exact: true }).fill('synthetic-proof')
  await page.getByRole('button', { name: 'Submit evidence reference' }).click()
  await expect(page.getByLabel('Evidence reference', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Application status: submitted.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Store Portal' })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('synthetic-proof')
})
test('duplicate conversion names the exact listing and requires confirmation', async ({ page }) => {
  await open(page, 'blocked')
  await start(page)
  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Application status: duplicate review.')).toBeVisible()
  await expect(page.getByText('Blue Finch Curios / 100 Fictional Street')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm existing listing and continue claim' }).click()
  await expect(page.getByRole('link', { name: 'Continue the existing-store claim' })).toBeVisible()
  await expect(page.getByText('Application status: withdrawn.')).toBeVisible()
})
test('failed save preserves entered facts', async ({ page }) => {
  await open(page, 'permission-denied')
  await start(page)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Your entered draft is still here')
  await expect(page.getByLabel('Short summary')).toHaveValue('A synthetic store')
})
test('keyboard, dark and forced-colors rendering stay within viewport', async ({ page }, info) => {
  await open(page)
  await start(page)
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await page.getByLabel('Short summary').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Description', { exact: true })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({
    path: `docs/evidence/issue-171/${info.project.name}-draft.png`,
    fullPage: true,
  })
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeVisible()
})

test('administrator reviews exact facts and confirms approval', async ({ page }) => {
  await page.goto('/admin/partners?reviewAs=administrator&reviewState=success')
  const panel = page.getByRole('region', { name: 'Add-store review' })
  await panel
    .getByLabel('Application reference', { exact: true })
    .fill('17100000-0000-4000-8000-000000000005')
  await panel.getByRole('button', { name: 'Open and assign application' }).click()
  await expect(panel.getByRole('heading', { name: 'Synthetic Maple Antiques' })).toBeVisible()
  await panel.getByLabel('Decision reason code', { exact: true }).fill('owner_review')
  await panel.getByRole('checkbox', { name: /independently checked/ }).check()
  await panel.getByRole('checkbox', { name: /exact Topeka boundary/ }).check()
  await panel.getByRole('checkbox', { name: /no closure/ }).check()
  await panel.getByRole('button', { name: 'Record verified facts' }).click()
  await expect(panel.getByText('Application status: verification pending.')).toBeVisible()
  await panel.getByRole('button', { name: 'Review approval' }).click()
  await expect(
    panel.getByText(/Approve Synthetic Maple Antiques at 171 Fictional Street/),
  ).toBeVisible()
  await panel.getByRole('button', { name: 'Confirm approval and Free participation' }).click()
  await expect(panel.getByText('Application status: approved.')).toBeVisible()
})
