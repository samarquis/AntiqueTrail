import { expect, test, type Page } from '@playwright/test'

const reviewUrl = (path: string, identity: string, state = 'success') =>
  `${path}?reviewAs=${identity}&reviewState=${state}`
const ADMIN_ERROR = 'This item is not available.'

async function assertMinimumTargets(page: Page) {
  expect(
    await page.locator('a, button, input, select, textarea').evaluateAll((elements) =>
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

test.describe('UI-09 administrator, moderation, and operational review', () => {
  test.describe.configure({ mode: 'serial' })

  test('administrator reaches privileged routes while every non-admin role is redirected', async ({
    page,
  }) => {
    for (const path of ['/admin', '/admin/access', '/admin/partners', '/admin/reviews']) {
      await page.goto(reviewUrl(path, 'administrator'))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    }
    for (const identity of ['anonymous', 'shopper-a', 'representative'] as const) {
      await page.goto(reviewUrl('/admin', identity))
      await expect(page).toHaveURL(/\/stores/)
      await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Review Blue Finch Curios' })).toHaveCount(0)
    }
  })

  test('review queue opens its exact context and resolves the assigned case audibly', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/admin', 'administrator'))
    await expect(page.locator('.review-queue__workspace')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Assigned cases' })).toBeVisible()
    await expect(page.getByLabel('Assigned review cases')).toHaveCount(1)
    await expect(page.getByLabel('Assigned review cases').getByRole('button')).toHaveCount(2)
    await page.getByRole('button', { name: 'Review Blue Finch Curios' }).click()
    await expect(
      page.getByText('Submitted fields are read-only. Decisions apply only to this case.'),
    ).toBeVisible()
    await expect(
      page.getByText('200 East Synthetic Avenue, Topeka, KS', { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Current and requested listing preview')).toContainText(
      'Requested address',
    )
    await page.getByLabel('Decision reason').fill('Address verified from submitted evidence')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByLabel('Confirm case decision')).toContainText(
      'immutable submission remains',
    )
    await page.getByRole('button', { name: 'Confirm approve', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Case approved.')
    await expect(page.getByLabel('Resolved case outcome')).toBeVisible()
    await page.getByRole('button', { name: 'Back to Queue' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'New stores (1)' })).toBeVisible()
  })

  test('onboarding approval exposes only its allowlisted case context and exact atomic outcome', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/admin', 'administrator'))
    const onboardingCategory = page.getByRole('button', { name: 'New stores (1)' })
    await onboardingCategory.focus()
    await page.keyboard.press('Enter')
    const onboardingReview = page.getByRole('button', { name: 'Review Juniper House Antiques' })
    await onboardingReview.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Pilot Store Draft decision summary')).toContainText(
      'Consent: current. Authority: verified. Identity: verified.',
    )
    await expect(
      page.getByText('410 West Synthetic Avenue, Topeka, KS', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/exact preview hash/i)).toHaveCount(0)
    await page.getByLabel('Decision reason').fill('Consent and authority verified')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByLabel('Confirm case decision')).toContainText(
      'grant Store Representative scope only for that store',
    )
    await page.getByRole('button', { name: 'Confirm approve', exact: true }).click()
    await expect(page.getByLabel('Resolved case outcome')).toContainText(
      'Pilot Store Record created for Juniper House Antiques',
    )
    await expect(page.getByLabel('Resolved case outcome')).toContainText(
      'Store Representative scope granted: Juniper House Antiques only.',
    )
    await expect(page.getByLabel('Resolved case outcome')).toContainText(
      'No unrelated data or authority changed.',
    )

    await page.getByRole('button', { name: 'Back to Queue' }).click()
    await expect(page.getByRole('button', { name: 'New stores (0)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Store changes (1)' })).toBeVisible()

    await page.setViewportSize({ width: 320, height: 900 })
    expect(
      await page
        .locator('body')
        .evaluate(
          (body) =>
            Array.from(body.querySelectorAll<HTMLElement>('*')).filter(
              (element) =>
                element.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
            ).length,
        ),
    ).toBe(0)
  })

  test('access safety requires preview before regrant and shows merge consequences', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/admin/access', 'administrator'))
    await expect(page.getByText('Shopper activity is never shown here.')).toBeVisible()
    await page.getByRole('button', { name: 'Preview revoke Blue Finch Curios scope' }).click()
    await page.getByLabel('Administrative reason').fill('authority withdrawn')
    await page.getByRole('button', { name: 'Confirm revoke Blue Finch Curios scope' }).click()
    await expect(page.getByText('Blue Finch Curios — River — revoked')).toBeVisible()
    await page.getByRole('button', { name: 'Preview regrant Blue Finch Curios scope' }).click()
    await expect(page.getByText('Confirm exact scope: Blue Finch Curios for River.')).toBeVisible()
    await page.getByLabel('Administrative reason').fill('authority reverified')
    await page.getByRole('button', { name: 'Confirm regrant Blue Finch Curios scope' }).click()
    await expect(page.getByText('Blue Finch Curios — River — active')).toBeVisible()
    await page.getByLabel('Canonical store ID').fill('store-blue-finch')
    await page.getByLabel('Duplicate store ID').fill('store-cedar-brass')
    await page.getByRole('button', { name: 'Preview duplicate merge' }).click()
    await expect(page.getByText('12 safe references can move.')).toBeVisible()
    await expect(page.getByText('1 conflicts will remain quarantined.')).toBeVisible()
    await expect(page.getByText('Representative authority will not move.')).toBeVisible()
    await page.getByRole('button', { name: 'Execute this merge' }).click()
    await page.getByRole('button', { name: 'Roll back this merge' }).click()
    await expect(page.getByRole('button', { name: 'Execute this merge' })).toHaveCount(0)
  })

  test('partner decision, signal verification, and moderation actions mutate their local cases', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/admin/partners', 'administrator'))
    await page.getByLabel('Exact claim ID').fill('claim-synthetic')
    await page.getByRole('button', { name: 'Open exact claim' }).click()
    await expect(page.getByText('Only channel metadata is shown here.')).toBeVisible()
    await page.getByLabel('Signal decision reason').fill('confirmed')
    await page.getByLabel('Signal decision key').fill('signal-1')
    await page.getByRole('button', { name: /Verify owner attestation signal/ }).click()
    await expect(page.getByLabel('Confirm authority signal decision')).toContainText(
      'adds the pending signal',
    )
    await page.getByRole('button', { name: 'Confirm verify signal' }).click()
    await expect(page.getByText('Verified signals: 2.')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Signal verified and added')
    await page.getByLabel('Decision', { exact: true }).selectOption('approve')
    await page.getByLabel('Reason code').fill('verified_authority')
    await page.getByLabel('Decision key').fill('decision-1')
    await page.getByRole('button', { name: 'Apply decision' }).click()
    await expect(page.getByText(/Confirm approve: this changes/)).toBeVisible()
    await page.getByRole('button', { name: 'Confirm approve decision' }).click()
    await expect(page.getByText('approved')).toBeVisible()

    await page.goto(reviewUrl('/admin/reviews', 'administrator'))
    await page.getByLabel('Decision reason').fill('confirmed spam')
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByLabel('Confirm moderation decision')).toContainText(
      'public moderation state',
    )
    await page.getByRole('button', { name: 'Confirm Remove' }).click()
    await expect(page.getByText('State: removed')).toBeVisible()
    await expect(page.getByText('prior_decision: confirmed spam')).toBeVisible()
    await expect(page.getByLabel('Resolved moderation outcome')).toContainText(
      'Author notice is queued',
    )
    await expect(page.getByLabel('Resolved moderation outcome')).toContainText(
      'Public aggregate result',
    )
    await expect(page.getByRole('button', { name: 'Back to Queue' })).toBeVisible()
  })

  test('partner signal rejection resolves only the pending signal with an auditable outcome', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/admin/partners', 'administrator'))
    await page.getByLabel('Exact claim ID').fill('claim-synthetic')
    await page.getByRole('button', { name: 'Open exact claim' }).click()
    await page.getByLabel('Signal decision reason').fill('insufficient authority')
    await page.getByLabel('Signal decision key').fill('reject-signal-1')
    await page.getByRole('button', { name: /Reject owner attestation signal/ }).click()
    await expect(page.getByLabel('Confirm authority signal decision')).toContainText(
      'resolves and removes',
    )
    await page.getByRole('button', { name: 'Confirm reject signal' }).click()
    await expect(page.getByText('Verified signals: 1.')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Pending signal resolved and removed')
  })

  test('partner invitation action clears the exact-claim heading', async ({ page }) => {
    await page.goto(reviewUrl('/admin/partners', 'administrator'))
    await expect(page.getByRole('button', { name: 'Create synthetic invitation' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Exact listing claim' })).toBeVisible()
    const [button, heading] = await Promise.all([
      page.getByRole('button', { name: 'Create synthetic invitation' }).boundingBox(),
      page.getByRole('heading', { level: 2, name: 'Exact listing claim' }).boundingBox(),
    ])
    expect(button).not.toBeNull()
    expect(heading).not.toBeNull()
    expect(button!.y + button!.height).toBeLessThanOrEqual(heading!.y)
  })

  test('operational status remains honestly not configured inside the app landmark', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/status', 'administrator'))
    await expect(
      page.locator('main').getByRole('heading', { level: 1, name: 'Service status' }),
    ).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Operational contacts are not published')
  })

  test('loading, empty, error, blocked, and permission-denied states stay honest', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/admin', 'administrator', 'loading'))
    await expect(page.getByRole('status')).toContainText('Loading review cases')
    await expect(page.locator('.review-queue__workspace')).toBeVisible()
    await expect(page.getByText('No assigned review cases.')).toHaveCount(0)
    await page.goto(reviewUrl('/admin/access', 'administrator', 'loading'))
    await expect(page.getByRole('status')).toContainText('Loading Store Representative scopes')
    await expect(page.getByText('No Store Representative scopes.')).toHaveCount(0)
    await page.goto(reviewUrl('/admin', 'administrator', 'empty'))
    await expect(page.getByText('No assigned review cases.')).toBeVisible()
    await expect(page.locator('.review-queue__state')).toContainText('nothing to decide')
    await page.goto(reviewUrl('/admin/access', 'administrator', 'empty'))
    await expect(page.getByText('No Store Representative scopes.')).toBeVisible()
    for (const state of ['error', 'blocked', 'permission-denied'] as const) {
      await page.goto(reviewUrl('/admin', 'administrator', state))
      await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()
      await expect(page.getByRole('status')).toContainText(ADMIN_ERROR)
      await expect(page.getByRole('button', { name: 'Retry review queue' })).toBeVisible()
    }
    await page.goto(reviewUrl('/admin', 'administrator', 'error'))
    await page.getByRole('button', { name: 'Retry review queue' }).click()
    await expect(page.getByRole('button', { name: 'Review Blue Finch Curios' })).toBeVisible()
    await page.goto(reviewUrl('/admin/access', 'administrator', 'blocked'))
    await expect(
      page.getByRole('button', { name: 'Retry Store Representative scopes' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Retry Store Representative scopes' }).click()
    await expect(page.getByText('Blue Finch Curios — River — active')).toBeVisible()
  })

  test('reflow, targets, keyboard operation, and focus meet the review baseline', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/admin/access', 'administrator'))
    await page.setViewportSize({ width: 320, height: 640 })
    const overflow = await page
      .locator('body')
      .evaluate(
        (body) =>
          Array.from(body.querySelectorAll<HTMLElement>('*')).filter(
            (element) =>
              element.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
          ).length,
      )
    expect(overflow).toBe(0)
    await page.goto(reviewUrl('/admin', 'administrator'))
    await page.setViewportSize({ width: 320, height: 640 })
    await expect(page.locator('.review-queue__workspace')).toBeVisible()
    await assertMinimumTargets(page)
    expect(
      await page
        .locator('body')
        .evaluate(
          (body) =>
            Array.from(body.querySelectorAll<HTMLElement>('*')).filter(
              (element) =>
                element.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
            ).length,
        ),
    ).toBe(0)
    for (const path of [
      '/admin',
      '/admin/access',
      '/admin/partners',
      '/admin/reviews',
      '/status',
    ]) {
      await page.goto(reviewUrl(path, 'administrator'))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await assertMinimumTargets(page)
    }
    await page.goto(reviewUrl('/admin/access', 'administrator'))
    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeFocused()
    await page.getByRole('button', { name: 'Review Blue Finch Curios' }).focus()
    const focus = await page.locator(':focus').evaluate((element) => {
      const style = getComputedStyle(element)
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none'
    })
    expect(focus).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: 'Blue Finch Curios' })).toBeVisible()
  })

  test('mobile fixed navigation does not cover the moderation confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 })
    await page.goto(reviewUrl('/admin/reviews', 'administrator'))
    await page.getByLabel('Decision reason').fill('confirmed spam')
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    const confirm = page.getByRole('button', { name: 'Confirm Remove' })
    await confirm.scrollIntoViewIfNeeded()
    const covered = await confirm.evaluate((button) => {
      const nav = document.querySelector<HTMLElement>('.site-header nav')!
      return button.getBoundingClientRect().bottom > nav.getBoundingClientRect().top
    })
    expect(covered).toBe(false)
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveText(
      /Review.*Access.*More/,
    )
  })

  test('mobile admin routes reserve space above fixed navigation for their last action', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 })
    for (const [path, label] of [
      ['/admin', 'Review Blue Finch Curios'],
      ['/admin/access', 'Preview revoke Blue Finch Curios scope'],
      ['/admin/partners', 'Create synthetic invitation'],
      ['/admin/reviews', 'Dismiss Report'],
    ] as const) {
      await page.goto(reviewUrl(path, 'administrator'))
      const target = page.getByRole('button', { name: label })
      await target.scrollIntoViewIfNeeded()
      const covered = await target.evaluate((element) => {
        const nav = document.querySelector<HTMLElement>('.site-header nav')!
        return element.getBoundingClientRect().bottom > nav.getBoundingClientRect().top
      })
      expect(covered).toBe(false)
    }
  })

  test('captures the approved viewport evidence when explicitly requested', async ({
    page,
  }, testInfo) => {
    test.skip(!process.env.CAPTURE_UI09_EVIDENCE, 'Evidence capture is opt-in.')
    for (const [path, slug] of [
      ['/admin', 'queue'],
      ['/admin/access', 'access'],
      ['/admin/partners', 'partners'],
      ['/admin/reviews', 'moderation'],
      ['/status', 'status'],
    ] as const) {
      await page.goto(reviewUrl(path, 'administrator'))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (slug === 'moderation') {
        await page.getByLabel('Decision reason').fill('confirmed spam')
        await page.getByRole('button', { name: 'Remove', exact: true }).click()
        await page.getByRole('button', { name: 'Confirm Remove' }).click()
        await expect(page.getByLabel('Resolved moderation outcome')).toBeVisible()
      }
      await page.screenshot({
        path: `docs/evidence/ui-09/${testInfo.project.name}-${slug}.png`,
        fullPage: true,
      })
    }
  })
})
