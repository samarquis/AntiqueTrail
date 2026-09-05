import { chromium, expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'

test('selected record audit and direct-route denial', async ({ page }) => {
  await page.goto('/admin?reviewAs=administrator')
  await page.getByRole('button', { name: 'Review Blue Finch Curios' }).click()
  await page.getByLabel('Decision reason').fill('Retain my exact review context')
  await page.getByRole('button', { name: /View Audit for/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/admin\/audit$/)
  await expect(page.getByRole('heading', { name: 'View Audit' })).toBeFocused()
  await expect(page.getByRole('region', { name: 'Record audit' })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  for (const width of [1280, 768, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: test.info().outputPath('audit-320.png'), fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(page.getByRole('link', { name: 'Back to Review' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to Review' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Decision reason')).toHaveValue('Retain my exact review context')
  await expect(page.getByRole('button', { name: /View Audit for/ })).toBeFocused()
  await page.goto('/admin/audit?reviewAs=administrator')
  await expect(page.getByRole('alert')).toContainText('This item is not available.')
  await expect(page.getByRole('region', { name: 'Record audit' })).toHaveCount(0)
})

test('actual 200% browser zoom preserves record audit reflow', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium')
  test.skip(testInfo.project.name !== 'chromium', 'One desktop browser zoom proof is sufficient.')
  const extension = resolve('e2e/fixtures/issue-131-zoom')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    timeout: 30_000,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  try {
    const worker = await test.step('Load the isolated zoom extension', async () =>
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 })))
    const page = await context.newPage()
    await page.goto(`${testInfo.project.use.baseURL}/admin/access?reviewAs=administrator`)
    await page
      .getByRole('button', { name: /View Audit for/ })
      .first()
      .click()
    await expect(page.getByRole('region', { name: 'Record audit' })).toBeVisible()
    const width = await page.evaluate(() => innerWidth)
    expect(
      await test.step('Apply real browser zoom', () =>
        worker.evaluate(`(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.tabs.setZoom(tab.id, 2);
      return chrome.tabs.getZoom(tab.id);
    })()`)),
    ).toBe(2)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width / 2)
    await page.addStyleTag({
      content:
        '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }',
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('link', { name: 'Back to Access & Safety' }).focus()
    await expect(page.getByRole('link', { name: 'Back to Access & Safety' })).toBeFocused()
    await page.screenshot({
      path: testInfo.outputPath('audit-browser-zoom-200.png'),
      fullPage: true,
    })
  } finally {
    await context.close()
  }
})

test('grant audit uses its exact scope and refresh loses the reference', async ({ page }) => {
  await page.goto('/admin/access?reviewAs=administrator')
  await page
    .getByRole('button', { name: /View Audit for/ })
    .first()
    .click()
  await expect(page.getByRole('region', { name: 'Record audit' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Record audit' })).toHaveCount(0)
})
