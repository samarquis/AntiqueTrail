import { expect, test, type Page } from '@playwright/test'

async function activateLinkByKeyboard(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true })
  for (
    let step = 0;
    step < 60 && !(await link.evaluate((element) => element === document.activeElement));
    step += 1
  ) {
    await page.keyboard.press('Tab')
  }
  await expect(link).toBeFocused()
  await page.keyboard.press('Enter')
}

async function expectFocusedHeading(page: Page, name: string) {
  const heading = page.getByRole('heading', { level: 1, name })
  await expect(heading).toBeVisible({ timeout: 30_000 })
  await expect(heading).toBeFocused()
}

test('anonymous Help routes corrections and recovery at 320px by keyboard', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/more')
  await expectFocusedHeading(page, 'More')
  await activateLinkByKeyboard(page, 'Help')

  await expect(page).toHaveURL(/\/help$/)
  await expectFocusedHeading(page, 'Help')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await activateLinkByKeyboard(page, 'Browse stores')
  await expect(page).toHaveURL(/\/stores$/)
  await activateLinkByKeyboard(page, 'Blue Finch Curios')
  await activateLinkByKeyboard(page, 'Suggest a correction')
  await expect(page).toHaveURL(/\/stores\/blue-finch-curios\/correction$/)
  await expectFocusedHeading(page, 'Suggest a correction')

  await page.goto('/help')
  await activateLinkByKeyboard(page, 'Start account recovery')
  await expect(page).toHaveURL(/\/auth\/recovery$/)
  await expectFocusedHeading(page, 'Recover your account')
  expect(consoleErrors).toEqual([])
})
