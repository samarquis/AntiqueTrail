import { expect, test, type Browser, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'

type User = { email: string; password: string; totpSecret?: string }
type Input = {
  endpoint: string
  anonKey: string
  origin: string
  output: string
  storeA: { id: string; slug: string }
  storeB: { id: string; slug: string }
  claimId: string
  invitationA: string
  invitationCancel: string
  ownerA: User
  ownerApplicant: User
  ownerCancel: User
  shopper: User
  admin: User
}

const inputPath = process.env.CONFIGURED_OWNER_LISTING_INPUT
const input: Input = inputPath ? JSON.parse(fs.readFileSync(inputPath, 'utf8')) : ({} as Input)
if (inputPath) {
  for (const value of [input.endpoint, input.origin]) {
    const url = new URL(value)
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('Owner listing proof accepts literal loopback origins only')
  }
}

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('Malformed local TOTP enrollment secret')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = crypto.createHmac('sha1', bytes).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

function bearerFor(page: Page) {
  let bearer: string | null = null
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return
    if (!url.pathname.startsWith('/rest/v1/rpc/')) return
    const authorization = request.headers().authorization
    const token = authorization?.replace(/^Bearer\s+/i, '')
    if (token && token !== input.anonKey) bearer = token
  })
  return () => bearer
}

async function rpc(
  bearer: string,
  name: string,
  args: Record<string, unknown> = {},
  storeId?: string,
) {
  const url = new URL(`/rest/v1/rpc/${name}`, input.endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password)
    throw new Error('Owner listing proof refuses non-loopback RPC targets')
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    headers: {
      apikey: input.anonKey,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'app_public',
      'Accept-Profile': 'app_public',
      ...(storeId ? { 'x-owner-store-id': storeId } : {}),
    },
    body: JSON.stringify(args),
  })
  if (!response.ok) return { status: response.status, data: null }
  return { status: response.status, data: (await response.json()) as unknown }
}

async function signIn(page: Page, user: User, returnTo: string) {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  if (user.totpSecret) {
    await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeVisible()
    await page.getByLabel('Authentication code', { exact: true }).fill(totp(user.totpSecret))
    await page.getByRole('button', { name: 'Verify code', exact: true }).click()
  }
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
}

async function acceptInvitation(page: Page, invitationToken: string, user: User, name: string) {
  await page.goto(`/partner/join#token=${invitationToken}`)
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
  await page.getByLabel('Your name', { exact: true }).fill(name)
  await page.getByLabel('Your title or role', { exact: true }).fill('Store Owner')
  await page.getByLabel('Store name', { exact: true }).fill('Clockwork Cabinet')
  await page.getByLabel('Owner-controlled email', { exact: true }).fill(user.email)
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.goto('/partner/verify')
  await page.getByRole('button', { name: 'Check verification', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
}

async function fillPartnerDraft(page: Page, name: string, description: string) {
  await page.getByLabel('Store name', { exact: true }).fill(name)
  await page.getByLabel('Address', { exact: true }).fill('1 Synthetic Way, Topeka, KS')
  await page.getByLabel('Hours', { exact: true }).fill('Monday through Saturday, 10 to 4')
  await page.getByLabel('Website', { exact: true }).fill('https://clockwork.example')
  await page.getByLabel('Description', { exact: true }).fill(description)
}

async function expectDenied(result: { status: number }, description: string) {
  if (result.status !== 403) throw new Error(`${description} did not return the expected denial`)
}

async function expectSingleOwnerStore(result: { status: number; data: unknown }) {
  if (result.status !== 200 || !result.data || typeof result.data !== 'object')
    throw new Error('Owner list did not return one exact store')
  const value = result.data as { role?: unknown; stores?: unknown }
  const stores = Array.isArray(value.stores) ? value.stores : []
  if (
    value.role !== 'Store Owner' ||
    stores.length !== 1 ||
    (stores[0] as { storeId?: unknown }).storeId !== input.storeA.id
  )
    throw new Error('Owner list did not return only Store A')
}

async function openPublicStore(browser: Browser, slug: string) {
  const context = await browser.newContext({ baseURL: input.origin })
  const page = await context.newPage()
  await page.goto(`/stores/${encodeURIComponent(slug)}`)
  return { context, page }
}

test('configured Owner setup, exact-store edits, approval, projection, and denials', async ({
  browser,
}, testInfo) => {
  test.skip(!inputPath, 'Run through the isolated configured Owner listing runner')
  const failures: string[] = []
  const step = async (name: string, action: () => Promise<void>) => {
    try {
      await test.step(name, action)
    } catch {
      failures.push(name)
    }
  }

  const ownerAContext = await browser.newContext({ baseURL: input.origin })
  const ownerA = await ownerAContext.newPage()
  const ownerAToken = bearerFor(ownerA)
  const invitedOwnerContext = await browser.newContext({ baseURL: input.origin })
  const invitedOwner = await invitedOwnerContext.newPage()
  const invitedOwnerToken = bearerFor(invitedOwner)
  const cancelledOwnerContext = await browser.newContext({ baseURL: input.origin })
  const cancelledOwner = await cancelledOwnerContext.newPage()
  const cancelledOwnerToken = bearerFor(cancelledOwner)
  const adminContext = await browser.newContext({ baseURL: input.origin })
  const admin = await adminContext.newPage()
  const adminToken = bearerFor(admin)
  const shopperContext = await browser.newContext({ baseURL: input.origin })
  const shopper = await shopperContext.newPage()
  const shopperToken = bearerFor(shopper)
  let anonymousContext: Awaited<ReturnType<typeof openPublicStore>>['context'] | undefined

  try {
    await step('Invited applicant accepts setup without receiving Owner authority', async () => {
      await signIn(invitedOwner, input.ownerApplicant, '/owner/stores')
      await invitedOwner.screenshot({
        path: testInfo.outputPath('owner-before-approval.png'),
        fullPage: true,
      })
      await expect(invitedOwner.getByRole('alert')).toBeVisible()
      const token = invitedOwnerToken()
      if (!token) throw new Error('Invited applicant session token was not observed')
      await expectDenied(await rpc(token, 'owner_list_stores'), 'invited applicant before approval')

      await acceptInvitation(invitedOwner, input.invitationA, input.ownerApplicant, 'Applicant A')
      await invitedOwner.goto('/partner/draft')
      await expect(invitedOwner.getByLabel('Store name', { exact: true })).toBeVisible()
    })

    await step('Unsent invited draft survives ordinary navigation', async () => {
      await invitedOwner.goto('/partner/draft')
      await fillPartnerDraft(
        invitedOwner,
        'Clockwork Cabinet',
        'Unsent invited applicant draft retained across navigation.',
      )
      const browse = invitedOwner.locator('a[href="/stores"]').first()
      await browse.click()
      await invitedOwner.goBack()
      await expect(invitedOwner.getByLabel('Description', { exact: true })).toHaveValue(
        'Unsent invited applicant draft retained across navigation.',
      )
    })

    await step('Invited applicant submits draft without receiving Owner authority', async () => {
      await invitedOwner.goto('/partner/draft')
      await fillPartnerDraft(
        invitedOwner,
        'Clockwork Cabinet',
        'Synthetic guided listing draft for Store A.',
      )
      await invitedOwner.getByRole('button', { name: 'Save draft', exact: true }).click()
      await expect(invitedOwner.getByRole('status')).toContainText('Draft status: draft.')
      await invitedOwner
        .getByRole('button', { name: 'Submit draft for review', exact: true })
        .click()
      await expect(invitedOwner.getByRole('status')).toContainText('submitted')
      const token = invitedOwnerToken()
      if (!token) throw new Error('Invited applicant session token was not observed')
      await expectDenied(
        await rpc(token, 'owner_list_stores'),
        'invited applicant before Site Admin approval',
      )
    })

    await step('Local synthetic stage keeps public claim activation unavailable', async () => {
      await invitedOwner.goto(`/partner/claim?claimStore=${encodeURIComponent(input.storeA.id)}`)
      await expect(
        invitedOwner.getByRole('heading', {
          name: 'Owner intake is not available in this public test',
        }),
      ).toBeVisible()
      await invitedOwner.screenshot({
        path: testInfo.outputPath('owner-intake-gate.png'),
        fullPage: true,
      })
    })

    await step('Canceled invited setup creates no claim or grant', async () => {
      await signIn(cancelledOwner, input.ownerCancel, '/owner/stores')
      await expect(cancelledOwner.getByRole('alert')).toBeVisible()
      await acceptInvitation(
        cancelledOwner,
        input.invitationCancel,
        input.ownerCancel,
        'Cancelled Owner',
      )
      await cancelledOwner.goto('/partner/draft')
      await fillPartnerDraft(
        cancelledOwner,
        'Cancelled Synthetic Shop',
        'This draft must be canceled before submission.',
      )
      await cancelledOwner.getByRole('button', { name: 'Save draft', exact: true }).click()
      await cancelledOwner.goto('/partner/status')
      await cancelledOwner.getByRole('button', { name: 'Withdraw onboarding', exact: true }).click()
      await expect(cancelledOwner.getByRole('status')).toContainText('withdrawn')
      const token = cancelledOwnerToken()
      if (!token) throw new Error('Cancelled Owner session token was not observed')
      const claimStatus = await rpc(token, 'partner_safe_command', {
        p_operation: 'get_claim_status',
        p_payload: {},
      })
      if (claimStatus.status !== 200 || claimStatus.data !== null)
        throw new Error('Canceled setup left a listing claim')
      await expectDenied(await rpc(token, 'owner_list_stores'), 'Cancelled Owner')
    })

    await step('Site Admin approves the exact Store A claim separately', async () => {
      await signIn(ownerA, input.ownerA, '/owner/stores')
      const ownerToken = ownerAToken()
      if (!ownerToken) throw new Error('Established Owner A session token was not observed')
      await expectDenied(await rpc(ownerToken, 'owner_list_stores'), 'Owner A before approval')

      await signIn(admin, input.admin, '/admin/partners')
      const token = adminToken()
      if (!token) throw new Error('Site Admin session token was not observed')
      await expectDenied(await rpc(token, 'owner_list_stores'), 'Site Admin as Owner')
      await expectDenied(
        await rpc(token, 'portal_get_home', {}, input.storeA.id),
        'Site Admin Portal read',
      )

      await admin.getByLabel('Exact claim ID', { exact: true }).fill(input.claimId)
      await admin.getByRole('button', { name: 'Open exact claim', exact: true }).click()
      await expect(admin.getByRole('heading', { name: 'Claim case' })).toBeVisible()
      await admin.getByLabel('Decision', { exact: true }).selectOption('approve_owner')
      await admin.getByLabel('Decision key', { exact: true }).fill('issue579-owner-approval')
      await admin.getByRole('button', { name: /Apply decision/ }).click()
      await admin.getByRole('button', { name: /Confirm approve owner decision/ }).click()
      await expect(admin.getByText(/approved/).first()).toBeVisible()
      await admin.screenshot({
        path: testInfo.outputPath('owner-admin-approval.png'),
        fullPage: true,
      })
    })

    await step('Owner A selects only Store A and other identities cannot select it', async () => {
      await ownerA.goto('/owner/stores')
      await expect(ownerA.getByRole('button', { name: 'Open Clockwork Cabinet' })).toBeVisible()
      await expect(ownerA.getByRole('button', { name: /Open Sibling Market/ })).toHaveCount(0)
      await ownerA.getByRole('button', { name: 'Open Clockwork Cabinet' }).click()
      await expect(ownerA.getByRole('heading', { name: 'Clockwork Cabinet' })).toBeVisible()
      await ownerA.screenshot({
        path: testInfo.outputPath('owner-store-workspace.png'),
        fullPage: true,
      })

      const token = ownerAToken()
      if (!token) throw new Error('Owner session token was not observed')
      await expectSingleOwnerStore(await rpc(token, 'owner_list_stores'))
      const invitedBearer = invitedOwnerToken()
      if (!invitedBearer) throw new Error('Invited applicant session token was not observed')
      await expectDenied(await rpc(invitedBearer, 'owner_list_stores'), 'invited applicant')
      await expectDenied(
        await rpc(token, 'owner_select_store', { p_store_id: input.storeB.id }),
        'Owner selecting Store B',
      )
      await expectDenied(
        await rpc(token, 'portal_get_home', {}, input.storeB.id),
        'Owner reading Store B',
      )
      await expectDenied(
        await rpc(cancelledOwnerToken() ?? '', 'owner_list_stores'),
        'wrong account',
      )

      await signIn(shopper, input.shopper, '/owner/stores')
      const shopperBearer = shopperToken()
      if (!shopperBearer) throw new Error('Shopper session token was not observed')
      await expectDenied(await rpc(shopperBearer, 'owner_list_stores'), 'Shopper as Owner')
    })

    await step(
      'Unsent Portal drafts survive navigation and explicit cancel clears them',
      async () => {
        await ownerA.goto('/store-portal/info')
        await expect(ownerA.getByLabel('Official description', { exact: true })).toBeVisible()
        await ownerA
          .getByLabel('Official description', { exact: true })
          .fill('Unsent direct-field draft.')
        await ownerA.getByRole('link', { name: 'Hours & holidays', exact: true }).click()
        await ownerA.getByRole('link', { name: 'Store information', exact: true }).click()
        await expect(ownerA.getByLabel('Official description', { exact: true })).toHaveValue(
          'Unsent direct-field draft.',
        )
        const cancel = ownerA.getByRole('button', { name: /cancel edits|discard changes/i })
        if (!(await cancel.count()))
          throw new Error('Store information has no explicit draft cancel control')
        await cancel.click()
        await expect(ownerA.getByLabel('Official description', { exact: true })).toHaveValue(
          'Baseline description before Owner confirmation.',
        )

        await ownerA.goto('/store-portal/hours')
        await ownerA.getByLabel('Closed').first().uncheck()
        await ownerA.getByLabel('First opening', { exact: true }).first().fill('08:30')
        await ownerA.getByRole('link', { name: 'Store information', exact: true }).click()
        await ownerA.getByRole('link', { name: 'Hours & holidays', exact: true }).click()
        await expect(ownerA.getByLabel('First opening', { exact: true }).first()).toHaveValue(
          '08:30',
        )
        const hoursCancel = ownerA.getByRole('button', { name: /cancel edits|discard changes/i })
        if (!(await hoursCancel.count()))
          throw new Error('Hours has no explicit draft cancel control')
        await hoursCancel.click()
        await expect(ownerA.getByLabel('Closed').first()).toBeChecked()

        await ownerA.goto('/store-portal/changes')
        await ownerA.getByLabel('Requested value', { exact: true }).fill('Unsent controlled draft.')
        await ownerA.getByLabel('Reason for change', { exact: true }).fill('Unsaved reason.')
        await ownerA.getByRole('link', { name: 'Portal home', exact: true }).click()
        await ownerA.getByRole('link', { name: 'Pending changes', exact: true }).click()
        await expect(ownerA.getByLabel('Requested value', { exact: true })).toHaveValue(
          'Unsent controlled draft.',
        )
        const controlledCancel = ownerA.getByRole('button', {
          name: /cancel edits|discard changes/i,
        })
        if (!(await controlledCancel.count()))
          throw new Error('Controlled changes has no explicit draft cancel control')
        await controlledCancel.click()
        await expect(ownerA.getByLabel('Requested value', { exact: true })).toHaveValue('')
      },
    )

    await step('Direct facts publish only after successful acknowledgement', async () => {
      await ownerA.goto('/store-portal/info')
      await ownerA.getByLabel('Phone', { exact: true }).fill('785-555-0199')
      await ownerA
        .getByLabel('Website', { exact: true })
        .fill('https://clockwork-confirmed.example')
      await ownerA
        .getByLabel('Official description', { exact: true })
        .fill('Owner-confirmed synthetic listing facts.')
      const before = await openPublicStore(browser, input.storeA.slug)
      anonymousContext = before.context
      await expect(before.page.getByRole('heading', { name: 'Clockwork Cabinet' })).toBeVisible()
      await expect(before.page.getByRole('link', { name: 'Call 785-555-0181' })).toBeVisible()
      await before.context.close()
      anonymousContext = undefined

      await ownerA.getByRole('button', { name: 'Publish managed fields', exact: true }).click()
      await expect(ownerA.getByRole('status')).toContainText(
        'Managed fields published immediately.',
      )
      const after = await openPublicStore(browser, input.storeA.slug)
      anonymousContext = after.context
      await expect(after.page.getByRole('link', { name: 'Call 785-555-0199' })).toBeVisible()
      await expect(
        after.page.getByRole('link', { name: /Visit official website/ }),
      ).toHaveAttribute('href', 'https://clockwork-confirmed.example')
      await expect(after.page.getByText('Owner-confirmed synthetic listing facts.')).toBeVisible()
      await after.page.screenshot({
        path: testInfo.outputPath('public-confirmed-facts.png'),
        fullPage: true,
      })
      await after.context.close()
      anonymousContext = undefined
    })

    await step('Hours save, reopen, timezone, exception, and public projection match', async () => {
      await ownerA.goto('/store-portal/hours')
      await ownerA.getByLabel('Closed').first().uncheck()
      await ownerA.getByLabel('First opening', { exact: true }).first().fill('09:30')
      await ownerA.getByLabel('First closing', { exact: true }).first().fill('17:00')
      await ownerA.getByRole('button', { name: 'Add holiday hours', exact: true }).click()
      await ownerA.getByLabel('Date', { exact: true }).fill('2026-11-26')
      await ownerA.getByLabel('Holiday label', { exact: true }).fill('Thanksgiving')
      await ownerA.getByRole('button', { name: 'Save hours', exact: true }).click()
      await expect(ownerA.getByRole('status')).toContainText('Hours saved and freshness updated.')
      await ownerA.getByRole('link', { name: 'Portal home', exact: true }).click()
      await ownerA.getByRole('link', { name: 'Hours & holidays', exact: true }).click()
      await expect(ownerA.getByLabel('First opening', { exact: true }).first()).toHaveValue('09:30')
      await expect(ownerA.getByText('America/Chicago')).toBeVisible()

      const publicPage = await openPublicStore(browser, input.storeA.slug)
      anonymousContext = publicPage.context
      await expect(
        publicPage.page.getByRole('heading', { name: 'Clockwork Cabinet' }),
      ).toBeVisible()
      await expect(publicPage.page.getByText('Monday')).toBeVisible()
      await expect(publicPage.page.getByText(/9:30.*5:00|09:30.*17:00/)).toBeVisible()
      await expect(publicPage.page.getByText('Thanksgiving')).toBeVisible()
      await publicPage.page.screenshot({
        path: testInfo.outputPath('public-confirmed-hours.png'),
        fullPage: true,
      })
      await publicPage.context.close()
      anonymousContext = undefined
    })

    await step('Stale hours save keeps the draft and last acknowledged schedule', async () => {
      await ownerA.goto('/store-portal/hours')
      const closed = ownerA.getByLabel('Closed').first()
      if (await closed.isChecked()) await closed.uncheck()
      await ownerA.getByLabel('First opening', { exact: true }).first().fill('08:30')
      await ownerA.getByLabel('First closing', { exact: true }).first().fill('13:00')

      const token = ownerAToken()
      if (!token) throw new Error('Owner session token was not observed')
      const current = await rpc(token, 'portal_get_hours', {}, input.storeA.id)
      if (current.status !== 200 || !current.data || typeof current.data !== 'object')
        throw new Error('Current hours could not be read for the version race')
      const newer = structuredClone(current.data) as {
        version: number
        weekly: Array<{ weekday: number; intervals: Array<{ opensAt: string; closesAt: string }> }>
      }
      const monday = newer.weekly.find((day) => day.weekday === 1)
      if (!monday || !monday.intervals[0]) throw new Error('Monday fixture schedule is missing')
      monday.intervals[0] = { opensAt: '10:00', closesAt: '18:00' }
      const concurrent = await rpc(token, 'portal_save_hours', { p_hours: newer }, input.storeA.id)
      if (concurrent.status !== 200)
        throw new Error('Concurrent local hours acknowledgement failed')

      await ownerA.getByRole('button', { name: 'Save hours', exact: true }).click()
      await expect(ownerA.getByRole('alert')).toBeVisible()
      await expect(ownerA.getByRole('status')).not.toContainText('Hours saved')
      await expect(ownerA.getByLabel('First opening', { exact: true }).first()).toHaveValue('08:30')

      const publicPage = await openPublicStore(browser, input.storeA.slug)
      anonymousContext = publicPage.context
      await expect(publicPage.page.getByText(/10:00.*6:00|10:00.*18:00/)).toBeVisible()
      await expect(publicPage.page.getByText(/8:30.*1:00|08:30.*13:00/)).toHaveCount(0)
      await publicPage.context.close()
      anonymousContext = undefined
    })

    await step(
      'Controlled change remains private, retries idempotently, then Admin publishes',
      async () => {
        await ownerA.goto('/store-portal/changes')
        await ownerA.getByLabel('Field', { exact: true }).selectOption('name')
        await ownerA.getByLabel('Requested value', { exact: true }).fill('Clockwork Cabinet Annex')
        await ownerA
          .getByLabel('Reason for change', { exact: true })
          .fill('Synthetic nameplate correction for local proof.')
        await ownerA.getByRole('button', { name: 'Submit change request', exact: true }).click()
        await expect(ownerA.getByRole('status')).toContainText('The approved value remains live.')
        await ownerA.getByLabel('Requested value', { exact: true }).fill('Clockwork Cabinet Annex')
        await ownerA
          .getByLabel('Reason for change', { exact: true })
          .fill('Synthetic nameplate correction for local proof.')
        await ownerA.getByRole('button', { name: 'Submit change request', exact: true }).click()

        await ownerA.getByRole('link', { name: 'Portal home', exact: true }).click()
        await expect(
          ownerA.getByText(/1 controlled change is waiting for Administrator review/),
        ).toBeVisible()
        const pending = await openPublicStore(browser, input.storeA.slug)
        anonymousContext = pending.context
        await expect(pending.page.getByRole('heading', { name: 'Clockwork Cabinet' })).toBeVisible()
        await expect(
          pending.page.getByRole('heading', { name: 'Clockwork Cabinet Annex' }),
        ).toHaveCount(0)
        await pending.page.screenshot({
          path: testInfo.outputPath('public-change-pending.png'),
          fullPage: true,
        })
        await pending.context.close()
        anonymousContext = undefined

        await admin.goto('/admin')
        await expect(admin.getByRole('heading', { name: 'Review queue' })).toBeVisible()
        await admin.getByRole('button', { name: 'Review Clockwork Cabinet', exact: true }).click()
        await expect(admin.getByText('Clockwork Cabinet Annex')).toBeVisible()
        await admin
          .getByLabel('Decision reason', { exact: true })
          .fill('Approved synthetic exact-store name change.')
        await admin.getByRole('button', { name: 'Approve', exact: true }).click()
        await admin.getByRole('button', { name: 'Confirm approve', exact: true }).click()
        await expect(admin.getByRole('status')).toContainText('Case approved.')

        const published = await openPublicStore(browser, input.storeA.slug)
        anonymousContext = published.context
        await expect(
          published.page.getByRole('heading', { name: 'Clockwork Cabinet Annex' }),
        ).toBeVisible()
        await published.page.screenshot({
          path: testInfo.outputPath('public-change-approved.png'),
          fullPage: true,
        })
        await published.context.close()
        anonymousContext = undefined
      },
    )

    await step('Wrong-store direct write is denied and does not change Store B', async () => {
      const token = ownerAToken()
      if (!token) throw new Error('Owner session token was not observed')
      await expectDenied(
        await rpc(
          token,
          'portal_save_managed_fields',
          {
            p_fields: {
              phone: '785-555-0198',
              website: 'https://must-not-write.example',
              description: 'This foreign Store B mutation must be rejected.',
            },
          },
          input.storeB.id,
        ),
        'Owner writing Store B',
      )
      const publicPage = await openPublicStore(browser, input.storeB.slug)
      anonymousContext = publicPage.context
      await expect(publicPage.page.getByRole('heading', { name: 'Sibling Market' })).toBeVisible()
      await expect(publicPage.page.getByRole('link', { name: 'Call 785-555-0182' })).toBeVisible()
      await publicPage.context.close()
      anonymousContext = undefined
    })

    await step(
      'Site Admin revocation denies the next request in Owner A’s same session',
      async () => {
        await admin.goto('/admin/partners')
        await admin.getByLabel('Exact claim ID', { exact: true }).fill(input.claimId)
        await admin.getByRole('button', { name: 'Open exact claim', exact: true }).click()
        await expect(admin.getByRole('heading', { name: 'Claim case' })).toBeVisible()
        await admin.getByLabel('Decision', { exact: true }).selectOption('revoke')
        await admin.getByLabel('Reason code', { exact: true }).fill('owner_authority_reviewed')
        await admin.getByLabel('Decision key', { exact: true }).fill('issue579-owner-revoke')
        await admin.getByRole('button', { name: /Apply decision/ }).click()
        await admin.getByRole('button', { name: /Confirm revoke decision/ }).click()
        await expect(admin.getByText(/revoked/).first()).toBeVisible()

        const ownerBearer = ownerAToken()
        if (!ownerBearer) throw new Error('Original Owner A session token was not observed')
        await expectDenied(
          await rpc(ownerBearer, 'owner_list_stores'),
          'revoked Owner session list',
        )
        await expectDenied(
          await rpc(ownerBearer, 'portal_get_home', {}, input.storeA.id),
          'revoked Owner session Portal read',
        )
        await ownerA.screenshot({
          path: testInfo.outputPath('owner-after-revocation.png'),
          fullPage: true,
        })
      },
    )
  } finally {
    await anonymousContext?.close()
    await Promise.all([
      ownerAContext.close(),
      invitedOwnerContext.close(),
      cancelledOwnerContext.close(),
      adminContext.close(),
      shopperContext.close(),
    ])
  }

  if (failures.length) throw new Error(`Configured Owner acceptance failed: ${failures.join('; ')}`)
})
