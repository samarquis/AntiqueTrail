import { expect, test, type Page } from '@playwright/test'

const reviewUrl = (path: string, state = 'success') =>
  `${path}?reviewAs=representative&reviewState=${state}`
const INVITATION_URL =
  '/partner/join?reviewAs=representative&reviewState=success#token=review-partner-invite'
const PARTNER_ERROR = "We couldn't continue this invitation. Check the link or try again."
const PORTAL_ERROR = "We couldn't update this store portal. Please try again."

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

test.describe('UI-08 representative onboarding and Store Portal', () => {
  test.describe.configure({ mode: 'serial' })

  test('role boundaries deny non-representatives without portal or onboarding data', async ({
    page,
  }) => {
    for (const identity of ['anonymous', 'shopper-a', 'administrator'] as const) {
      await page.goto(`/store-portal?reviewAs=${identity}&reviewState=success`)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Store Portal unavailable' }),
      ).toBeVisible()
      await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
    }

    await page.goto('/partner/draft?reviewAs=anonymous&reviewState=success')
    await expect(page.getByRole('alert')).toHaveText(PARTNER_ERROR)
    await expect(page.getByLabel('Store name')).toHaveCount(0)
  })

  test('invitation, consent, and the E-01 identity gate stay honest', async ({ page }) => {
    await page.goto(INVITATION_URL)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Review invitation & consent' }),
    ).toBeVisible()
    await expect(page.getByText('does not grant access or install anything')).toBeVisible()
    await page.getByLabel('Your name').fill('River Representative')
    await page.getByLabel('Your title or role').fill('Owner')
    await page.getByLabel('Store name').fill('Blue Finch Curios')
    await page.getByLabel('Owner-controlled email').fill('river@local.invalid')
    for (const box of await page.getByRole('checkbox').all()) await box.check()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)

    await page.goto(reviewUrl('/partner/verify'))
    await page.getByRole('button', { name: 'Check verification' }).click()
    await expect(page.getByRole('alert')).toHaveText(
      'Email verification is unavailable until the approved email provider gate passes.',
    )
  })

  test('partner status, draft submission, and exact claim are stateful and understandable', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/partner/status'))
    await expect(page.getByRole('status')).toContainText(
      'Invitation: consumed. Onboarding: approved.',
    )
    await page.goto(reviewUrl('/partner/draft'))
    await page.getByLabel('Store name').fill('Blue Finch Curios')
    await page.getByLabel('Address').fill('100 Synthetic Avenue')
    await page.getByLabel('Hours').fill('10 AM to 5 PM')
    await page.getByLabel('Website').fill('https://blue-finch.example.invalid')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('status')).toContainText('Draft status: draft.')
    await page.getByRole('button', { name: 'Submit draft for review' }).click()
    await expect(page.getByRole('status')).toContainText('Draft status: submitted.')

    await page.goto(reviewUrl('/partner/claim'))
    await page.getByRole('checkbox', { name: /read the updated material terms/i }).check()
    await page.getByRole('checkbox', { name: /continue voluntarily/i }).check()
    await page.getByRole('button', { name: 'Accept updated terms' }).click()
    await page.getByLabel('Store reference').fill('Blue Finch Curios')
    await page.getByLabel('Relationship to the store').fill('Owner')
    await page.getByLabel('Authority statement').fill('I am authorized to manage this one store.')
    await page.getByRole('button', { name: 'Submit claim' }).click()
    await expect(page.getByRole('status')).toContainText('Claim status: submitted.')
    await expect(
      page.getByText('Approved scope: this store only (Blue Finch Curios).'),
    ).toBeVisible()
    await page.getByLabel('Evidence reference').fill('published-business-contact')
    await page.getByRole('button', { name: 'Submit authority signal' }).click()
    await expect(page.getByRole('status')).toContainText('Claim status: verification_pending.')
    await page.getByRole('button', { name: 'Request authority recheck' }).click()
    await expect(page.getByText('Authority recheck due')).toBeVisible()
  })

  test('portal writes mutate the authorized Blue Finch workspace and M-01 never fabricates upload success', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/store-portal'))
    await expect(page.locator('main h1')).toHaveText('Blue Finch Curios')
    await expect(page.locator('dd').filter({ hasText: 'Hours verified 12 days ago' })).toBeVisible()
    await page.goto(reviewUrl('/store-portal/changes'))
    await expect(
      page.getByText(
        'Official images and screenshots are disabled until the M-01 media gate passes.',
      ),
    ).toBeVisible()
    await page.getByLabel('Requested value').fill('200 East Synthetic Avenue')
    await page.getByLabel('Reason for change').fill('Address correction')
    await page.getByRole('button', { name: 'Submit change request' }).click()
    await expect(page.getByText('Change request submitted for Administrator review')).toBeVisible()

    await page.goto(reviewUrl('/store-portal/updates'))
    await page.getByLabel('Headline').fill('Saturday finds')
    await page.getByLabel('Details').fill('Fresh synthetic inventory.')
    await page.getByRole('button', { name: 'Publish text update' }).click()
    await expect(page.getByText('Text update published.')).toBeVisible()
    await expect(page.getByText('Saturday finds — live')).toBeVisible()
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Saturday finds' })
      .getByRole('button', { name: 'Archive', exact: true })
      .click()
    await expect(page.getByText('Saturday finds — archived')).toBeVisible()

    await page.goto(reviewUrl('/store-portal/links'))
    await page.getByLabel('Official profile URL').fill('https://www.facebook.com/blue-finch')
    await page.getByRole('button', { name: 'Publish official link' }).click()
    await expect(page.getByText('Official link published.')).toBeVisible()
    await expect(page.getByText('facebook: https://facebook.com/blue-finch')).toBeVisible()

    await page.goto(reviewUrl('/store-portal/support'))
    await page.getByLabel('Subject').fill('Synthetic portal question')
    await page.getByLabel('Details').fill('Please review this synthetic request.')
    await page.getByRole('button', { name: 'Submit support request' }).click()
    await expect(page.getByText('Support request submitted.')).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 3, name: 'Synthetic portal question' }),
    ).toBeVisible()
  })

  test('loading, empty, errors, blocked and permission states do not fabricate data', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/partner/status', 'loading'))
    await expect(page.getByRole('status')).toHaveText('Loading…')
    await page.goto(reviewUrl('/store-portal', 'loading'))
    await expect(page.getByRole('status')).toHaveText('Loading Store Portal…')
    await page.goto(reviewUrl('/partner/status', 'empty'))
    await expect(page.getByRole('status')).toContainText(
      'Invitation: registration_pending. Onboarding: draft.',
    )
    await page.goto(reviewUrl('/store-portal/updates', 'empty'))
    await expect(page.getByText('No Store Updates yet.')).toBeVisible()
    for (const state of ['error', 'blocked', 'permission-denied'] as const) {
      await page.goto(reviewUrl('/partner/status', state))
      await expect(page.getByRole('alert')).toHaveText(PARTNER_ERROR)
      await page.goto(reviewUrl('/store-portal', state))
      await expect(page.getByRole('alert')).toHaveText(PORTAL_ERROR)
      await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
    }
  })

  test('reflow, targets, keyboard focus, and H1 navigation meet the review baseline', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/store-portal'))
    await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeFocused()
    await page.getByRole('link', { name: 'Hours & holidays' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Hours & holidays' })).toBeFocused()
    await page.keyboard.press('Tab')
    const focus = page.locator(':focus')
    await expect(focus).toBeVisible()
    expect(await focus.evaluate((element) => getComputedStyle(element).boxShadow !== 'none')).toBe(
      true,
    )
    for (const path of [
      '/partner/verify',
      '/partner/status',
      '/partner/draft',
      '/partner/claim',
      '/store-portal',
      '/store-portal/hours',
      '/store-portal/changes',
      '/store-portal/updates',
      '/store-portal/links',
      '/store-portal/support',
      '/store-portal/preview',
    ]) {
      await page.goto(reviewUrl(path))
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await assertMinimumTargets(page)
    }
    await page.goto(reviewUrl('/store-portal/changes'))
    await page.setViewportSize({ width: 320, height: 640 })
    const overflow = await page.locator('body').evaluate((body) =>
      Array.from(body.querySelectorAll<HTMLElement>('*')).flatMap((element) => {
        const rect = element.getBoundingClientRect()
        return rect.right > document.documentElement.clientWidth + 1 ? [element.tagName] : []
      }),
    )
    expect(overflow).toEqual([])

    await page.goto(reviewUrl('/store-portal'))
    await page.setViewportSize({ width: 412, height: 727 })
    const [portalLink, globalNav] = await Promise.all([
      page.getByRole('link', { name: 'Official links' }).boundingBox(),
      page.getByRole('navigation', { name: 'Primary navigation' }).boundingBox(),
    ])
    expect(portalLink).not.toBeNull()
    expect(globalNav).not.toBeNull()
    expect(
      portalLink!.y + portalLink!.height <= globalNav!.y ||
        portalLink!.y >= globalNav!.y + globalNav!.height,
    ).toBe(true)
  })

  test('captures the approved viewport evidence when explicitly requested', async ({
    page,
  }, testInfo) => {
    test.skip(!process.env.CAPTURE_UI08_EVIDENCE, 'Evidence capture is opt-in.')
    const targets = [
      [INVITATION_URL, 'partner-invitation'],
      [reviewUrl('/partner/status'), 'partner-status'],
      [reviewUrl('/store-portal'), 'portal-home'],
      [reviewUrl('/store-portal/changes'), 'portal-changes'],
      [reviewUrl('/store-portal/support'), 'portal-support'],
    ] as const
    for (const [url, slug] of targets) {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.screenshot({
        path: `docs/evidence/ui-08/${testInfo.project.name}-${slug}.png`,
        fullPage: true,
      })
    }
  })
})
