import { InMemoryAuthStore, InMemorySessionRegistry, type AuthSession } from '../features/auth'
import {
  REVIEW_SCENARIO_IDS,
  REVIEW_STATE_IDS,
  type ReviewHarnessRuntime,
  type ReviewScenario,
  type ReviewScenarioId,
  type ReviewSessionState,
  type ReviewStateId,
} from './types'

export interface ReviewHarnessEnvironment {
  dev: boolean
  mode: string
  enabled: string | undefined
  url: string
  now?: number
}

const commonPublic = [
  { label: 'Browse', path: '/stores', purpose: 'Public catalog and store details' },
  { label: 'Service status', path: '/status', purpose: 'Public operational fallback' },
] as const

export const reviewScenarios: readonly ReviewScenario[] = [
  {
    id: 'anonymous',
    label: 'Anonymous shopper',
    identity: 'No account',
    role: 'Anonymous',
    fixtureSummary: 'Public catalog only; private actions redirect to sign-in.',
    destinations: [
      ...commonPublic,
      { label: 'Sign in', path: '/auth/sign-in', purpose: 'Sign-in validation and recovery entry' },
      {
        label: 'Recover account',
        path: '/auth/recovery',
        purpose: 'Enumeration-safe account recovery',
      },
    ],
    deniedDestinations: [
      { label: 'Saved Stores', path: '/saved', purpose: 'Requires a shopper session' },
      { label: 'Administrator', path: '/admin', purpose: 'Requires Administrator authority' },
    ],
  },
  {
    id: 'shopper-a',
    label: 'Shopper A',
    identity: 'Avery · shopper-a@local.invalid',
    role: 'Shopper',
    fixtureSummary: 'Saved stores, a private memory, a correction, and an active trip.',
    destinations: [
      ...commonPublic,
      { label: 'Saved Stores', path: '/saved', purpose: 'Private shopper collection' },
      { label: 'New Since', path: '/new-since', purpose: 'Area change tracking' },
      { label: 'Private History', path: '/account/history', purpose: 'Private visit memory' },
      {
        label: 'Blue Finch memory',
        path: '/stores/blue-finch-curios/memory',
        purpose: 'Private memory edit and deletion recovery',
      },
      {
        label: 'Blue Finch correction',
        path: '/stores/blue-finch-curios/correction',
        purpose: 'Shopper correction submission',
      },
      {
        label: 'Correction status',
        path: '/corrections/correction-a',
        purpose: 'Reason-neutral correction status',
      },
      { label: 'Account', path: '/account', purpose: 'Sign-out and account controls' },
      { label: 'Privacy', path: '/account/privacy', purpose: 'Privacy choices and lifecycle' },
      { label: 'My Trip', path: '/trips', purpose: 'Private trip planning' },
    ],
    deniedDestinations: [
      { label: 'Store Portal', path: '/store-portal', purpose: 'No representative grant' },
      { label: 'Administrator', path: '/admin', purpose: 'No Administrator authority' },
    ],
  },
  {
    id: 'shopper-b',
    label: 'Shopper B',
    identity: 'Blair · shopper-b@local.invalid',
    role: 'Shopper',
    fixtureSummary:
      'A separate account with received shares and trip ideas; no access to Shopper A.',
    destinations: [
      ...commonPublic,
      { label: 'Saved Stores', path: '/saved', purpose: 'Shopper B private collection' },
      { label: 'New Since', path: '/new-since', purpose: 'Shopper B area change tracking' },
      { label: 'Private History', path: '/account/history', purpose: 'Shopper B private memory' },
      { label: 'Shared with Me', path: '/shares', purpose: 'Received candidate shares' },
      { label: 'Trip Ideas', path: '/trip-ideas', purpose: 'Accepted private ideas' },
      {
        label: 'Blocked Senders',
        path: '/account/privacy/blocked-senders',
        purpose: 'Privacy state',
      },
      { label: 'Account', path: '/account', purpose: 'Sign-out and account controls' },
      { label: 'Privacy', path: '/account/privacy', purpose: 'Privacy choices and lifecycle' },
    ],
    deniedDestinations: [
      {
        label: 'Shopper A fixture',
        path: '/corrections/correction-a',
        purpose: 'Cross-account denial',
      },
      { label: 'Administrator', path: '/admin', purpose: 'No Administrator authority' },
    ],
  },
  {
    id: 'representative',
    label: 'Store Representative',
    identity: 'River · representative@local.invalid',
    role: 'Representative',
    fixtureSummary: 'One store-scoped grant for Blue Finch Curios with pending controlled changes.',
    destinations: [
      ...commonPublic,
      {
        label: 'Store Portal',
        path: '/store-portal',
        purpose: 'Store-scoped representative workspace',
      },
      { label: 'Hours', path: '/store-portal/hours', purpose: 'Representative-managed hours' },
      {
        label: 'Controlled changes',
        path: '/store-portal/changes',
        purpose: 'Admin-reviewed fields',
      },
    ],
    deniedDestinations: [
      { label: 'Administrator', path: '/admin', purpose: 'Representative is not an Administrator' },
      {
        label: 'Shopper A fixture',
        path: '/corrections/correction-a',
        purpose: 'Shopper-private denial',
      },
    ],
  },
  {
    id: 'administrator',
    label: 'Administrator',
    identity: 'Morgan · administrator@local.invalid',
    role: 'Administrator',
    fixtureSummary: 'MFA-verified, recently authenticated local admin with queued synthetic cases.',
    destinations: [
      ...commonPublic,
      { label: 'Review Queue', path: '/admin', purpose: 'Metadata-only case queue' },
      { label: 'Partner cases', path: '/admin/partners', purpose: 'Partner review workspace' },
      { label: 'Moderation', path: '/admin/reviews', purpose: 'Review moderation queue' },
    ],
    deniedDestinations: [
      {
        label: 'Shopper A fixture',
        path: '/corrections/correction-a',
        purpose: 'Admins cannot read shopper-private data',
      },
      {
        label: 'Shopper B fixture',
        path: '/shares/share-b',
        purpose: 'Admins cannot read candidate shares',
      },
    ],
  },
] as const

function oneOf<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return value && values.includes(value as T) ? (value as T) : fallback
}

function sessionFor(
  scenario: ReviewScenario,
  now: number,
  sessionState: ReviewSessionState,
): AuthSession | null {
  if (scenario.role === 'Anonymous') return null
  return {
    userId: `review-${scenario.id}`,
    accessToken: `local-review-only:${scenario.id}`,
    expiresAt: sessionState === 'expired' ? now - 1 : now + 24 * 60 * 60 * 1_000,
    role: scenario.role,
    mfaRequired: scenario.role === 'Administrator' || scenario.role === 'Representative',
    mfaEnrolled: scenario.role === 'Administrator' || scenario.role === 'Representative',
    mfaVerified: true,
    passwordAuthenticatedAt: new Date(now).toISOString(),
    mfaVerifiedAt: new Date(now).toISOString(),
  }
}

/**
 * Creates a deterministic review session only for an explicit local Vite mode
 * (`review` for the harness build, `development` when plain `npm run dev` runs
 * without a Supabase environment). Every check is deliberate: `vite build
 * --mode review` still has `dev === false`, so no production build can embed or
 * activate the harness, and `enabled` still requires explicit opt-in.
 */
export async function createReviewHarness(
  environment: ReviewHarnessEnvironment,
): Promise<ReviewHarnessRuntime | null> {
  if (
    !environment.dev ||
    (environment.mode !== 'review' && environment.mode !== 'development') ||
    environment.enabled !== 'true'
  )
    return null

  const url = new URL(environment.url, 'http://127.0.0.1:4173')
  const scenarioId = oneOf<ReviewScenarioId>(
    url.searchParams.get('reviewAs'),
    REVIEW_SCENARIO_IDS,
    'anonymous',
  )
  const state = oneOf<ReviewStateId>(
    url.searchParams.get('reviewState'),
    REVIEW_STATE_IDS,
    'success',
  )
  const sessionState = oneOf<ReviewSessionState>(
    url.searchParams.get('reviewSession'),
    ['active', 'expired', 'revoked'],
    'active',
  )
  const scenario = reviewScenarios.find((candidate) => candidate.id === scenarioId)!
  const authStore = new InMemoryAuthStore()
  const sessionRegistry = new InMemorySessionRegistry()
  const session = sessionFor(scenario, environment.now ?? Date.now(), sessionState)
  if (session) {
    authStore.setSession(session)
    await sessionRegistry.registerCurrentSession(session)
    if (sessionState === 'revoked') await sessionRegistry.revoke(session)
  }
  return {
    active: true,
    scenario,
    state,
    sessionState,
    scenarios: reviewScenarios,
    states: REVIEW_STATE_IDS,
    authStore,
    sessionRegistry,
  }
}
