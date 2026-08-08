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

export type ReviewScenarioId = (typeof REVIEW_SCENARIO_IDS)[number]
export type ReviewStateId = (typeof REVIEW_STATE_IDS)[number]
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
  sessionState: ReviewSessionState
  scenarios: readonly ReviewScenario[]
  states: readonly ReviewStateId[]
  authStore: AuthStore
  sessionRegistry: SessionRegistryClient
}
