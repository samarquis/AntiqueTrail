import { expect, test } from '@playwright/test'

const noticeCopy =
  'Saving stores is paused for this public-test stage. Existing accounts can still sign in.'
const catalogOnly = process.env.VITE_PUBLIC_TEST_CATALOG_ONLY === 'true'

test('shows the stage notice once on Browse and preserves Details boundaries', async ({ page }) => {
  await page.goto('/stores')
  await expect(page.getByRole('heading', { name: /discover local antiques/i })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(12)

  const cards = page.getByRole('article')
  if (catalogOnly) {
    const notice = page.getByText(noticeCopy, { exact: true })
    const resultsHeading = page.getByRole('heading', { name: '12 stores to explore' })
    await expect(notice).toHaveCount(1)
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(resultsHeading).toBeVisible()
    await page.setViewportSize({ width: 320, height: 800 })
    const noticeBox = await notice.boundingBox()
    expect(noticeBox).not.toBeNull()
    expect(noticeBox!.x).toBeGreaterThanOrEqual(16)
    expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(304)
    const appearsBeforeResults = await notice.evaluate((element) => {
      const results = document.querySelector('.catalog-results-heading h2')
      return Boolean(
        results && element.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
    })
    expect(appearsBeforeResults).toBe(true)

    for (let index = 0; index < 12; index += 1) {
      const card = cards.nth(index)
      await expect(card.getByRole('link', { name: /view store/i })).toBeVisible()
      await expect(card.getByText(noticeCopy)).toHaveCount(0)
    }

    const firstCard = cards.first()
    const storeName = (await firstCard.getByRole('heading').textContent())?.trim()
    expect(storeName).toBeTruthy()
    if (!storeName) throw new Error('Browse fixture is missing a store heading')
    await firstCard.getByRole('link', { name: /view store/i }).click()
    await expect(page.getByRole('heading', { name: storeName })).toBeVisible()
    const detailsNotice = page.getByText(noticeCopy, { exact: true })
    await expect(detailsNotice).toBeVisible()
    await expect(detailsNotice).toHaveAttribute('role', 'status')
    await expect(page.getByRole('link', { name: 'Draft a correction' })).toBeVisible()
    await expect(
      page.getByText(
        'Drafts are available, but submission is unavailable during this public-test stage.',
      ),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /^(?:save\b|create account\b|submit\b)/i }),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: /submit/i })).toHaveCount(0)
  } else {
    await expect(page.getByText(noticeCopy, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /save .*requires sign-in/i })).toHaveCount(12)
  }
})
