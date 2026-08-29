import { expect, test, type Page } from '@playwright/test'

const reviewUrl = (path: string, identity: string, state = 'success') =>
  `${path}?reviewAs=${identity}&reviewState=${state}`

// The acceptance page reads its token from the location fragment; the review
// identity/state must stay in the real query string BEFORE the `#` so the
// harness routes this page load to shopper-b.
const ACCEPT_URL =
  '/trip-invitations?reviewAs=shopper-b&reviewState=success#token=review-trip-invite-shopper-b'

const GENERIC_TRIP_ALERT = "We couldn't update this trip. Please try again."

async function assertMinimumTargets(page: Page) {
  expect(
    await page.locator('a, button, input, select').evaluateAll((elements) =>
      elements.flatMap((element) => {
        const target =
          element instanceof HTMLInputElement &&
          (element.type === 'checkbox' || element.type === 'radio')
            ? (element.closest('label') ?? element)
            : element
        const rect = target.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && (rect.width < 48 || rect.height < 48)
          ? [
              {
                label: element.getAttribute('aria-label') ?? element.textContent?.trim(),
                width: rect.width,
                height: rect.height,
              },
            ]
          : []
      }),
    ),
  ).toEqual([])
}

test.describe('UI-07 trip planning, Go, and collaboration', () => {
  test.describe.configure({ mode: 'serial' })

  test('anonymous shoppers are redirected from private trip routes', async ({ page }) => {
    const routes = [
      '/trips',
      '/trips/new',
      '/trips/trip-a/plan',
      '/trips/trip-a/invite',
      '/trip-invitations',
      '/trips/trip-a/go',
      '/trips/trip-a/check-my-day',
      '/trips/trip-a/summary',
    ]
    for (const path of routes) {
      await page.goto(reviewUrl(path, 'anonymous'))
      await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    }
  })

  test('shopper-a sees the seeded draft trip with its date', async ({ page }) => {
    await page.goto(reviewUrl('/trips', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'My trips' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New trip' })).toBeVisible()
    const list = page.getByLabel('My trips')
    const row = list.locator('li').filter({ hasText: "Avery's antique day" })
    await expect(row).toBeVisible()
    await expect(row).toContainText('2026-08-08')
    await expect(page.getByRole('link', { name: "Avery's antique day" })).toHaveAttribute(
      'href',
      '/trips/trip-a/plan',
    )
  })

  test('shopper-b sees the honest empty trip list', async ({ page }) => {
    await page.goto(reviewUrl('/trips', 'shopper-b'))
    await expect(page.getByText('No trips yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: "Avery's antique day" })).toHaveCount(0)
  })

  test('a new trip is created and opens its plan', async ({ page }) => {
    await page.goto(reviewUrl('/trips/new', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'New trip' })).toBeVisible()
    await page.getByLabel('Trip name').fill('River walk')
    await page.getByLabel('Date').fill('2026-08-15')
    await page.getByRole('button', { name: 'Create trip', exact: true }).click()
    await expect(page).toHaveURL(/\/trips\/trip-1\/plan/)
    await expect(page.getByRole('heading', { level: 1, name: 'River walk' })).toBeVisible()
  })

  test('the plan renders both seeded stops with hours and stale-data honesty', async ({ page }) => {
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: "Avery's antique day" })).toBeVisible()
    await expect(page.getByText('Trip date: 2026-08-08')).toBeVisible()
    await expect(page.getByText(/Travel time is not included/)).toBeVisible()

    const stops = page.getByLabel('Ordered trip stops')
    const blueFinch = stops.locator('li').filter({ hasText: 'Blue Finch Curios' })
    const cedar = stops.locator('li').filter({ hasText: 'Cedar & Brass' })
    await expect(blueFinch).toContainText('Blue Finch Curios — must, 60 minutes, planned')
    await expect(blueFinch).toContainText('Trip-date hours: 10:00 AM–5:00 PM.')
    await expect(cedar).toContainText('Cedar & Brass — prefer, 45 minutes, planned')
    await expect(cedar).toContainText('Hours were last verified more than 180 days ago.')
  })

  test('plan interactions update the draft', async ({ page }) => {
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: "Avery's antique day" })).toBeVisible()

    // Rename the draft.
    await page.getByLabel('Trip name').fill("Avery's revised day")
    await page.getByRole('button', { name: 'Rename trip', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: "Avery's revised day" })).toBeVisible()

    // Move Cedar & Brass up; first-row Move Up and last-row Move Down disable.
    const stops = page.getByLabel('Ordered trip stops')
    await page.getByLabel('Move Cedar & Brass up').click()
    await expect(stops.locator('li').first()).toContainText('Cedar & Brass')
    await expect(page.getByLabel('Move Cedar & Brass up')).toBeDisabled()
    await expect(page.getByLabel('Move Blue Finch Curios down')).toBeDisabled()

    // Priority and dwell updates apply.
    await page.getByLabel('Priority for Cedar & Brass').selectOption('must')
    const dwell = page.getByLabel('Dwell minutes for Cedar & Brass')
    await dwell.fill('60')
    await dwell.blur()
    await expect(stops.locator('li').filter({ hasText: 'Cedar & Brass' })).toContainText(
      'must, 60 minutes',
    )

    // Removal identifies the exact stop and stays reversible until confirmed.
    const removeBlueFinch = page.getByLabel('Remove Blue Finch Curios')
    await expect(removeBlueFinch).toHaveClass(/button--danger/)
    await expect(page.getByRole('button', { name: 'Review Hours', exact: true })).toHaveClass(
      /button--secondary/,
    )
    await expect(page.getByLabel('Move Cedar & Brass up')).toHaveClass(/button--secondary/)
    await removeBlueFinch.click()
    await expect(
      page.getByText('Removing Blue Finch Curios changes this trip plan immediately.'),
    ).toBeVisible()
    await expect(stops.locator('li').filter({ hasText: 'Blue Finch Curios' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Keep Blue Finch Curios', exact: true }).click()
    await expect(stops.locator('li').filter({ hasText: 'Blue Finch Curios' })).toHaveCount(1)
    await removeBlueFinch.click()
    await page.getByRole('button', { name: 'Yes, remove Blue Finch Curios', exact: true }).click()
    await expect(stops.locator('li').filter({ hasText: 'Blue Finch Curios' })).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText(
      'Blue Finch Curios was removed from this trip.',
    )

    // Add a custom stop.
    await page.getByLabel('Add stop').fill('River walk café')
    await page.getByLabel('Priority', { exact: true }).selectOption('prefer')
    await page.getByLabel('Dwell minutes', { exact: true }).fill('30')
    await page.getByRole('button', { name: 'Add stop', exact: true }).click()
    await expect(stops.locator('li').filter({ hasText: 'River walk café' })).toContainText(
      'River walk café — prefer, 30 minutes, planned',
    )

    // Restore the two seeded stops for a deterministic plan.
    await page.getByLabel('Add stop').fill('Blue Finch Curios')
    await page.getByLabel('Priority', { exact: true }).selectOption('must')
    await page.getByLabel('Dwell minutes', { exact: true }).fill('60')
    await page.getByRole('button', { name: 'Add stop', exact: true }).click()
    await page.getByLabel('Add stop').fill('Cedar & Brass')
    await page.getByLabel('Priority', { exact: true }).selectOption('prefer')
    await page.getByLabel('Dwell minutes', { exact: true }).fill('45')
    await page.getByRole('button', { name: 'Add stop', exact: true }).click()
    await expect(stops.locator('li').filter({ hasText: 'Blue Finch Curios' })).toHaveCount(1)
    await expect(stops.locator('li').filter({ hasText: 'Cedar & Brass' })).toHaveCount(2)
  })

  test('Review Hours stays honest with an unresolved stale warning', async ({ page }) => {
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
    await page.getByRole('button', { name: 'Review Hours', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Hours warnings' })).toBeVisible()
    await expect(page.locator('.lede')).toContainText('Travel time is not included')
    await expect(page.locator('.lede')).toContainText('no feasible-order or arrival claim is made')
    await page.getByLabel(/I understand these hours warnings/).check()
    await page.getByRole('button', { name: 'Acknowledge warnings and continue' }).click()
    await expect(page.getByRole('group', { name: 'Hours warnings' })).toHaveCount(0)
  })

  test('offline queue queues, replays to a conflict, and resolves', async ({ page }) => {
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: "Avery's antique day" })).toBeVisible()

    // Queue a plan edit offline and replay it into the documented conflict.
    await page.getByRole('button', { name: 'Save a change offline', exact: true }).click()
    await expect(page.getByText('1 change queued offline. Reconnect to replay them.')).toBeVisible()
    await page.getByRole('button', { name: 'Replay queued changes', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('A queued action no longer applies.')
    await expect(
      page.getByRole('button', { name: "Keep This Phone's Version", exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Keep Saved Version', exact: true }),
    ).toBeVisible()

    // Keep the saved version clears the conflict.
    await page.getByRole('button', { name: 'Keep Saved Version', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)

    // Queue again, replay to the same conflict, then purge the offline copy.
    await page.getByRole('button', { name: 'Save a change offline', exact: true }).click()
    await expect(page.getByText('1 change queued offline. Reconnect to replay them.')).toBeVisible()
    await page.getByRole('button', { name: 'Replay queued changes', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('A queued action no longer applies.')
    await page.getByRole('button', { name: 'Purge offline copy', exact: true }).click()
    await expect(
      page.getByText('Offline data was purged. Reconnect before making another change.'),
    ).toBeVisible()
  })

  test('Go tracks stops to completion, the summary records it, and Plan Again copies it', async ({
    page,
  }, testInfo) => {
    await page.goto(reviewUrl('/trips/trip-a/go', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Go' })).toBeVisible()
    await expect(page.getByText(/does not claim route feasibility or travel time/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start trip', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Start trip', exact: true }).click()

    // Navigator handoff links use the store address with no background tracking.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Navigate to current stop' }),
    ).toBeVisible()
    await expect(page.getByText('100 Synthetic Avenue, Topeka, KS')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute(
      'href',
      /google\.com\/maps\/search/,
    )
    await expect(page.getByRole('link', { name: 'Open in Waze' })).toHaveAttribute(
      'href',
      /waze\.com\/ul/,
    )
    if (process.env.CAPTURE_UI07_EVIDENCE) {
      await page.screenshot({
        path: `docs/evidence/ui-07/${testInfo.project.name}-go.png`,
        fullPage: true,
      })
    }

    const stops = page.getByLabel('Trip stops')
    const blueFinch = stops.locator('li').filter({ hasText: 'Blue Finch Curios' })
    const cedar = stops.locator('li').filter({ hasText: 'Cedar & Brass' })

    // Skip Blue Finch, undo the skip, then arrive and complete it with a private memory.
    await blueFinch.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(blueFinch).toContainText('Blue Finch Curios — skipped')
    await blueFinch.getByRole('button', { name: 'Undo skip for Blue Finch Curios' }).click()
    await expect(blueFinch).toContainText('Blue Finch Curios — planned')
    await blueFinch.getByRole('button', { name: 'Arrived', exact: true }).click()
    await blueFinch.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(blueFinch).toContainText('Blue Finch Curios — completed')
    await page.getByLabel('Private note for Blue Finch Curios').fill('Walnut secretary')
    await page
      .getByRole('button', { name: 'Save private memory for Blue Finch Curios', exact: true })
      .click()
    await expect(page.getByText('Private memory saved.')).toBeVisible()

    // Completing the last stop auto-completes the trip and opens the summary.
    await cedar.getByRole('button', { name: 'Arrived', exact: true }).click()
    await cedar.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page).toHaveURL(/\/trips\/trip-a\/summary/)

    await expect(page.getByRole('heading', { level: 1, name: 'Trip summary' })).toBeVisible()
    await expect(page.getByText("Avery's antique day — completed")).toBeVisible()
    await expect(
      page.getByText(/Visited: 2 · Skipped: 0 · Appeared closed: 0 · Duration: 2 hr/),
    ).toBeVisible()
    await expect(page.getByText('Blue Finch Curios: Visited — Private memory saved')).toBeVisible()
    await expect(page.getByText('Cedar & Brass: Visited — Private memory missing')).toBeVisible()
    if (process.env.CAPTURE_UI07_EVIDENCE) {
      await page.screenshot({
        path: `docs/evidence/ui-07/${testInfo.project.name}-summary.png`,
        fullPage: true,
      })
    }

    // Plan Again clones the completed record into a fresh draft plan.
    await page.getByRole('button', { name: 'Plan Again', exact: true }).click()
    await expect(page).toHaveURL(/\/trips\/trip-\d+\/plan/)
    await expect(
      page.getByRole('heading', { level: 1, name: "Avery's antique day (copy)" }),
    ).toBeVisible()
  })

  test('Check My Day suggests an order from reviewed hours only', async ({ page }) => {
    await page.goto(reviewUrl('/trips/trip-a/check-my-day', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Check My Day' })).toBeVisible()
    await page.getByRole('button', { name: 'Check My Day', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Suggested order' })).toBeVisible()
    await expect(
      page.getByText('Suggested order prioritizes must-see stops, then earlier opening times.'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Use Suggested Order', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keep My Order', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Use Suggested Order', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('partner invitation sends and acceptance stays fail-closed', async ({ page }) => {
    await page.goto(reviewUrl('/trips/trip-a/invite', 'shopper-a'))
    await expect(
      page.getByRole('heading', { level: 1, name: 'Trip Partner and Navigator' }),
    ).toBeVisible()
    await expect(page.getByText('Avery — creator — Navigator')).toBeVisible()
    await page.getByLabel('Partner verified email').fill('shopper-b@local.invalid')
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
    await expect(page.getByText(/One invitation is pending until/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revoke invitation', exact: true })).toBeVisible()

    // Until the harness seeds shopper-b's collaboration, acceptance fails closed
    // with the generic alert and no cross-account trip content.
    await page.goto(ACCEPT_URL)
    await expect(page.getByRole('alert')).toContainText(GENERIC_TRIP_ALERT)
    await expect(page.getByText('You joined this one trip as Trip Partner.')).toHaveCount(0)
    await expect(page.getByText("Avery's antique day")).toHaveCount(0)
  })

  test('loading, empty, error, blocked, and permission-denied states stay honest', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/trips', 'shopper-a', 'loading'))
    await expect(page.getByText('Loading…')).toBeVisible()

    await page.goto(reviewUrl('/trips', 'shopper-a', 'empty'))
    await expect(page.getByText('No trips yet.')).toBeVisible()

    for (const state of ['error', 'blocked', 'permission-denied'] as const) {
      await page.goto(reviewUrl('/trips', 'shopper-a', state))
      await expect(page.getByRole('alert')).toContainText(GENERIC_TRIP_ALERT)
      await expect(page.getByRole('link', { name: "Avery's antique day" })).toHaveCount(0)
    }

    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a', 'error'))
    await expect(page.getByRole('heading', { level: 1, name: 'Trip unavailable' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(GENERIC_TRIP_ALERT)

    await page.goto(reviewUrl('/trips/trip-a/go', 'shopper-a', 'error'))
    await expect(page.getByRole('heading', { level: 1, name: 'Go unavailable' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(GENERIC_TRIP_ALERT)
  })

  test('cross-account plan and Go access stay loading-only', async ({ page }) => {
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-b'))
    await expect(page.getByText('Loading your private trip…')).toBeVisible()
    await expect(page.getByText("Avery's antique day")).toHaveCount(0)
    await expect(page.getByLabel('Ordered trip stops')).toHaveCount(0)

    await page.goto(reviewUrl('/trips/trip-a/go', 'shopper-b'))
    await expect(page.getByText('Loading your private trip…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start trip', exact: true })).toHaveCount(0)
  })

  test('representative and administrator accounts cannot open trip routes', async ({ page }) => {
    for (const identity of ['representative', 'administrator'] as const) {
      await page.goto(reviewUrl('/trips', identity))
      await expect(page.getByRole('alert')).toContainText(GENERIC_TRIP_ALERT)
      await expect(page.getByText('No trips yet.')).toHaveCount(0)
      await expect(page.getByRole('link', { name: "Avery's antique day" })).toHaveCount(0)
    }
  })

  test('reflow at 320 CSS px (the layout a 200 percent zoom produces) keeps the plan usable', async ({
    page,
  }) => {
    // Playwright cannot emulate browser zoom; a 320 CSS px viewport reproduces the
    // 200 percent-zoom layout at 640 physical px and exercises the same reflow path.
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: "Avery's antique day" })).toBeVisible()
    await page.setViewportSize({ width: 320, height: 640 })
    const innerWidth = await page.evaluate(() => window.innerWidth)
    expect(innerWidth).toBe(320)
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
  })

  test('trip-planning hierarchy stays distinct across viewports, dark theme, and forced colors', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light', forcedColors: 'none' })
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 768, height: 1024 },
      { width: 320, height: 640 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
      await expect(page.getByRole('button', { name: 'Rename trip', exact: true })).toHaveClass(
        /button/,
      )
      await expect(page.getByRole('button', { name: 'Review Hours', exact: true })).toHaveClass(
        /button--secondary/,
      )
      await expect(page.getByLabel('Move Blue Finch Curios up')).toHaveClass(/button--secondary/)
      await expect(page.getByLabel('Remove Blue Finch Curios')).toHaveClass(/button--danger/)
      const overflow = await page.evaluate(
        () => document.body.scrollWidth - document.body.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    }

    await page.getByLabel('Remove Blue Finch Curios').click()
    await page.getByRole('group', { name: 'Remove Blue Finch Curios?' }).scrollIntoViewIfNeeded()
    const [confirmation, navigation] = await Promise.all([
      page.getByRole('group', { name: 'Remove Blue Finch Curios?' }).boundingBox(),
      page.getByRole('navigation', { name: 'Primary navigation' }).boundingBox(),
    ])
    expect(confirmation).not.toBeNull()
    expect(navigation).not.toBeNull()
    expect(confirmation!.y + confirmation!.height).toBeLessThanOrEqual(navigation!.y)

    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none' })
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
    const primary = page.getByRole('button', { name: 'Rename trip', exact: true })
    const secondary = page.getByRole('button', { name: 'Review Hours', exact: true })
    await expect(primary).toBeVisible()
    await expect(secondary).toBeVisible()
    expect(await primary.evaluate((button) => getComputedStyle(button).backgroundColor)).not.toBe(
      await secondary.evaluate((button) => getComputedStyle(button).backgroundColor),
    )

    await page.emulateMedia({ colorScheme: 'light', forcedColors: 'active' })
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
    await expect(page.getByLabel('Remove Blue Finch Curios')).toBeVisible()
    await expect(page.getByLabel('Remove Blue Finch Curios')).toHaveClass(/button--danger/)
  })

  test('actionable targets meet the 48×48 px baseline', async ({ page }) => {
    const targets = [
      ['/trips', 'shopper-a'],
      ['/trips/new', 'shopper-a'],
      ['/trips/trip-a/plan', 'shopper-a'],
      ['/trips/trip-a/invite', 'shopper-a'],
      ['/trips/trip-a/go', 'shopper-a'],
      ['/trips/trip-a/summary', 'shopper-a'],
      ['/trips/trip-a/check-my-day', 'shopper-a'],
    ] as const
    for (const [path, identity] of targets) {
      await page.goto(reviewUrl(path, identity))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await assertMinimumTargets(page)
    }
    await page.goto(ACCEPT_URL)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await assertMinimumTargets(page)
  })

  test('focus moves to the page H1 after client-side navigation on trip routes', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/trips', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'My trips' })).toBeFocused()

    // Link-click navigation must move focus to the destination H1, not the link.
    await page.getByRole('link', { name: "Avery's antique day" }).click()
    await expect(page.getByRole('heading', { level: 1, name: "Avery's antique day" })).toBeFocused()
  })

  test('keyboard-only operation shows a visible focus and drives the plan and Go controls', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/trips/trip-a/plan', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: "Avery's antique day" })).toBeFocused()

    // The design-system focus ring is a box-shadow with outline: none, so the
    // visible-focus check must test the shadow, not the outline.
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
    const focusStyle = await focused.evaluate((element) => {
      const style = getComputedStyle(element)
      return { outline: style.outlineStyle, shadow: style.boxShadow }
    })
    expect(focusStyle.outline !== 'none' || focusStyle.shadow !== 'none').toBe(true)

    await page.getByLabel('Move Cedar & Brass up').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Ordered trip stops').locator('li').first()).toContainText(
      'Cedar & Brass',
    )

    await page.goto(reviewUrl('/trips/trip-a/go', 'shopper-a'))
    await page.getByRole('button', { name: 'Start trip', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('heading', { level: 2, name: 'Navigate to current stop' }),
    ).toBeVisible()
  })

  test('captures the approved viewport evidence when explicitly requested', async ({
    page,
  }, testInfo) => {
    test.skip(!process.env.CAPTURE_UI07_EVIDENCE, 'Evidence capture is opt-in.')
    const targets = [
      ['shopper-a', '/trips', 'trip-list'],
      ['shopper-a', '/trips/trip-a/plan', 'trip-plan'],
      ['shopper-a', '/trips/trip-a/check-my-day', 'check-my-day'],
    ] as const
    for (const [identity, path, slug] of targets) {
      await page.goto(reviewUrl(path, identity))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (slug === 'check-my-day') {
        await page.getByRole('button', { name: 'Check My Day', exact: true }).click()
        await expect(page.getByRole('heading', { level: 2, name: 'Suggested order' })).toBeVisible()
      }
      await page.screenshot({
        path: `docs/evidence/ui-07/${testInfo.project.name}-${slug}.png`,
        fullPage: true,
      })
    }
    await page.goto(reviewUrl('/trips/trip-a/invite', 'shopper-a'))
    await expect(
      page.getByRole('heading', { level: 1, name: 'Trip Partner and Navigator' }),
    ).toBeVisible()
    await page.getByLabel('Partner verified email').fill('shopper-b@local.invalid')
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
    await expect(page.getByText(/One invitation is pending until/)).toBeVisible()
    await page.screenshot({
      path: `docs/evidence/ui-07/${testInfo.project.name}-invite-partner.png`,
      fullPage: true,
    })
  })
})
