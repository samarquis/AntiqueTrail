import { expect, test, type Page } from '@playwright/test'

async function gotoBrowse(page: Page, path = '/stores', width = 1280) {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => localStorage.setItem('at-theme', 'light'))
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Discover local antiques.' }),
  ).toBeVisible()
}

async function openFilters(page: Page) {
  const trigger = page.getByRole('button', { name: /^filters(?: · active)?$/iu })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

for (const submit of ['Search', 'Enter', 'Apply filters'] as const) {
  test(`${submit} commits one normalized query, category, and area snapshot`, async ({ page }) => {
    await gotoBrowse(page)
    await expect(page.locator('.catalog-card')).toHaveCount(12)
    await openFilters(page)

    const search = page.getByLabel('Search stores')
    await search.fill('  filter-501-no-match  ')
    await page.getByLabel('Category').selectOption('vintage')
    await page.getByLabel('Area').selectOption('topeka-ks')

    await expect(search).toHaveValue('  filter-501-no-match  ')
    await expect(page).toHaveURL(/\/stores$/u)
    await expect(page.locator('.catalog-card')).toHaveCount(12)
    await expect(
      page.getByText('Filters are active. Open Filters to review or clear them.'),
    ).toHaveCount(0)

    if (submit === 'Search') {
      await page.getByRole('button', { name: 'Search', exact: true }).click()
    } else if (submit === 'Enter') {
      await search.press('Enter')
    } else {
      await page.getByRole('button', { name: 'Apply filters' }).click()
    }

    await expect(page).toHaveURL(
      /\/stores\?q=filter-501-no-match&category=vintage&area=topeka-ks$/u,
    )
    await expect(page.getByText('No stores match those filters.')).toBeVisible()
    await expect(
      page.getByText('Filters are active. Open Filters to review or clear them.'),
    ).toBeVisible()
    await expect(search).toHaveValue('filter-501-no-match')
    await expect(page.getByLabel('Category')).toHaveValue('vintage')
    await expect(page.getByLabel('Area')).toHaveValue('topeka-ks')
  })
}

test('keeps applied query while category and area are drafts, then reloads the applied snapshot', async ({
  page,
}) => {
  await gotoBrowse(page, '/stores?q=clock')
  const search = page.getByLabel('Search stores')
  await expect(search).toHaveValue('clock')
  await expect(page.getByText('No stores match those filters.')).toBeVisible()

  await openFilters(page)
  await page.getByLabel('Category').selectOption('vintage')
  await page.getByLabel('Area').selectOption('topeka-ks')
  await expect(page).toHaveURL(/\/stores\?q=clock$/u)
  await expect(page.getByText('No stores match those filters.')).toBeVisible()

  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/\/stores\?q=clock&category=vintage&area=topeka-ks$/u)
  await expect(page.getByText('No stores match those filters.')).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByText('No stores match those filters.')).toBeVisible()
  await expect(search).toHaveValue('clock')
  await expect(page.getByLabel('Category')).toHaveValue('vintage')
  await expect(page.getByLabel('Area')).toHaveValue('topeka-ks')

  const emptyState = page
    .getByRole('status')
    .filter({ has: page.getByText('No stores match those filters.') })
  await emptyState.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL(/\/stores$/u)
  await expect(page.locator('.catalog-card')).toHaveCount(12)
  await expect(search).toHaveValue('')
})

test('keeps Package 1 labels and gating, and clears draft-only values', async ({ page }) => {
  await gotoBrowse(page, '/stores', 390)
  await expect(page.locator('.catalog-card')).toHaveCount(12)

  const trigger = page.getByRole('button', { name: 'Filters', exact: true })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await openFilters(page)
  await expect(page.getByLabel('Search stores')).toBeVisible()
  await expect(page.getByLabel('Category')).toBeVisible()
  await expect(page.getByLabel('Area')).toBeVisible()
  await expect(page.getByLabel('Visit status')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: /open now/i })).toHaveCount(0)

  await page.getByLabel('Search stores').fill('draft-only')
  await page.getByLabel('Category').selectOption('vintage')
  await page.getByLabel('Area').selectOption('topeka-ks')
  const clear = page.getByRole('button', { name: 'Clear filters', exact: true })
  await expect(clear).toBeEnabled()
  await expect(page).toHaveURL(/\/stores$/u)
  await expect(page.locator('.catalog-card')).toHaveCount(12)
  await clear.click()

  await expect(page).toHaveURL(/\/stores$/u)
  await expect(page.locator('.catalog-card')).toHaveCount(12)
  await expect(page.getByLabel('Search stores')).toHaveValue('')
  await openFilters(page)
  await expect(page.getByLabel('Category')).toHaveValue('')
  await expect(page.getByLabel('Area')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeDisabled()
})
