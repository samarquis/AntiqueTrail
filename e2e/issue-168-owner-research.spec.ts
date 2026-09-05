import { expect, test, type Page } from '@playwright/test'

type ResearchState = {
  kind: 'existing_claim' | 'add_store' | null
  state: 'ready' | 'draft' | 'submitted'
  draft: Record<string, unknown> | null
}

async function admit(page: Page, denied = false) {
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'synthetic-research-token',
        refresh_token: 'synthetic-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: '80000000-0000-4000-8000-000000000001', aud: 'authenticated' },
      }),
    })
  })
  await page.route('**/rest/v1/rpc/register_current_session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' })
  })
  const state: ResearchState = { kind: null, state: 'ready', draft: null }
  await page.route('**/rest/v1/rpc/owner_research_command', async (route) => {
    if (denied) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' })
      return
    }
    const request = route.request().postDataJSON() as {
      p_operation: string
      p_payload: { kind?: ResearchState['kind']; draft?: Record<string, unknown> }
    }
    if (request.p_operation === 'start') {
      state.kind = request.p_payload.kind ?? null
      state.state = 'draft'
      state.draft = {
        fixture: state.kind === 'existing_claim' ? 'existing-store-a' : 'new-store-a',
        relationship: 'owner',
        ownerFactsConfirmed: false,
        reviewedFactsUnderstood: false,
      }
    }
    if (request.p_operation === 'save') state.draft = request.p_payload.draft ?? null
    if (request.p_operation === 'submit') {
      if (!state.draft?.ownerFactsConfirmed || !state.draft.reviewedFactsUnderstood) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' })
        return
      }
      state.state = 'submitted'
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        runId: '00000000-0000-4000-8000-000000000168',
        audience: 'synthetic',
        ...state,
        updatedAt: '2026-09-03T00:00:00Z',
      }),
    })
  })
}

async function signIn(page: Page) {
  await page.getByLabel('Account email').fill('participant@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password')
  await page.getByRole('button', { name: 'Verify invitation' }).click()
}

test('denies unadmitted visitors without revealing the owner flow', async ({ page }) => {
  await admit(page, true)
  await page.goto('/owner-research.html')
  await expect(page.getByRole('alert')).toHaveText(/research experience is unavailable/i)
  await expect(page.getByRole('heading', { name: /Help antique shoppers/ })).toHaveCount(0)
})

for (const scenario of [
  { radio: 'Yes, claim the listed Synthetic store', label: 'existing store claim' },
  { radio: 'No, add the missing Synthetic store', label: 'add missing store' },
]) {
  test(`completes the ${scenario.label} research path`, async ({ page }) => {
    await admit(page)
    await page.goto('/owner-research.html')
    await signIn(page)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive',
    )
    await expect(page.getByText(/Private research artifact · Synthetic data only/)).toBeVisible()
    for (const [name, path] of [
      ['support', '/help'],
      ['security', '/security'],
      ['privacy', '/privacy'],
      ['terms', '/terms'],
      ['status', '/status'],
    ])
      await expect(page.getByRole('link', { name })).toHaveAttribute(
        'href',
        `https://antique-trail-pages.pages.dev${path}`,
      )
    await page.getByRole('button', { name: 'Add or claim my store' }).click()
    await page.getByRole('radio', { name: scenario.radio }).check()
    await page.getByRole('button', { name: /Continue with this Synthetic scenario/ }).click()
    await expect(page.getByText(`Scenario: ${scenario.label}`)).toBeVisible()
    await page.getByLabel(/which Synthetic facts/).check()
    await page.getByLabel(/sensitive facts and photos/).check()
    if (scenario.label === 'existing store claim') {
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect(page.getByRole('status')).toContainText('saved')
      await page.reload()
      await signIn(page)
      await expect(page.getByLabel(/which Synthetic facts/)).toBeChecked()
    }
    await page.getByRole('button', { name: 'Submit Synthetic application' }).click()
    await expect(page.getByRole('status')).toContainText('No store or access was created')
  })
}

test('keeps the protected flow usable in constrained and forced-color rendering', async ({
  page,
}) => {
  await admit(page)
  await page.setViewportSize({ width: 320, height: 720 })
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await page.goto('/owner-research.html')
  await signIn(page)
  await expect(page.getByRole('button', { name: /Add or claim my store/ })).toBeEnabled()
  await page.addStyleTag({
    content:
      ':root { font-size: 225%; } * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
  })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /Add or claim my store/ })).toBeFocused()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
