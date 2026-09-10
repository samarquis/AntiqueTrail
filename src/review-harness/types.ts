import type { AuthStore, SessionRegistryClient } from '../features/auth'

export const REVIEW_SCENARIO_IDS = [
  'anonymous',
  'shopper-a',
  'shopper-b',
  'representative',
  'administrator',
] as const

export const REVIEW_STATE_IDS = [
  'success',
  'loading',
  'empty',
  'error',
  'blocked',
  'permission-denied',
] as const

// Local-only Administrator-decision fixtures used by focused browser diagnostics.
// These never select a production client or server path.
export const REVIEW_ADMIN_DECISION_MODES = ['ordinary', 'stale', 'pending', 'interrupted'] as const

export type ReviewScenarioId = (typeof REVIEW_SCENARIO_IDS)[number]
export type ReviewStateId = (typeof REVIEW_STATE_IDS)[number]
export type ReviewAdminDecisionMode = (typeof REVIEW_ADMIN_DECISION_MODES)[number]
export type ReviewSessionState = 'active' | 'expired' | 'revoked'

export interface ReviewDestination {
  label: string
  path: string
  purpose: string
}

export interface ReviewScenario {
  id: ReviewScenarioId
  label: string
  identity: string
  role: 'Anonymous' | 'Shopper' | 'Representative' | 'Administrator'
  fixtureSummary: string
  destinations: readonly ReviewDestination[]
  deniedDestinations: readonly ReviewDestination[]
}

export interface ReviewHarnessRuntime {
  active: true
  scenario: ReviewScenario
  state: ReviewStateId
  adminDecisionMode: ReviewAdminDecisionMode
  sessionState: ReviewSessionState
  mediaReviewEnabled: boolean
  scenarios: readonly ReviewScenario[]
  states: readonly ReviewStateId[]
  authStore: AuthStore
  sessionRegistry: SessionRegistryClient
}
