import { expect, test, type Page } from '@playwright/test'

const roles = [
  ['anonymous', 'Anonymous shopper', 'Anonymous'],
  ['shopper-a', 'Shopper A', 'Shopper'],
  ['shopper-b', 'Shopper B', 'Shopper'],
  ['representative', 'Store Representative', 'Representative'],
  ['store-owner', 'Store Owner', 'Store Owner'],
  ['co-owner', 'Co-Owner · Blue Finch Curios', 'Store Owner', 'Co-Owner'],
  [
    'full-store-access',
    'Full Store Access · Blue Finch Curios',
    'Store Owner',
    'Full Store Access',
  ],
  ['listing-editor', 'Listing Editor · Blue Finch Curios', 'Store Owner', 'Listing Editor'],
  ['administrator', 'Administrator', 'Administrator'],
] as const

async function expectCompactReviewContext(page: Page) {
  const banner = page.getByLabel('Local review harness')
  await expect(banner).toBeVisible()
  await expect(banner).not.toHaveClass(/page-card/)
  await expect(banner.getByRole('link', { name: 'Switch or reset' })).toBeVisible()
  const dimensions = await banner.evaluate((element) => {
    const bannerRect = element.getBoundingClientRect()
    const linkRect = element.querySelector('a')!.getBoundingClientRect()
    return {
      bannerWidth: bannerRect.width,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      linkHeight: linkRect.height,
    }
  })
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
  expect(dimensions.bannerWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
  expect(dimensions.linkHeight).toBeGreaterThanOrEqual(48)
}

test.describe('local human-review harness contract', () => {
  for (const [id, label, role, storeRole] of roles) {
    test(`${label} is directly addressable and isolated`, async ({ page }) => {
      await page.goto(`/review?reviewAs=${id}&reviewState=success`)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Human review harness' }),
      ).toBeFocused()
      await expect(page.getByLabel('Local review harness')).toContainText(`${label} · success`)
      await expect(
        page.getByLabel('Review this scenario').getByText(role, { exact: true }),
      ).toBeVisible()
      if (storeRole) {
        await expect(
          page
            .getByLabel('Review this scenario')
            .locator('dl')
            .getByText(storeRole, { exact: true }),
        ).toContainText(storeRole)
      }
      if (id === 'store-owner') {
        await expect(page.getByLabel('Review this scenario')).toContainText(
          'Approved synthetic primary Owner of Blue Finch Curios.',
        )
      }
      await expect(page.getByRole('status')).toHaveText(
        'Deterministic fixture loaded successfully.',
      )
      await expect(page.getByText(/local-review-only:/)).toHaveCount(0)
    })
  }

  test('owner team personas stay scoped and expose only their existing actions', async ({
    page,
  }) => {
    for (const [id, storeRole] of [
      ['co-owner', 'Co-Owner'],
      ['full-store-access', 'Full Store Access'],
      ['listing-editor', 'Listing Editor'],
    ] as const) {
      await page.goto(`/owner/stores?reviewAs=${id}&reviewState=success`)
      await expect(page.getByRole('heading', { name: 'Your store workspace' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Blue Finch Curios' })).toBeVisible()
      await expect(page.getByText(storeRole, { exact: true })).toBeVisible()
      await expect(page.getByText('Editor Workspace', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Sibling Workspace', { exact: true })).toHaveCount(0)

      if (id === 'listing-editor') {
        await expect(
          page.getByRole('button', { name: 'Manage team access for Blue Finch Curios' }),
        ).toHaveCount(0)
      } else {
        await page.getByRole('button', { name: 'Manage team access for Blue Finch Curios' }).click()
        const roleOptions = await page.getByLabel('Store role').locator('option').allTextContents()
        await expect(page.getByLabel('Store role')).toHaveValue(
          id === 'co-owner' ? 'co_owner' : 'listing_editor',
        )
        expect(roleOptions).toEqual([id === 'co-owner' ? 'Co-Owner' : 'Listing Editor'])
        await expect(page.getByRole('button', { name: 'Remove Jordan Editor' })).toHaveCount(0)
        if (id === 'co-owner') {
          await expect(
            page.getByRole('button', { name: 'Cancel Full Store Access invitation' }),
          ).toBeVisible()
        } else {
          const invitations = page.getByRole('list', { name: 'Pending team invitations' })
          await expect(invitations.getByRole('listitem')).toHaveCount(2)
          await expect(
            page.getByRole('button', { name: 'Cancel Listing Editor invitation' }),
          ).toHaveCount(1)
          await expect(
            page.getByRole('button', { name: 'Cancel Co-Owner invitation' }),
          ).toHaveCount(0)
        }
      }

      await page.getByRole('button', { name: 'Open Blue Finch Curios' }).click()
      const portalNav = page.getByRole('navigation', { name: 'Store Portal sections' })
      await expect(portalNav).toBeVisible()
      if (id === 'listing-editor') {
        await expect(portalNav.getByRole('link', { name: 'Billing status' })).toHaveCount(0)
        await portalNav.getByRole('link', { name: 'Promotion permissions' }).click()
        await expect(page.getByRole('heading', { name: 'Promotion permissions' })).toBeVisible()
        await expect(page.getByRole('button', { name: /Give permission:/ })).toHaveCount(0)
      } else {
        await expect(portalNav.getByRole('link', { name: 'Billing status' })).toBeVisible()
        await portalNav.getByRole('link', { name: 'Billing status' }).click()
        await expect(page.getByRole('heading', { name: 'Billing status' })).toBeVisible()
        await expect(
          page.getByText('No billing actions are available in this workspace.'),
        ).toBeVisible()
        await expect(page.locator('main').getByRole('button')).toHaveCount(0)
        if (id === 'full-store-access') {
          await page.goBack()
          await page
            .getByRole('navigation', { name: 'Store Portal sections' })
            .getByRole('link', { name: 'Promotion permissions' })
            .click()
          await expect(page.getByRole('heading', { name: 'Promotion permissions' })).toBeVisible()
          await expect(page.getByRole('button', { name: /Give permission:/ })).toHaveCount(4)
        } else {
          await page.goBack()
          await page
            .getByRole('navigation', { name: 'Store Portal sections' })
            .getByRole('link', { name: 'Promotion permissions' })
            .click()
          await expect(page.getByRole('heading', { name: 'Promotion permissions' })).toBeVisible()
          await expect(page.getByRole('alert')).toBeVisible()
        }
      }

      await page.goto(`/admin?reviewAs=${id}&reviewState=success`)
      await expect(page.getByRole('heading', { name: 'Review Queue' })).toHaveCount(0)
      await page.goto(`/saved?reviewAs=${id}&reviewState=success`)
      await expect(page.getByRole('heading', { name: 'Saved stores' })).toHaveCount(0)
    }
  })

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

  test('compact review context stays subordinate and usable on every audience route', async ({
    page,
  }) => {
    const routes = [
      '/stores?reviewAs=anonymous&reviewState=success',
      '/saved?reviewAs=shopper-a&reviewState=success',
      '/trips?reviewAs=shopper-a&reviewState=success',
      '/store-portal?reviewAs=representative&reviewState=success',
      '/admin?reviewAs=administrator&reviewState=success',
    ]
    for (const route of routes) {
      await page.goto(route)
      await expectCompactReviewContext(page)
    }

    await page.setViewportSize({ width: 320, height: 900 })
    for (const route of routes) {
      await page.goto(route)
      await expectCompactReviewContext(page)
    }
  })

  test('administrator reaches its guard while a shopper is denied', async ({ page }) => {
    await page.goto('/admin?reviewAs=administrator&reviewState=success')
    await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible()

    await page.goto('/admin?reviewAs=shopper-a&reviewState=permission-denied')
    await expect(page.getByRole('heading', { name: 'Discover local antiques.' })).toBeVisible()
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
