import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

test('exact portal channel consent and withdrawal work while distribution remains paused', async ({
  page,
}) => {
  await page.goto('/store-portal/promotion?reviewAs=representative&reviewState=success')
  await expect(page.getByRole('heading', { name: 'Promotion permissions' })).toBeVisible()
  await expect(page.getByText('Do Not Distribute. Promotion is not activated.')).toBeVisible()
  await page.getByRole('button', { name: 'Give permission: Flyer placement' }).click()
  await expect(
    page.getByRole('button', { name: 'Withdraw permission: Flyer placement' }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: 'Give permission: Logo and co-brand use' }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Withdraw permission: Flyer placement' }).click()
  await expect(page.getByText('Removal of remaining materials requested.')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('anonymous user cannot open promotion controls', async ({ page }) => {
  await page.goto('/store-portal/promotion?reviewAs=anonymous&reviewState=success')
  await expect(page.getByRole('button', { name: /Give permission/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Promotion permissions' })).toHaveCount(0)
})

for (const kind of ['shopper', 'owner'])
  test(`${kind} private print artifact is readable and accessible`, async ({ page }) => {
    await page.setContent(await readFile(`docs/evidence/issue-173/print/${kind}.html`, 'utf8'))
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByText(/Do Not Distribute/)).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(
      await page.locator('body').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(21.3)
    expect(
      await page.locator('img').evaluate((el) => el.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(120)
    await page.screenshot({
      path: `docs/evidence/issue-173/${kind}-${test.info().project.name}.png`,
      fullPage: true,
    })
  })
