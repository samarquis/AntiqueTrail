import { expect, test, type Page } from '@playwright/test'

const reviewUrl = (path: string, identity: string, state = 'success') =>
  `${path}?reviewAs=${identity}&reviewState=${state}`

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

test.describe('UI-06 candidate capture, shares, and trip ideas', () => {
  test.describe.configure({ mode: 'serial' })

  test('anonymous shoppers are redirected from private candidate routes', async ({ page }) => {
    for (const path of ['/capture', '/shares', '/trip-ideas', '/account/privacy/blocked-senders']) {
      await page.goto(reviewUrl(path, 'anonymous'))
      await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    }
  })

  test('shopper-b inbox lists pending, expired, revoked, and outbox shares', async ({ page }) => {
    await page.goto(reviewUrl('/shares', 'shopper-b'))
    await expect(page.getByRole('heading', { level: 1, name: 'Candidate shares' })).toBeFocused()
    const list = page.getByLabel('Candidate shares')
    const row = (title: string) => list.locator('li').filter({ hasText: title })
    await expect(row('Weekend estate-sale lead')).toContainText('received')
    await expect(row('Weekend estate-sale lead')).toContainText('pending')
    await expect(row('Antique sideboard lead')).toContainText('received')
    await expect(row('Antique sideboard lead')).toContainText('closed')
    await expect(row('Vintage lamp lead')).toContainText('received')
    await expect(row('Vintage lamp lead')).toContainText('closed')
    await expect(row('Mid-century credenza lead')).toContainText('sent')
    await expect(row('Mid-century credenza lead')).toContainText('pending')
  })

  test('share details and actions differ by direction and state', async ({ page }) => {
    await page.goto(reviewUrl('/shares/share-b', 'shopper-b'))
    await expect(page.getByRole('heading', { level: 1, name: 'Candidate share' })).toBeFocused()
    await expect(page.getByText(/Weekend estate-sale lead · received · pending/)).toBeVisible()
    for (const action of ['Accept', 'Dismiss', 'Block', 'Report']) {
      await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible()
    }

    await page.goto(reviewUrl('/shares/share-expired', 'shopper-b'))
    await expect(page.getByText(/Antique sideboard lead · received · closed/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0)

    await page.goto(reviewUrl('/shares/share-revoked', 'shopper-b'))
    await expect(page.getByText(/Vintage lamp lead · received · closed/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0)

    await page.goto(reviewUrl('/shares/share-b-sent', 'shopper-b'))
    await expect(page.getByText(/Mid-century credenza lead · sent · pending/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revoke', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0)
  })

  test('accepting a share creates a private trip idea', async ({ page }) => {
    await page.goto(reviewUrl('/shares', 'shopper-b'))
    await page.getByRole('link', { name: 'Weekend estate-sale lead' }).click()
    await expect(page.getByText(/Weekend estate-sale lead · received · pending/)).toBeVisible()
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText(/Weekend estate-sale lead · received · accepted/)).toBeVisible()

    await page.locator('a[href="/more"]').first().click()
    await expect(page).toHaveURL(/\/more/)
    await page.getByRole('link', { name: 'Shared with Me' }).click()
    await expect(page).toHaveURL(/\/shares/)
    await expect(page.getByText(/Weekend estate-sale lead — received · accepted/)).toBeVisible()
    await page.locator('a[href="/more"]').first().click()
    await expect(page).toHaveURL(/\/more/)
    await page.getByRole('link', { name: 'Trip Ideas' }).click()
    await expect(page).toHaveURL(/\/trip-ideas/)
    await expect(page.getByRole('heading', { level: 1, name: 'Trip ideas' })).toBeFocused()
    await expect(page.getByText(/Weekend estate-sale lead/)).toBeVisible()
    await expect(page.getByText(/North Topeka finds/)).toBeVisible()
  })

  test('dismiss, block, report, and revoke close shares', async ({ page }) => {
    await page.goto(reviewUrl('/shares/share-b', 'shopper-b'))
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
    await expect(page.getByText(/received · closed/)).toBeVisible()

    await page.goto(reviewUrl('/shares', 'shopper-b'))
    await page.getByRole('link', { name: 'Weekend estate-sale lead' }).click()
    await expect(page.getByText(/Weekend estate-sale lead · received · pending/)).toBeVisible()
    await page.getByRole('button', { name: 'Block', exact: true }).click()
    await expect(page.getByText(/received · closed/)).toBeVisible()
    await page.goBack()
    await expect(page.getByText(/Weekend estate-sale lead — received · closed/)).toBeVisible()
    await page.getByRole('link', { name: /Manage blocked Candidate senders/ }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Blocked Candidate senders' }),
    ).toBeFocused()
    await expect(page.getByText(/Weekend estate-sale lead/)).toBeVisible()
    await expect(page.getByText(/A blocked synthetic sender/)).toBeVisible()

    await page.goto(reviewUrl('/shares/share-b', 'shopper-b'))
    await page.getByRole('button', { name: 'Report', exact: true }).click()
    await expect(page.getByText(/received · closed/)).toBeVisible()

    await page.goto(reviewUrl('/shares/share-b-sent', 'shopper-b'))
    await page.getByRole('button', { name: 'Revoke', exact: true }).click()
    await expect(page.getByText(/sent · closed/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revoke', exact: true })).toHaveCount(0)
  })

  test('trip ideas edit with versioning and delete with confirmation', async ({ page }) => {
    await page.goto(reviewUrl('/trip-ideas', 'shopper-b'))
    await expect(page.getByRole('heading', { level: 1, name: 'Trip ideas' })).toBeFocused()
    await expect(page.getByText(/North Topeka finds/)).toBeVisible()

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByLabel('Idea title').fill('North Topeka finds — edited')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText(/North Topeka finds — edited/)).toBeVisible()

    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText(/Your private trip ideas will appear here\./)).toBeVisible()
  })

  test('blocked senders can be reviewed and unblocked', async ({ page }) => {
    await page.goto(reviewUrl('/account/privacy/blocked-senders', 'shopper-b'))
    await expect(
      page.getByRole('heading', { level: 1, name: 'Blocked Candidate senders' }),
    ).toBeFocused()
    await expect(page.getByText(/A blocked synthetic sender/)).toBeVisible()
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: 'Unblock', exact: true }).click()
    await expect(page.getByText(/No blocked Candidate senders\./)).toBeVisible()
  })

  test('capture validates, saves, and sends a candidate share', async ({ page }) => {
    await page.goto(reviewUrl('/capture', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Save a candidate' })).toBeFocused()

    // Empty submission is held by native required validation before any alert.
    await page.getByRole('button', { name: 'Save candidate', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByLabel('Share with recipient email')).toHaveCount(0)

    // An ineligible scheme passes native URL validation and reaches the app rule.
    await page.getByLabel('Store link').fill('ftp://example.com/estate')
    await page.getByLabel('Title').fill('Example estate lead')
    await page.getByRole('button', { name: 'Save candidate', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Enter an eligible HTTP or HTTPS link.')

    await page.getByLabel('Store link').fill('https://www.example.com/estate')
    await page.getByLabel('Private note (optional)').fill('Call ahead about the sideboard.')
    await page.getByRole('button', { name: 'Save candidate', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Candidate saved privately.')

    await page.getByLabel('Share with recipient email').fill('bad-email')
    await page.getByRole('button', { name: 'Send private share', exact: true }).click()
    await expect(
      page.getByText('Share sent. If the recipient can receive it, it will appear in their inbox.'),
    ).toHaveCount(0)
    await expect(page.getByLabel('Share with recipient email')).toHaveValue('bad-email')
    await expect(page.getByText('Enter a valid recipient email.')).toHaveCount(0)
    await expect(page.getByText(/Share sent to/)).toHaveCount(0)

    await page.getByLabel('Share with recipient email').fill('shopper-b@local.invalid')
    await page.getByRole('button', { name: 'Send private share', exact: true }).click()
    await expect(
      page.getByText('Share sent. If the recipient can receive it, it will appear in their inbox.'),
    ).toBeVisible()
  })

  test('keyboard-only accept completes the share action', async ({ page }) => {
    await page.goto(reviewUrl('/shares/share-b', 'shopper-b'))
    const accept = page.getByRole('button', { name: 'Accept', exact: true })
    await accept.focus()
    await expect(accept).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Weekend estate-sale lead · received · accepted/)).toBeVisible()
    await expect(accept).toHaveCount(0)
  })

  test('loading, empty, error, blocked, and permission-denied states stay honest', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/shares', 'shopper-b', 'loading'))
    await expect(page.getByText('Loading shares…')).toBeVisible()

    await page.goto(reviewUrl('/shares', 'shopper-b', 'empty'))
    await expect(page.getByText('No pending shares.')).toBeVisible()

    for (const state of ['error', 'blocked', 'permission-denied'] as const) {
      await page.goto(reviewUrl('/shares', 'shopper-b', state))
      await expect(page.getByRole('alert')).toContainText('could not update this private item')
    }

    await page.goto(reviewUrl('/trip-ideas', 'shopper-b', 'empty'))
    await expect(page.getByText('Your private trip ideas will appear here.')).toBeVisible()
  })

  test('reflow at 320 CSS px (the layout a 200 percent zoom produces) keeps the inbox usable', async ({
    page,
  }) => {
    // Playwright cannot emulate browser zoom; a 320 CSS px viewport reproduces the
    // 200 percent-zoom layout at 640 physical px and exercises the same reflow path.
    await page.goto(reviewUrl('/shares', 'shopper-b'))
    await expect(page.getByRole('heading', { level: 1, name: 'Candidate shares' })).toBeVisible()
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

  test('cross-account share access is denied', async ({ page }) => {
    await page.goto(reviewUrl('/shares/share-b', 'shopper-a'))
    await expect(page.getByRole('alert')).toContainText('could not update this private item')
  })

  test('representative and administrator accounts cannot open shopper shares', async ({ page }) => {
    for (const identity of ['representative', 'administrator'] as const) {
      await page.goto(reviewUrl('/shares/share-b', identity))
      await expect(page.getByText('This private area is unavailable')).toBeVisible()
      await expect(
        page.getByText(/does not have access to shopper-private information/),
      ).toBeVisible()
    }
  })

  test('actionable targets meet the 48×48 px baseline', async ({ page }) => {
    for (const path of ['/shares', '/shares/share-b', '/trip-ideas', '/capture']) {
      await page.goto(reviewUrl(path, path === '/capture' ? 'shopper-a' : 'shopper-b'))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await assertMinimumTargets(page)
    }
  })

  test('captures the approved viewport evidence when explicitly requested', async ({
    page,
  }, testInfo) => {
    test.skip(!process.env.CAPTURE_UI06_EVIDENCE, 'Evidence capture is opt-in.')
    const targets = [
      ['shopper-b', '/shares', 'shares'],
      ['shopper-b', '/shares/share-b', 'share-details'],
      ['shopper-b', '/shares/share-b-sent', 'outbox-share'],
      ['shopper-b', '/trip-ideas', 'trip-ideas'],
      ['shopper-b', '/account/privacy/blocked-senders', 'blocked-senders'],
      ['shopper-a', '/capture', 'capture'],
    ] as const
    for (const [identity, path, slug] of targets) {
      await page.goto(reviewUrl(path, identity))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.screenshot({
        path: `docs/evidence/ui-06/${testInfo.project.name}-${slug}.png`,
        fullPage: true,
      })
    }
  })
})
