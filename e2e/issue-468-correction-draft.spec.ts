import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('Help and Store Details expose correction drafts without implying submission', async ({
  page,
}) => {
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'Correct store information' })).toBeVisible()
  await expect(
    page.getByText(
      /correction drafts are available during this public-test stage, but you cannot submit them/i,
    ),
  ).toBeVisible()

  const accessibility = await new AxeBuilder({ page }).include('main').analyze()
  expect(accessibility.violations).toEqual([])

  await page.goto('/stores/blue-finch-curios')
  await expect(page.getByRole('heading', { name: /blue finch curios/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Draft a correction' })).toHaveAttribute(
    'href',
    '/stores/blue-finch-curios/correction',
  )
  await expect(page.getByText(/drafts are available.*submission is unavailable/i)).toBeVisible()

})

test('direct correction route saves a local draft, denies form submission, and returns to the store', async ({
  page,
}) => {
  const correctionRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/correction-submit'))
      correctionRequests.push(request.url())
  })

  await page.goto('/stores/blue-finch-curios/correction')
  await expect(page.getByRole('heading', { name: 'Suggest a correction' })).toBeVisible()
  await expect(
    page.getByText(/prepare a correction draft.*submission is unavailable.*browser tab/i),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /sign in to submit/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /submit correction/i })).toHaveCount(0)

  const category = page.getByLabel('What needs correction?')
  const description = page.getByLabel('Description')
  await category.focus()
  await page.keyboard.press('Tab')
  await expect(description).toBeFocused()
  await page.keyboard.type('Weekend hours have changed')
  await page.getByLabel('Public source URL (optional)').fill('https://example.com/hours')

  const savedDraft = await page.evaluate(() =>
    sessionStorage.getItem('antique-trail:correction-draft:blue-finch-curios'),
  )
  expect(savedDraft).not.toBeNull()
  expect(JSON.parse(savedDraft!)).toMatchObject({
    description: 'Weekend hours have changed',
    publicSourceUrl: 'https://example.com/hours',
  })

  await page.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit())
  expect(correctionRequests).toEqual([])
  await page.reload()
  await expect(page.getByLabel('Description')).toHaveValue('Weekend hours have changed')

  const accessibility = await new AxeBuilder({ page }).include('main').analyze()
  expect(accessibility.violations).toEqual([])

  await page.getByRole('link', { name: 'Cancel and return to this store' }).click()
  await expect(page).toHaveURL(/\/stores\/blue-finch-curios$/)
  await expect(page.getByRole('heading', { name: /blue finch curios/i })).toBeVisible()
  await page.getByRole('link', { name: 'Draft a correction' }).click()
  await expect(page.getByLabel('Description')).toHaveValue('Weekend hours have changed')
  expect(correctionRequests).toEqual([])
})
