import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
async function open(page: import('@playwright/test').Page, state = 'success') {
  await page.goto(`/for-stores?reviewAs=anonymous&reviewState=${state}`)
  await expect(
    page.getByRole('heading', {
      name: 'Help antique shoppers find your store—and make it part of the trip.',
    }),
  ).toBeVisible()
}
test('Free page retains Browse as front door and hands an exact claim through sign-in', async ({
  page,
}) => {
  await open(page)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveText(
    /Browse.*My Trip.*More/,
  )
  await page.getByRole('button', { name: 'Add or claim my store' }).first().click()
  await expect(page.getByRole('heading', { name: 'Find your store first' })).toBeFocused()
  await page.getByLabel('Public store name').fill('Blue Finch')
  await page.getByRole('button', { name: 'Search stores' }).click()
  await page.getByRole('link', { name: 'Claim Blue Finch Curios' }).click()
  await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/)
  const target = new URL(page.url()).searchParams.get('returnTo')
  expect(target).toContain('/partner/claim?claimStore=')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
test('missing-store selection preserves the add journey through sign-in', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Add or claim my store' }).last().click()
  await page.getByLabel('Public store name').fill('No matching synthetic store')
  await page.getByRole('button', { name: 'Search stores' }).click()
  await expect(page.getByRole('status')).toHaveText('No matching listing was found.')
  await page.getByRole('link', { name: /My store is missing/ }).click()
  await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/)
  expect(new URL(page.url()).searchParams.get('returnTo')).toContain('/stores/add')
})
test('unavailable stage collects nothing', async ({ page }) => {
  await open(page, 'blocked')
  await page.getByRole('button', { name: 'Add or claim my store' }).first().click()
  await expect(page.getByRole('status')).toContainText('Store applications are not open yet')
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByText(/waitlist|monthly plan|rank higher|limited time/i)).toHaveCount(0)
})
test('responsive, 200 percent text, keyboard, dark and forced-colors remain accessible', async ({
  page,
}, info) => {
  await open(page)
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await page.getByRole('button', { name: 'Add or claim my store' }).first().focus()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'See what shoppers experience' }).first(),
  ).toBeFocused()
  expect(
    (
      await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: `docs/evidence/issue-172/${info.project.name}-200pct.png`,
    fullPage: true,
  })
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(page.getByRole('button', { name: 'Add or claim my store' }).first()).toBeVisible()
})
