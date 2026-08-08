import { expect, test, type Page } from '@playwright/test'

function reviewUrl(
  path: string,
  identity: 'anonymous' | 'shopper-a' | 'shopper-b',
  state = 'success',
) {
  return `${path}${path.includes('?') ? '&' : '?'}reviewAs=${identity}&reviewState=${state}`
}

async function assertNoHorizontalOverflow(page: Page) {
  const viewportWidths = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(viewportWidths.innerWidth).toBe(320)
  expect(
    await page.locator('body').evaluate((body) =>
      Array.from(body.querySelectorAll<HTMLElement>('*')).flatMap((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.right > document.documentElement.clientWidth + 1
          ? [
              {
                tag: element.tagName,
                text: element.textContent?.trim().slice(0, 60),
                right: rect.right,
              },
            ]
          : []
      }),
    ),
  ).toEqual([])
  expect(viewportWidths).toMatchObject({ scrollWidth: viewportWidths.clientWidth })
}

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

test.describe('UI-05 authentication and private-shopper acceptance', () => {
  test('Shopper A and Shopper B receive distinct Saved and New Since data', async ({ page }) => {
    await page.goto(reviewUrl('/saved', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Saved stores' })).toBeFocused({
      timeout: 15_000,
    })
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()
    const shopperACard = page.getByRole('listitem').filter({ hasText: 'Blue Finch Curios' })
    await expect(shopperACard.getByRole('img')).toHaveAccessibleName(/no store photo/i)
    await expect(shopperACard).toContainText('Check current hours before you go')
    await expect(shopperACard).toContainText('Your private saved-store record')
    await expect(shopperACard).toContainText(/listing freshness.*store details/i)
    await expect(page.getByText('Cedar & Brass')).toHaveCount(0)

    await page.goto(reviewUrl('/saved', 'shopper-b'))
    await expect(page.getByText('Cedar & Brass')).toBeVisible()
    await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)

    await page.goto(reviewUrl('/new-since', 'shopper-a'))
    await page.getByLabel('Choose an area').selectOption('topeka')
    await expect(page.getByRole('list', { name: /new stores/i })).toContainText('Blue Finch Curios')
    await expect(page.getByRole('list', { name: /new stores/i })).toContainText('Topeka area')
    await expect(page.getByRole('list', { name: /new stores/i })).toContainText(
      'Account-scoped catalog change record',
    )

    await page.goto(reviewUrl('/new-since', 'shopper-b'))
    await page.getByLabel('Choose an area').selectOption('topeka')
    await expect(page.getByRole('list', { name: /new stores/i })).toContainText('Cedar & Brass')
    await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
  })

  test('Shopper A correction status remains hidden from Shopper B', async ({ page }) => {
    await page.goto(reviewUrl('/corrections/correction-a', 'shopper-a'))
    await expect(page.getByRole('status')).toHaveText('Correction status: triaged.')

    await page.goto(reviewUrl('/corrections/correction-a', 'shopper-b'))
    await expect(page.getByRole('alert')).toContainText(/couldn't complete that private action/i)
    await expect(page.getByText(/triaged/i)).toHaveCount(0)
  })

  test('private shopper loading, empty, error, and success states are deterministic', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/saved', 'shopper-a', 'loading'))
    await expect(page.getByRole('status')).toHaveText('Loading…')

    await page.goto(reviewUrl('/saved', 'shopper-a', 'empty'))
    await expect(page.getByRole('status')).toHaveText('You have no saved stores yet.')

    await page.goto(reviewUrl('/saved', 'shopper-a', 'error'))
    await expect(page.getByRole('alert')).toBeFocused()
    await expect(page.getByRole('button', { name: 'Try saved stores again' })).toBeVisible()

    await page.goto(reviewUrl('/saved', 'shopper-a', 'success'))
    await expect(page.getByRole('list', { name: 'Saved stores' })).toBeVisible()
  })

  test('anonymous private entry redirects to sign-in and account controls are reviewable', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/saved', 'anonymous'))
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/)
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeFocused()
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible()

    await page.goto(reviewUrl('/account', 'shopper-a'))
    const accountControls = page.getByRole('navigation', { name: 'Account controls' })
    await expect(accountControls.getByRole('link', { name: 'Privacy choices' })).toBeVisible()
    await expect(accountControls.getByRole('link', { name: 'Export my data' })).toBeVisible()
    await expect(accountControls.getByRole('link', { name: 'Delete my account' })).toBeVisible()
    await expect(accountControls.getByRole('link', { name: 'Private history' })).toBeVisible()

    await page.goto(reviewUrl('/account/privacy', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy controls' })).toBeFocused()
    await expect(page.getByText(/account is active/i)).toBeVisible()
  })

  test('sign-in, MFA, and enumeration-safe recovery complete through the real UI', async ({
    page,
  }) => {
    await page.goto('/auth/sign-in?returnTo=%2Fsaved&reviewAs=shopper-a&reviewState=success')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText(/enter your email and password/i)

    await page.getByLabel('Email').fill('shopper-a@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/saved/)
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()

    await page.goto('/auth/sign-in?returnTo=%2Fsaved&reviewAs=shopper-a&reviewState=success')
    await page.getByLabel('Email').fill('mfa@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeFocused()
    await page.getByLabel('Authentication code').fill('123456')
    await page.getByRole('button', { name: 'Verify code' }).click()
    await expect(page).toHaveURL(/\/saved/)
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()

    await page.goto(reviewUrl('/auth/recovery', 'anonymous'))
    await page.getByLabel('Email').fill('unknown@local.invalid')
    await page.getByRole('button', { name: 'Send recovery email' }).click()
    await expect(page.getByRole('status')).toContainText(/if an account exists/i)
  })

  test('just-in-time registration and session expiry or revocation fail closed', async ({
    page,
  }) => {
    await page.goto('/auth/register?returnTo=%2Fsaved&reviewAs=anonymous&reviewState=success')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText(/valid email.*12 through 128/i)
    await page.getByLabel('Email').fill('new-shopper@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('checkbox', { name: /18 or older/i }).check()
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeFocused()
    await expect(page.getByRole('status')).toContainText(/no private action has been saved/i)

    await page.goto('/saved?reviewAs=shopper-a&reviewState=success&reviewSession=expired')
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/)
    await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)

    await page.goto('/saved?reviewAs=shopper-a&reviewState=success&reviewSession=revoked')
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/, { timeout: 4_000 })
    await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
  })

  test('JIT Save resumes once, while explicit cancel prevents every later replay', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/stores/blue-finch-curios', 'anonymous'))
    await page.evaluate(() =>
      sessionStorage.setItem(
        'antique-trail:jit-private-action:v1',
        JSON.stringify({
          kind: 'save-store',
          storeId: '00000000-0000-4000-8000-000000000001',
          returnTo: '/stores/blue-finch-curios?reviewAs=shopper-a&reviewState=success',
          expiresAt: Date.now() + 60_000,
        }),
      ),
    )
    await page.goto(reviewUrl('/stores/blue-finch-curios', 'shopper-a'))
    await expect(page.getByText('Store saved after sign-in.')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Store saved after sign-in.')).toHaveCount(0)

    await page.goto(reviewUrl('/stores/blue-finch-curios', 'anonymous'))
    await page.getByRole('link', { name: 'Sign in to save store' }).click()
    await page.getByRole('link', { name: 'Cancel and return without saving' }).click()
    await expect(page.getByRole('heading', { name: 'Blue Finch Curios' })).toBeFocused()
    await expect
      .poll(() =>
        page.evaluate(() => sessionStorage.getItem('antique-trail:jit-private-action:v1')),
      )
      .toBeNull()
    await page.goto(reviewUrl('/stores/blue-finch-curios', 'shopper-a'))
    await expect(page.getByText('Store saved after sign-in.')).toHaveCount(0)
  })

  test('offline state pauses Save and memory mutations without hiding private data', async ({
    page,
    context,
  }) => {
    await page.goto(reviewUrl('/saved', 'shopper-a'))
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await expect(page.getByRole('status')).toContainText(/private changes are paused/i)
    await expect(page.getByRole('button', { name: 'Save unavailable offline' })).toBeDisabled()
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
  })

  test('memory edit, delete, Undo, correction submission, and status complete in UI', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/stores/blue-finch-curios/memory', 'shopper-a'))
    await page.getByLabel('Rating').selectOption('5')
    await page.getByLabel('Private note').fill('Return for the oak map cabinet.')
    await page.getByLabel('Visit month').fill('2026-08')
    await page.getByRole('button', { name: 'Save private memory' }).click()
    await expect(page.getByRole('status')).toHaveText('Private memory saved.')
    await page.getByRole('button', { name: 'Delete memory' }).click()
    await expect(page.getByRole('button', { name: 'Keep memory' })).toBeFocused()
    const confirmationStyles = await page.evaluate(() => {
      const keep = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Keep memory',
      )
      const remove = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Yes, delete memory',
      )
      if (!keep || !remove) throw new Error('Memory confirmation controls missing.')
      return {
        keepBackground: getComputedStyle(keep).backgroundColor,
        keepColor: getComputedStyle(keep).color,
        removeBackground: getComputedStyle(remove).backgroundColor,
        removeColor: getComputedStyle(remove).color,
      }
    })
    expect(confirmationStyles.keepBackground).not.toBe(confirmationStyles.removeBackground)
    expect(confirmationStyles.keepColor).not.toBe(confirmationStyles.removeColor)
    await page.getByRole('button', { name: 'Keep memory' }).click()
    await expect(page.getByRole('button', { name: 'Delete memory' })).toBeFocused()
    await page.getByRole('button', { name: 'Delete memory' }).click()
    await page.getByRole('button', { name: 'Yes, delete memory' }).click()
    await expect(page.getByRole('status')).toHaveText('Private memory deleted.')
    await page.getByRole('button', { name: 'Undo memory deletion' }).click()
    await expect(page.getByRole('status')).toHaveText('Private memory restored.')
    await expect(page.getByLabel('Private note')).toHaveValue('Return for the oak map cabinet.')

    await page.goto(reviewUrl('/stores/blue-finch-curios/correction', 'shopper-a'))
    await page.getByLabel('What needs correction?').selectOption('hours')
    await page.getByLabel('Description').fill('Sunday closing time should be 4:00 PM.')
    await page.getByLabel('Public source URL (optional)').fill('https://example.invalid/hours')
    await page.getByRole('button', { name: 'Submit correction' }).click()
    await expect(page.getByRole('status')).toContainText(/correction submitted/i)
    await page.getByRole('link', { name: 'Track this correction' }).click()
    await expect(page.getByRole('status')).toContainText(/correction status: submitted/i)
  })

  test('export and deletion cancellation restore ordinary account access', async ({ page }) => {
    await page.goto(reviewUrl('/account/export', 'shopper-a'))
    await page.getByLabel('Email').fill('shopper-a@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByRole('button', { name: 'Request export' }).click()
    await expect(page.getByRole('status')).toContainText(/export status: ready/i)
    await expect(page.getByText(/no access token is shown/i)).toBeVisible()

    await page.goto(reviewUrl('/account/delete', 'shopper-a'))
    await page.getByLabel('Email').fill('shopper-a@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Schedule deletion' }).click()
    await expect(page.getByRole('heading', { name: 'Account deletion is scheduled' })).toBeFocused()
    await expect(page.getByRole('alert')).toContainText(/only cancellation.*sign-out/i)
    await page.getByRole('link', { name: 'Review cancellation', exact: true }).click()
    await expect(page).toHaveURL(/\/account\/delete\/cancel/)
    await expect(page.getByRole('heading', { name: 'Cancel account deletion' })).toBeFocused()
    await page.getByRole('button', { name: 'Cancel deletion' }).click()
    await expect(page.getByRole('status')).toHaveText('Account deletion was cancelled.')
    await page.goto(reviewUrl('/saved', 'shopper-a'))
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()
  })

  test('real keyboard activation and sign-out keep focus and private content safe', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/more', 'shopper-a'))
    await expect(page.getByRole('heading', { name: 'More' })).toBeFocused()
    await page.getByRole('link', { name: 'Saved Stores' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Saved stores' })).toBeFocused()
    const saveButton = page.getByRole('button', { name: 'Remove saved store' })
    await saveButton.focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('status')).toContainText(/store removed/i)

    await page.goto(reviewUrl('/account', 'shopper-a'))
    await page.getByRole('button', { name: 'Sign out' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeFocused()
    await expect(page.getByText('Signed in as a private Shopper account.')).toHaveCount(0)
  })

  test('Shopper A and B review paths reflow at 320px with 48px targets', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    for (const identity of ['shopper-a', 'shopper-b'] as const) {
      for (const path of [
        '/saved',
        '/new-since',
        '/account',
        '/account/privacy',
        '/stores/blue-finch-curios/memory',
        '/stores/blue-finch-curios/correction',
      ]) {
        await page.goto(reviewUrl(path, identity))
        await page.evaluate(() => {
          document.documentElement.style.scrollbarGutter = 'auto'
          document.documentElement.style.overflowY = 'scroll'
        })
        await assertNoHorizontalOverflow(page)
        await assertMinimumTargets(page)
        const navGeometry = await page
          .getByRole('navigation', { name: 'Primary navigation' })
          .evaluate((nav) => {
            const style = getComputedStyle(nav)
            const rect = nav.getBoundingClientRect()
            return { position: style.position, bottom: Math.round(innerHeight - rect.bottom) }
          })
        expect(navGeometry).toEqual({ position: 'fixed', bottom: 0 })
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
        await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeInViewport()
      }
    }
    await page.goto(reviewUrl('/auth/register', 'anonymous'))
    await page.evaluate(() => {
      document.documentElement.style.scrollbarGutter = 'auto'
      document.documentElement.style.overflowY = 'scroll'
    })
    await assertNoHorizontalOverflow(page)
    await assertMinimumTargets(page)
  })

  test('captures ordered UI-05 evidence when explicitly requested', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(!process.env.CAPTURE_UI05_EVIDENCE, 'Evidence capture is opt-in.')
    test.setTimeout(90_000)
    async function capture(name: string) {
      await page.screenshot({
        path: `docs/evidence/ui-05/${testInfo.project.name}-${name}.png`,
        fullPage: true,
      })
    }
    const captures = [
      { name: 'review', url: reviewUrl('/review', 'shopper-a'), heading: 'Human review harness' },
      {
        name: 'registration',
        url: reviewUrl('/auth/register', 'anonymous'),
        heading: 'Create your account',
      },
      {
        name: 'sign-in',
        url: '/auth/sign-in?returnTo=%2Fsaved&reviewAs=shopper-a&reviewState=success',
        heading: 'Sign in',
      },
      {
        name: 'recovery',
        url: reviewUrl('/auth/recovery', 'anonymous'),
        heading: 'Recover your account',
      },
      { name: 'shopper-a-saved', url: reviewUrl('/saved', 'shopper-a'), heading: 'Saved stores' },
      { name: 'shopper-b-saved', url: reviewUrl('/saved', 'shopper-b'), heading: 'Saved stores' },
      { name: 'account', url: reviewUrl('/account', 'shopper-a'), heading: 'Your account' },
      {
        name: 'privacy',
        url: reviewUrl('/account/privacy', 'shopper-a'),
        heading: 'Privacy controls',
      },
      {
        name: 'memory',
        url: reviewUrl('/stores/blue-finch-curios/memory', 'shopper-a'),
        heading: 'Private store memory',
      },
      {
        name: 'correction',
        url: reviewUrl('/stores/blue-finch-curios/correction', 'shopper-a'),
        heading: 'Suggest a correction',
      },
    ]
    for (const capture of captures) {
      await page.goto(capture.url)
      await expect(page.getByRole('heading', { level: 1, name: capture.heading })).toBeFocused()
      await page.screenshot({
        path: `docs/evidence/ui-05/${testInfo.project.name}-${capture.name}.png`,
        fullPage: true,
      })
    }

    await page.goto('/auth/sign-in?returnTo=%2Fsaved&reviewAs=shopper-a&reviewState=success')
    await page.getByLabel('Email').fill('mfa@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeFocused()
    await capture('mfa')

    await page.goto(reviewUrl('/new-since', 'shopper-a'))
    await page.getByLabel('Choose an area').selectOption('topeka')
    await expect(page.getByRole('link', { name: 'Blue Finch Curios' })).toBeVisible()
    await capture('new-since')

    await page.goto(reviewUrl('/saved', 'shopper-a'))
    await expect(page.getByRole('button', { name: 'Remove saved store' })).toBeVisible()
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await expect(page.getByRole('status')).toContainText(/private changes are paused/i)
    await capture('saved-offline')
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))

    await page.goto(reviewUrl('/stores/blue-finch-curios/memory', 'shopper-a'))
    await page.getByRole('button', { name: 'Delete memory' }).click()
    await expect(page.getByRole('button', { name: 'Keep memory' })).toBeFocused()
    await capture('memory-delete-confirmation')

    await page.goto(reviewUrl('/stores/blue-finch-curios/correction', 'shopper-a'))
    await page.getByLabel('Description').fill('Sunday closing time should be 4:00 PM.')
    await page.getByRole('button', { name: 'Submit correction' }).click()
    await expect(page.getByRole('status')).toContainText(/correction submitted/i)
    await capture('correction-submitted')

    await page.goto(reviewUrl('/account/export', 'shopper-a'))
    await page.getByLabel('Email').fill('shopper-a@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByRole('button', { name: 'Request export' }).click()
    await expect(page.getByRole('status')).toContainText(/export status: ready/i)
    await capture('export-ready')

    await page.goto(reviewUrl('/account/delete', 'shopper-a'))
    await page.getByLabel('Email').fill('shopper-a@local.invalid')
    await page.getByLabel('Password').fill('synthetic-password')
    await page.getByRole('button', { name: 'Confirm password' }).click()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Schedule deletion' }).click()
    await expect(page.getByRole('heading', { name: 'Account deletion is scheduled' })).toBeFocused()
    await capture('deletion-scheduled')
    await page.getByRole('link', { name: 'Review cancellation' }).click()
    await capture('deletion-cancel')
    await page.getByRole('button', { name: 'Cancel deletion' }).click()
    await expect(page.getByRole('status')).toHaveText('Account deletion was cancelled.')

    if (testInfo.project.name === 'mobile') {
      await page.setViewportSize({ width: 320, height: 900 })
      await page.goto(reviewUrl('/saved', 'shopper-a'))
      await page.evaluate(() => {
        document.documentElement.style.scrollbarGutter = 'auto'
        document.documentElement.style.overflowY = 'scroll'
      })
      await assertNoHorizontalOverflow(page)
      await capture('reflow-320')
    }

    await page.goto(reviewUrl('/saved', 'shopper-a', 'empty'))
    await expect(page.getByRole('status')).toHaveText('You have no saved stores yet.')
    await capture('saved-empty')
    await page.goto(reviewUrl('/saved', 'shopper-a', 'error'))
    await expect(page.getByRole('alert')).toBeFocused()
    await capture('saved-error')
    await page.goto(reviewUrl('/saved', 'shopper-a', 'loading'))
    await expect(page.getByRole('status')).toHaveText('Loading…')
    await capture('saved-loading')
    await page.goto(reviewUrl('/saved', 'shopper-a', 'blocked'))
    await expect(page.getByRole('alert')).toBeFocused()
    await capture('saved-blocked')
    await page.goto(reviewUrl('/corrections/correction-a', 'shopper-b', 'permission-denied'))
    await expect(page.getByRole('alert')).toBeFocused()
    await capture('correction-permission-denied')
    await page.goto('/saved?reviewAs=shopper-a&reviewState=success&reviewSession=expired')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeFocused()
    await capture('session-expired')
  })
})
