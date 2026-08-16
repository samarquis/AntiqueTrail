import { expect, test } from '@playwright/test'

const roles = [
  ['anonymous', 'Anonymous shopper', 'Anonymous'],
  ['shopper-a', 'Shopper A', 'Shopper'],
  ['shopper-b', 'Shopper B', 'Shopper'],
  ['representative', 'Store Representative', 'Representative'],
  ['administrator', 'Administrator', 'Administrator'],
] as const

test.describe('local human-review harness contract', () => {
  for (const [id, label, role] of roles) {
    test(`${label} is directly addressable and isolated`, async ({ page }) => {
      await page.goto(`/review?reviewAs=${id}&reviewState=success`)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Human review harness' }),
      ).toBeFocused()
      await expect(page.getByLabel('Local review harness')).toContainText(`${label} · success`)
      await expect(
        page.getByLabel('Review this scenario').getByText(role, { exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('status')).toHaveText(
        'Deterministic fixture loaded successfully.',
      )
      await expect(page.getByText(/local-review-only:/)).toHaveCount(0)
    })
  }

  test('all required fixture states are addressable and semantic', async ({ page }) => {
    const states = [
      ['loading', 'status', 'Loading deterministic review fixture…'],
      ['empty', 'status', 'No items in this deterministic fixture.'],
      ['error', 'alert', 'The deterministic fixture could not be loaded. Try again.'],
      ['blocked', 'status', 'This operation is blocked by a required release gate.'],
      ['permission-denied', 'alert', 'You do not have permission to view this fixture.'],
    ] as const
    for (const [state, role, copy] of states) {
      await page.goto(`/review?reviewAs=shopper-a&reviewState=${state}`)
      await expect(page.getByLabel('Selected fixture result').getByRole(role)).toHaveText(copy)
    }
  })

  test('switching identities replaces the in-memory subject and reset returns anonymous', async ({
    page,
  }) => {
    await page.goto('/review?reviewAs=shopper-a&reviewState=success')
    await page.evaluate(() => {
      localStorage.setItem('review-fixture-test', 'shopper-a')
      sessionStorage.setItem('review-fixture-test', 'shopper-a')
    })
    await page.getByRole('link', { name: 'Shopper B', exact: true }).click()
    await expect(page).toHaveURL(/reviewAs=shopper-b/)
    await expect(page.getByText('Blair · shopper-b@local.invalid')).toBeVisible()
    await page.getByRole('button', { name: 'Reset review fixtures' }).click()
    await expect(page).toHaveURL(/reviewAs=anonymous&reviewState=success/)
    await expect(page.getByText('No account')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => ({
          local: localStorage.getItem('review-fixture-test'),
          session: sessionStorage.getItem('review-fixture-test'),
        })),
      )
      .toEqual({ local: null, session: null })
  })

  test('shopper, representative, and administrator routes use functioning fixture clients', async ({
    page,
  }) => {
    await page.goto('/saved?reviewAs=shopper-a&reviewState=success')
    await expect(page.getByRole('heading', { name: 'Saved stores' })).toBeVisible()
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()

    await page.goto('/shares?reviewAs=shopper-b&reviewState=success')
    await expect(page.getByText('Weekend estate-sale lead')).toBeVisible()

    await page.goto('/store-portal?reviewAs=representative&reviewState=success')
    await expect(page.getByRole('heading', { name: 'Blue Finch Curios' })).toBeVisible()
    await expect(
      page.getByRole('definition').filter({ hasText: 'Hours verified 12 days ago' }),
    ).toBeVisible()

    await page.goto('/admin/reviews?reviewAs=administrator&reviewState=success')
    await expect(page.getByRole('heading', { name: /review moderation/i })).toBeVisible()
    await expect(page.getByText(/synthetic spam report/i)).toBeVisible()

    await page.goto('/admin/partners?reviewAs=administrator&reviewState=success')
    await page.getByLabel('Exact claim ID').fill('claim-synthetic')
    await page.getByRole('button', { name: 'Open exact claim' }).click()
    await expect(page.getByRole('heading', { name: 'Claim case' })).toBeVisible()
    await expect(page.getByText(/exact store scope: blue finch curios/i)).toBeVisible()
  })

  test('administrator reaches its guard while a shopper is denied', async ({ page }) => {
    await page.goto('/admin?reviewAs=administrator&reviewState=success')
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible()

    await page.goto('/admin?reviewAs=shopper-a&reviewState=permission-denied')
    await expect(page.getByRole('heading', { name: 'Browse stores' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toHaveCount(0)
  })

  test('cross-account fixture IDs fail closed', async ({ page }) => {
    await page.goto('/shares?reviewAs=shopper-a&reviewState=success')
    await expect(page.getByText('Weekend estate-sale lead')).toHaveCount(0)

    await page.goto('/trips?reviewAs=shopper-b&reviewState=success')
    await expect(page.getByText("Avery's antique day")).toHaveCount(0)

    await page.goto('/shares/share-b?reviewAs=shopper-a&reviewState=success')
    await expect(page.getByRole('alert')).toContainText(/could not update this private item/i)
    await expect(page.getByText('Weekend estate-sale lead')).toHaveCount(0)
  })

  test('keyboard traversal, 200 percent reflow, and minimum targets remain usable', async ({
    page,
  }) => {
    await page.goto('/review?reviewAs=representative&reviewState=success')
    // A 320 CSS-pixel viewport is the reflow area produced by 200% zoom from 640px.
    await page.setViewportSize({ width: 320, height: 900 })
    const overflow = await page.locator('body').evaluate((body) =>
      Array.from(body.querySelectorAll<HTMLElement>('*')).flatMap((element) => {
        const rect = element.getBoundingClientRect()
        return rect.right > document.documentElement.clientWidth + 1
          ? [
              {
                tag: element.tagName,
                text: element.textContent?.trim().slice(0, 80),
                right: rect.right,
              },
            ]
          : []
      }),
    )
    expect(overflow).toEqual([])

    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
    const focusStyle = await focused.evaluate((element) => {
      const style = getComputedStyle(element)
      return { outline: style.outlineStyle, shadow: style.boxShadow }
    })
    expect(focusStyle.outline !== 'none' || focusStyle.shadow !== 'none').toBe(true)

    const undersized = await page.locator('a, button').evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && (rect.width < 48 || rect.height < 48)
          ? [{ text: element.textContent?.trim(), width: rect.width, height: rect.height }]
          : []
      }),
    )
    expect(undersized).toEqual([])
  })

  test('captures the approved viewport evidence when explicitly requested', async ({
    page,
  }, testInfo) => {
    test.skip(!process.env.CAPTURE_UI04_EVIDENCE, 'Evidence capture is opt-in.')
    await page.goto('/review?reviewAs=administrator&reviewState=success')
    await expect(page.getByRole('heading', { name: 'Human review harness' })).toBeFocused()
    await page.screenshot({
      path: `docs/evidence/ui-04/${testInfo.project.name}.png`,
      fullPage: true,
    })
  })
})
