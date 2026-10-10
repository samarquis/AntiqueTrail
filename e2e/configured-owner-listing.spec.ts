import { expect, test, type Browser, type Page, type Response } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  ownerListingFailure,
  ownerListingApprovalErrorCode,
  ownerListingApprovalErrorIdentifier,
  ownerListingMfaErrorCode,
  ownerListingPathname,
  ownerListingPublicReadbackEvidence as sanitizeOwnerPublicReadbackEvidence,
} from '../scripts/configured-representative-hours-report.mjs'

type User = { email: string; password: string; totpSecret?: string }
type OwnerApprovalRpcOutcome = {
  httpStatus: number
  responseOk: boolean
  errorCode: string | null
  errorIdentifier: string | null
  claimApproved?: boolean
}
type OwnerApprovalEvidence = {
  approvalRpc: OwnerApprovalRpcOutcome | null
  caseReadRpc: OwnerApprovalRpcOutcome | null
}
type OwnerDenialCaseRpc =
  | { case: 'invited_applicant_list'; rpc: 'owner_list_stores' }
  | { case: 'owner_a_select_store_b'; rpc: 'owner_select_store' }
  | { case: 'owner_a_read_store_b'; rpc: 'portal_get_home' }
  | { case: 'cancelled_owner_list'; rpc: 'owner_list_stores' }
  | { case: 'shopper_owner_list'; rpc: 'owner_list_stores' }
type OwnerListingPhase =
  | 'first'
  | 'full'
  | 'invited-lifecycle'
  | 'owner-identity'
  | 'portal-drafts'
  | 'managed-hours'
  | 'controlled-change'
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
  phase?: OwnerListingPhase
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

type MfaVerificationEvidence = {
  verifyHttpStatus: number | null
  verifyErrorCode: string | null
  factorVerified: boolean
  aal2Session: boolean
  retryExecuted: boolean
}

function isOwnerMfaVerifyResponse(response: Response) {
  const url = new URL(response.url())
  return (
    response.request().method() === 'POST' &&
    url.protocol === 'http:' &&
    url.hostname === '127.0.0.1' &&
    /^\/auth\/v1\/factors\/[^/]+\/verify$/.test(url.pathname)
  )
}

function accessTokenHasAal2(accessToken: string) {
  const payload = accessToken.split('.')[1]
  if (!payload) return false
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      aal?: unknown
    }
    return claims.aal === 'aal2'
  } catch {
    return false
  }
}

async function ownerMfaVerificationEvidence(
  response: Response,
): Promise<Omit<MfaVerificationEvidence, 'retryExecuted'>> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }
  const responseBody =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined
  const accessToken =
    typeof responseBody?.access_token === 'string' ? responseBody.access_token : undefined
  return {
    verifyHttpStatus: response.status(),
    verifyErrorCode: ownerListingMfaErrorCode(responseBody?.code),
    factorVerified: response.ok(),
    aal2Session: accessToken ? accessTokenHasAal2(accessToken) : false,
  }
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

type InvitationUiState =
  | 'form_visible'
  | 'generic_error'
  | 'invitation_checking'
  | 'invitation_inactive'
  | 'join_shell_only'
  | 'join_shell_missing'
  | 'unexpected_route'
  | 'unknown'
type MarkOperation = (
  operation: string,
  page: Page,
  pathname?: string,
  invitationUiState?: InvitationUiState,
  invitationExchangeHttpStatus?: number,
  mfaVerification?: MfaVerificationEvidence,
  ownerApproval?: OwnerApprovalEvidence,
) => void

async function ownerApprovalRpcOutcome(
  response: Response,
  includeClaimState = false,
): Promise<OwnerApprovalRpcOutcome> {
  const outcome: OwnerApprovalRpcOutcome = {
    httpStatus: response.status(),
    responseOk: response.ok(),
    errorCode: null,
    errorIdentifier: null,
    ...(includeClaimState ? { claimApproved: false } : {}),
  }
  if (response.ok() && !includeClaimState) return outcome
  try {
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return outcome
    const value = body as Record<string, unknown>
    if (response.ok()) {
      if (includeClaimState) outcome.claimApproved = value.state === 'approved'
      return outcome
    }
    outcome.errorCode = ownerListingApprovalErrorCode(value.code)
    outcome.errorIdentifier = ownerListingApprovalErrorIdentifier(value.message)
  } catch {
    // Report status only when the response body is unavailable.
  }
  return outcome
}

async function invitationUiState(page: Page): Promise<InvitationUiState> {
  try {
    if (ownerListingPathname(page.url()) !== '/partner/join') return 'unexpected_route'
    if (await page.getByLabel('Your name', { exact: true }).isVisible()) return 'form_visible'
    if (await page.getByRole('alert').isVisible()) return 'generic_error'
    const status = page.getByRole('status')
    if ((await status.count()) > 0) {
      const text = (await status.first().textContent())?.trim()
      if (text === 'Checking invitation…') return 'invitation_checking'
      if (text === 'This invitation is no longer available.') return 'invitation_inactive'
    }
    if (
      await page
        .getByRole('heading', { name: 'Review invitation & consent', exact: true })
        .isVisible()
    )
      return 'join_shell_only'
    return 'join_shell_missing'
  } catch {
    return 'unknown'
  }
}

async function signIn(page: Page, user: User, returnTo: string, mark: MarkOperation) {
  mark('sign_in_open_page', page, '/auth/sign-in')
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  mark('sign_in_fill_email', page)
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  mark('sign_in_fill_password', page)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  mark('sign_in_submit_password', page)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const returnUrl = new RegExp(`${returnTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  let mfaVerification: MfaVerificationEvidence | undefined
  if (user.totpSecret) {
    let retryExecuted = false
    const attempts: Promise<Omit<MfaVerificationEvidence, 'retryExecuted'>>[] = []
    const captureMfaResponse = (response: Response) => {
      if (isOwnerMfaVerifyResponse(response)) attempts.push(ownerMfaVerificationEvidence(response))
    }
    page.on('response', captureMfaResponse)
    try {
      mark('sign_in_expect_mfa', page)
      await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeVisible()
      mark('sign_in_fill_mfa', page)
      await page.getByLabel('Authentication code', { exact: true }).fill(totp(user.totpSecret))
      mark('sign_in_submit_mfa', page)
      await page.getByRole('button', { name: 'Verify code', exact: true }).click()
      try {
        await expect(page).toHaveURL(returnUrl)
      } catch (error) {
        const mfaVisible = await page
          .getByRole('heading', { name: 'Verify your sign-in' })
          .isVisible()
          .catch(() => false)
        const mfaErrorVisible = await page
          .getByRole('alert')
          .isVisible()
          .catch(() => false)
        if (!mfaVisible || !mfaErrorVisible) throw error
        retryExecuted = true
        await page.getByLabel('Authentication code', { exact: true }).fill(totp(user.totpSecret))
        mark('sign_in_mfa_retry', page)
        await page.getByRole('button', { name: 'Verify code', exact: true }).click()
        await expect(page).toHaveURL(returnUrl)
      }
    } finally {
      page.off('response', captureMfaResponse)
      const latestAttempt = attempts.at(-1)
      mfaVerification = {
        verifyHttpStatus: null,
        verifyErrorCode: null,
        factorVerified: false,
        aal2Session: false,
        retryExecuted,
        ...(latestAttempt ? await latestAttempt : {}),
      }
      mark('sign_in_mfa_result', page, undefined, undefined, undefined, mfaVerification)
    }
  } else {
    await expect(page).toHaveURL(returnUrl)
  }
  mark('sign_in_wait_return_url', page, returnTo, undefined, undefined, mfaVerification)
}

async function acceptInvitation(
  page: Page,
  invitationToken: string,
  user: User,
  name: string,
  mark: MarkOperation,
) {
  let invitationExchangeHttpStatus: number | undefined
  const captureInvitationExchangeStatus = (response: Response) => {
    if (invitationExchangeHttpStatus !== undefined) return
    try {
      const { pathname } = new URL(response.url())
      if (
        pathname === '/functions/v1/partner-provider-command' &&
        response.request().method() === 'POST'
      )
        invitationExchangeHttpStatus = response.status()
    } catch {
      // Ignore unparseable response URLs; never retain or emit a URL.
    }
  }
  page.on('response', captureInvitationExchangeStatus)
  mark('accept_invitation_open', page, '/partner/join')
  try {
    await page.goto(`/partner/join#token=${invitationToken}`)
    mark('accept_invitation_expect_form', page)
    try {
      await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
    } catch (error) {
      mark(
        'accept_invitation_expect_form',
        page,
        undefined,
        await invitationUiState(page),
        invitationExchangeHttpStatus,
      )
      throw error
    }
  } finally {
    page.off('response', captureInvitationExchangeStatus)
  }
  mark('accept_invitation_fill_form', page)
  await page.getByLabel('Your name', { exact: true }).fill(name)
  await page.getByLabel('Your title or role', { exact: true }).fill('Store Owner')
  await page.getByLabel('Store name', { exact: true }).fill('Clockwork Cabinet')
  await page.getByLabel('Owner-controlled email', { exact: true }).fill(user.email)
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check()
  mark('accept_invitation_submit_form', page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  mark('accept_invitation_expect_result', page)
  await expect(page.getByRole('alert')).toHaveCount(0)

  mark('open_partner_verification', page, '/partner/verify')
  await page.goto('/partner/verify')
  mark('bind_partner_identity', page)
  await page.getByRole('button', { name: 'Check verification', exact: true }).click()
  mark('verify_partner_binding', page)
  await expect(page.getByRole('alert')).toHaveCount(0)
}

async function fillPartnerDraft(page: Page, name: string, description: string) {
  await page.getByLabel('Store name', { exact: true }).fill(name)
  await page.getByLabel('Address', { exact: true }).fill('1 Synthetic Way, Topeka, KS')
  await page.getByLabel('Hours', { exact: true }).fill('Monday through Saturday, 10 to 4')
  await page.getByLabel('Website', { exact: true }).fill('https://clockwork.example')
  await page.getByLabel('Description', { exact: true }).fill(description)
}

async function expectDenied(
  result: { status: number },
  description: string,
  ownerDenial?: OwnerDenialCaseRpc,
) {
  if (result.status !== 403) {
    const error = new Error(`${description} did not return the expected denial`)
    if (ownerDenial)
      Object.assign(error, { ownerDenial: { ...ownerDenial, httpStatus: result.status } })
    throw error
  }
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

type PublicCatalogObservation = { kind: 'response'; response: Response } | { kind: 'not_observed' }

function observePublicStoreDetails(page: Page, slug: string): Promise<PublicCatalogObservation> {
  const endpointOrigin = new URL(input.endpoint).origin
  return page
    .waitForResponse(
      (response) => {
        const request = response.request()
        if (request.method() !== 'POST') return false
        let responseUrl: URL
        let requestPage: Page
        let payload: { operation?: unknown; args?: { p_slug?: unknown } } | null
        try {
          responseUrl = new URL(response.url())
          requestPage = request.frame().page()
          payload = JSON.parse(request.postData() ?? '')
        } catch {
          return false
        }
        return (
          requestPage === page &&
          responseUrl.origin === endpointOrigin &&
          responseUrl.pathname === '/functions/v1/public-catalog' &&
          payload?.operation === 'details' &&
          payload.args?.p_slug === slug
        )
      },
      { timeout: 12_000 },
    )
    .then((response) => ({ kind: 'response' as const, response }))
    .catch(() => ({ kind: 'not_observed' as const }))
}

async function publicStoreVisibleState(page: Page) {
  if (
    await page
      .getByRole('heading', { name: 'Sibling Market', exact: true })
      .isVisible()
      .catch(() => false)
  )
    return 'detail'
  if (
    await page
      .getByRole('heading', { name: 'Store not found', exact: true })
      .isVisible()
      .catch(() => false)
  )
    return 'not_found'
  if (
    await page
      .getByRole('alert')
      .getByRole('heading', { name: 'We couldn’t load the stores', exact: true })
      .isVisible()
      .catch(() => false)
  )
    return 'error'
  if (
    await page
      .getByRole('heading', { name: 'Finding stores', exact: true })
      .isVisible()
      .catch(() => false)
  )
    return 'loading'
  return 'unknown'
}

async function publicStoreReadbackFailure(page: Page, observation: PublicCatalogObservation) {
  const visibleState = await publicStoreVisibleState(page)
  if (observation.kind === 'not_observed')
    return sanitizeOwnerPublicReadbackEvidence({
      case: 'store_b_after_denied_write',
      response: 'not_observed',
      visibleState,
    })

  const { response } = observation
  const errorCode = await publicCatalogErrorCode(response)
  return sanitizeOwnerPublicReadbackEvidence({
    case: 'store_b_after_denied_write',
    response: 'response',
    httpStatus: response.status(),
    ...(errorCode ? { errorCode } : {}),
    visibleState,
  })
}

async function publicCatalogErrorCode(response: Response) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const body: unknown = await Promise.race([
      response.json(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 1_000)
      }),
    ])
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
    const error = (body as Record<string, unknown>).error
    if (!error || typeof error !== 'object' || Array.isArray(error)) return undefined
    const code = (error as Record<string, unknown>).code
    const projected = sanitizeOwnerPublicReadbackEvidence({
      case: 'store_b_after_denied_write',
      response: 'response',
      httpStatus: response.status(),
      errorCode: code,
      visibleState: 'unknown',
    })
    return projected?.errorCode
  } catch {
    return undefined
  } finally {
    if (timer) clearTimeout(timer)
  }
}

test('configured Owner setup, exact-store edits, approval, projection, and denials', async ({
  browser,
}, testInfo) => {
  test.skip(!inputPath, 'Run through the isolated configured Owner listing runner')
  const failures: string[] = []
  const stepTitles = [
    'Invited applicant accepts setup without receiving Owner authority',
    'Unsent invited draft survives ordinary navigation',
    'Invited applicant submits draft without receiving Owner authority',
    'Local synthetic stage keeps public claim activation unavailable',
    'Canceled invited setup creates no claim or grant',
    'Site Admin approves the exact Store A claim separately',
    'Owner A selects only Store A and other identities cannot select it',
    'Unsent Portal drafts survive navigation and explicit cancel clears them',
    'Direct facts publish only after successful acknowledgement',
    'Hours save, reopen, timezone, exception, and public projection match',
    'Stale hours save keeps the draft and last acknowledged schedule',
    'Controlled change remains private, retries idempotently, then Admin publishes',
    'Wrong-store direct write is denied and does not change Store B',
    'Site Admin revocation denies the next request in Owner A’s same session',
  ]
  const phase = input.phase ?? 'full'
  const phaseSteps: Record<OwnerListingPhase, number[]> = {
    first: [1],
    full: stepTitles.map((_, index) => index + 1),
    'invited-lifecycle': [1, 2, 3, 4, 5],
    'owner-identity': [1, 6, 7, 13, 14],
    'portal-drafts': [1, 6, 8],
    'managed-hours': [6, 9, 10, 11],
    'controlled-change': [6, 12],
  }
  const selectedStepNumbers = phaseSteps[phase]
  if (!selectedStepNumbers) throw new Error('Unknown configured Owner listing phase')
  const selectedStepTitles = selectedStepNumbers.map((number) => {
    const title = stepTitles[number - 1]
    if (!title) throw new Error('Configured Owner phase references an unknown step')
    return title
  })
  const firstPhase = phase === 'first'
  const stepReceipts: Array<Record<string, unknown>> = selectedStepTitles.map((name) => ({
    name,
    status: 'pending',
    durationMs: 0,
    operation: 'unknown',
    pathname: 'unknown',
  }))
  const stepReceiptPath = path.join(input.output, 'steps.json')
  let stepIndex = 0
  const writeStepReceipts = () => fs.writeFileSync(stepReceiptPath, JSON.stringify(stepReceipts))
  writeStepReceipts()
  const step = async (name: string, action: (mark: MarkOperation) => Promise<void>) => {
    if (!selectedStepTitles.includes(name)) return
    const receipt = stepReceipts[stepIndex]
    if (!receipt || receipt.name !== name) throw new Error('Owner listing step manifest drift')
    const startedAtMs = Date.now()
    receipt.status = 'running'
    Object.assign(receipt, { startedAtMs })
    writeStepReceipts()
    const mark: MarkOperation = (
      operation,
      page,
      pathname,
      uiState,
      exchangeHttpStatus,
      mfaVerification,
      ownerApproval,
    ) => {
      receipt.operation = operation
      receipt.pathname = ownerListingPathname(pathname ?? page.url())
      receipt.observedPathname = ownerListingPathname(page.url())
      if (uiState) receipt.invitationUiState = uiState
      if (
        typeof exchangeHttpStatus === 'number' &&
        Number.isSafeInteger(exchangeHttpStatus) &&
        exchangeHttpStatus >= 100 &&
        exchangeHttpStatus <= 599
      )
        receipt.invitationExchangeHttpStatus = exchangeHttpStatus
      if (mfaVerification) receipt.mfaVerification = mfaVerification
      if (ownerApproval) receipt.ownerApproval = ownerApproval
      writeStepReceipts()
    }
    try {
      await test.step(name, () => action(mark))
      receipt.status = 'passed'
    } catch (error) {
      receipt.status = 'failed'
      receipt.failure = ownerListingFailure(error)
      failures.push(name)
    } finally {
      receipt.durationMs = Date.now() - startedAtMs
      delete (receipt as { startedAtMs?: number }).startedAtMs
      stepIndex += 1
      writeStepReceipts()
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
    await step(
      'Invited applicant accepts setup without receiving Owner authority',
      async (mark) => {
        await signIn(invitedOwner, input.ownerApplicant, '/owner/stores', mark)
        if (phase === 'full') {
          mark('capture_before_approval_screenshot', invitedOwner)
          await invitedOwner.screenshot({
            path: testInfo.outputPath('owner-before-approval.png'),
            fullPage: true,
          })
        }
        mark('expect_unapproved_owner_access_alert', invitedOwner)
        await expect(invitedOwner.getByRole('alert')).toBeVisible()
        mark('read_unapproved_owner_list', invitedOwner)
        const token = invitedOwnerToken()
        if (!token) throw new Error('Invited applicant session token was not observed')
        await expectDenied(
          await rpc(token, 'owner_list_stores'),
          'invited applicant before approval',
        )

        await acceptInvitation(
          invitedOwner,
          input.invitationA,
          input.ownerApplicant,
          'Applicant A',
          mark,
        )
        mark('open_partner_draft', invitedOwner, '/partner/draft')
        await invitedOwner.goto('/partner/draft')
        mark('expect_partner_draft_form', invitedOwner)
        await expect(invitedOwner.getByLabel('Store name', { exact: true })).toBeVisible()
      },
    )

    if (firstPhase) {
      if (failures.length) throw new Error('Configured Owner first phase failed')
      return
    }

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
      if (phase === 'full')
        await invitedOwner.screenshot({
          path: testInfo.outputPath('owner-intake-gate.png'),
          fullPage: true,
        })
    })

    await step('Canceled invited setup creates no claim or grant', async () => {
      await signIn(cancelledOwner, input.ownerCancel, '/owner/stores', () => {})
      await expect(cancelledOwner.getByRole('alert')).toBeVisible()
      await acceptInvitation(
        cancelledOwner,
        input.invitationCancel,
        input.ownerCancel,
        'Cancelled Owner',
        () => {},
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

    await step('Site Admin approves the exact Store A claim separately', async (mark) => {
      await signIn(ownerA, input.ownerA, '/owner/stores', mark)
      const ownerToken = ownerAToken()
      if (!ownerToken) throw new Error('Established Owner A session token was not observed')
      await expectDenied(await rpc(ownerToken, 'owner_list_stores'), 'Owner A before approval')

      await signIn(admin, input.admin, '/admin/partners', mark)
      await expect(
        admin.getByRole('heading', { name: 'Partner administration', exact: true }),
      ).toBeVisible()
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
      const ownerApproval: OwnerApprovalEvidence = { approvalRpc: null, caseReadRpc: null }
      let approvalResponseObserved = false
      const responseTasks: Promise<void>[] = []
      const recordApprovalResponse = (response: Response) => {
        const pathname = new URL(response.url()).pathname
        if (pathname.endsWith('/rest/v1/rpc/owner_admin_approve_claim')) {
          approvalResponseObserved = true
          responseTasks.push(
            ownerApprovalRpcOutcome(response).then((outcome) => {
              ownerApproval.approvalRpc = outcome
            }),
          )
          return
        }
        if (
          approvalResponseObserved &&
          pathname.endsWith('/rest/v1/rpc/partner_admin_claim_case')
        ) {
          responseTasks.push(
            ownerApprovalRpcOutcome(response, true).then((outcome) => {
              ownerApproval.caseReadRpc = outcome
            }),
          )
        }
      }
      admin.on('response', recordApprovalResponse)
      try {
        await admin.getByRole('button', { name: /Apply decision/ }).click()
        await admin.getByRole('button', { name: /Confirm approve owner decision/ }).click()
        await expect(admin.getByText(/approved/).first()).toBeVisible()
      } finally {
        admin.off('response', recordApprovalResponse)
        await Promise.all(responseTasks)
        mark(
          'apply_owner_claim_approval',
          admin,
          undefined,
          undefined,
          undefined,
          undefined,
          ownerApproval,
        )
      }
      if (phase === 'full')
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
      if (phase === 'full')
        await ownerA.screenshot({
          path: testInfo.outputPath('owner-store-workspace.png'),
          fullPage: true,
        })

      const token = ownerAToken()
      if (!token) throw new Error('Owner session token was not observed')
      await expectSingleOwnerStore(await rpc(token, 'owner_list_stores'))
      const invitedBearer = invitedOwnerToken()
      if (!invitedBearer) throw new Error('Invited applicant session token was not observed')
      await expectDenied(await rpc(invitedBearer, 'owner_list_stores'), 'invited applicant', {
        case: 'invited_applicant_list',
        rpc: 'owner_list_stores',
      })
      await expectDenied(
        await rpc(token, 'owner_select_store', { p_store_id: input.storeB.id }),
        'Owner selecting Store B',
        { case: 'owner_a_select_store_b', rpc: 'owner_select_store' },
      )
      await expectDenied(
        await rpc(token, 'portal_get_home', {}, input.storeB.id),
        'Owner reading Store B',
        { case: 'owner_a_read_store_b', rpc: 'portal_get_home' },
      )
      if (phase === 'owner-identity') {
        await signIn(cancelledOwner, input.ownerCancel, '/owner/stores', () => {})
        await expect(cancelledOwner.getByRole('alert')).toBeVisible()
      }
      const cancelledToken = cancelledOwnerToken()
      if (!cancelledToken) throw new Error('Owner listing session was not observed')
      await expectDenied(await rpc(cancelledToken, 'owner_list_stores'), 'wrong account', {
        case: 'cancelled_owner_list',
        rpc: 'owner_list_stores',
      })

      await signIn(shopper, input.shopper, '/owner/stores', () => {})
      const shopperBearer = shopperToken()
      if (!shopperBearer) throw new Error('Shopper session token was not observed')
      await expectDenied(await rpc(shopperBearer, 'owner_list_stores'), 'Shopper as Owner', {
        case: 'shopper_owner_list',
        rpc: 'owner_list_stores',
      })
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
      const publicContext = await browser.newContext({ baseURL: input.origin })
      anonymousContext = publicContext
      const publicPage = await publicContext.newPage()
      const observation = observePublicStoreDetails(publicPage, input.storeB.slug)
      try {
        await signIn(
          publicPage,
          input.shopper,
          `/stores/${encodeURIComponent(input.storeB.slug)}`,
          () => {},
        )
        try {
          await expect(publicPage.getByRole('heading', { name: 'Sibling Market' })).toBeVisible()
          await expect(publicPage.getByRole('link', { name: 'Call 785-555-0182' })).toBeVisible()
        } catch (error) {
          if (error instanceof Error) {
            const ownerPublicReadback = await publicStoreReadbackFailure(
              publicPage,
              await observation,
            )
            if (ownerPublicReadback) Object.assign(error, { ownerPublicReadback })
          }
          throw error
        }
      } finally {
        await publicContext.close()
        anonymousContext = undefined
        await observation
      }
    })

    await step(
      'Site Admin revocation denies the next request in Owner A’s same session',
      async () => {
        await admin.goto('/admin/access')
        const ownerScope = admin
          .getByRole('list', { name: 'Store Owner scopes' })
          .getByRole('listitem')
          .filter({ hasText: new RegExp(`Claim ${input.claimId}, version`) })
        await expect(ownerScope).toHaveCount(1)
        await expect(ownerScope).toContainText('Store Owner — active')
        await ownerScope.getByRole('button', { name: /^Preview revoke .+ Owner scope$/ }).click()
        await expect(ownerScope.getByText(/^Confirm exact Store Owner scope:/)).toBeVisible()
        await ownerScope
          .getByLabel('Owner administrative reason code', { exact: true })
          .fill('owner_authority_reviewed')
        await ownerScope.getByRole('button', { name: /^Confirm revoke .+ Owner scope$/ }).click()
        await expect(ownerScope).toContainText('Store Owner — revoked')

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
        if (phase === 'full')
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

  if (stepIndex !== stepReceipts.length) throw new Error('Owner listing step manifest incomplete')
  if (failures.length) throw new Error(`Configured Owner acceptance failed: ${failures.join('; ')}`)
})
