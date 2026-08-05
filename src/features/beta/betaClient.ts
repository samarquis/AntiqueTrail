import type { BetaOrdinal } from './types'

type BetaRpcName =
  | 'beta_get_state'
  | 'beta_request_gate_decision'
  | 'beta_complete_gate_decision'
  | 'beta_admit_next_store'
  | 'beta_withdraw_store'
  | 'beta_recover_cohort'

export interface BetaRpcTransport {
  rpc(
    name: BetaRpcName,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown }>
}

export interface BetaAdmissionResult {
  cohortId: string
  ordinal: BetaOrdinal
  storeId: string
  state: 'active' | 'withdrawn' | 'rolled_back'
}

export interface DurableBetaState {
  cohortId: string
  state: 'disabled' | 'active' | 'paused' | 'withdrawn' | 'completed'
  currentOrdinal: BetaOrdinal
  version: number
  regionalPublicReadinessReview: 'closed' | 'open'
  admissions: Array<
    BetaAdmissionResult & {
      representativeAccountId: string
      gateState: 'pending' | 'passed' | 'rejected'
    }
  >
  capabilities: {
    openSignup: false
    publicReviews: false
    anonymousRealStoreAccess: false
    publicPromotion: false
    ownerAnalytics: false
    pilotStoreAudience: 'invited_cohort_only'
  }
}

export interface BetaGateChallenge {
  challengeId: string
  payloadDigest: string
  expiresInSeconds: number
}

export interface BetaGateDecisionReceipt {
  receiptId: string
  cohortId: string
  ordinal: BetaOrdinal
  decision: 'pass' | 'reject'
  signatureKind: 'authenticated_product_owner_mfa'
}

export interface DurableBetaClient {
  getState(cohortId: string): Promise<DurableBetaState>
  requestGateDecision(input: {
    cohortId: string
    ordinal: BetaOrdinal
    decision: 'pass' | 'reject'
  }): Promise<BetaGateChallenge>
  completeGateDecision(input: {
    challengeId: string
    payloadDigest: string
    idempotencyKey: string
  }): Promise<BetaGateDecisionReceipt>
  admitNextStore(input: {
    cohortId: string
    storeId: string
    representativeAccountId: string
    expectedCohortVersion: number
    idempotencyKey: string
  }): Promise<BetaAdmissionResult>
  withdrawStore(input: {
    cohortId: string
    storeId: string
    reasonCode: 'owner_withdrawn' | 'blocking_defect' | 'scope_leak' | 'operational_stop'
    expectedCohortVersion: number
    idempotencyKey: string
  }): Promise<BetaAdmissionResult>
  recoverCohort(input: {
    cohortId: string
    expectedCohortVersion: number
    idempotencyKey: string
  }): Promise<DurableBetaState>
}

export const GENERIC_BETA_ERROR =
  'Private Beta expansion is unavailable. No store or participant access has changed.'

export class BetaApiError extends Error {
  constructor() {
    super(GENERIC_BETA_ERROR)
    this.name = 'BetaApiError'
  }
}

export function createBetaClient(transport: BetaRpcTransport): DurableBetaClient {
  async function call<T>(name: BetaRpcName, args: Readonly<Record<string, unknown>>): Promise<T> {
    try {
      const result = await transport.rpc(name, args)
      if (result.error || result.data === null || result.data === undefined)
        throw new BetaApiError()
      return result.data as T
    } catch (error) {
      if (error instanceof BetaApiError) throw error
      throw new BetaApiError()
    }
  }

  return {
    getState: (cohortId) => call('beta_get_state', { p_cohort_id: cohortId }),
    requestGateDecision: ({ cohortId, ordinal, decision }) =>
      call('beta_request_gate_decision', {
        p_cohort_id: cohortId,
        p_ordinal: ordinal,
        p_decision: decision,
      }),
    completeGateDecision: ({ challengeId, payloadDigest, idempotencyKey }) =>
      call('beta_complete_gate_decision', {
        p_challenge_id: challengeId,
        p_payload_digest: payloadDigest,
        p_idempotency_key: idempotencyKey,
      }),
    admitNextStore: (input) =>
      call('beta_admit_next_store', {
        p_cohort_id: input.cohortId,
        p_store_id: input.storeId,
        p_representative_user_id: input.representativeAccountId,
        p_expected_cohort_version: input.expectedCohortVersion,
        p_idempotency_key: input.idempotencyKey,
      }),
    withdrawStore: (input) =>
      call('beta_withdraw_store', {
        p_cohort_id: input.cohortId,
        p_store_id: input.storeId,
        p_reason_code: input.reasonCode,
        p_expected_cohort_version: input.expectedCohortVersion,
        p_idempotency_key: input.idempotencyKey,
      }),
    recoverCohort: (input) =>
      call('beta_recover_cohort', {
        p_cohort_id: input.cohortId,
        p_expected_cohort_version: input.expectedCohortVersion,
        p_idempotency_key: input.idempotencyKey,
      }),
  }
}

const unavailable = async (): Promise<never> => {
  throw new BetaApiError()
}

export const unavailableBetaClient: DurableBetaClient = {
  getState: unavailable,
  requestGateDecision: unavailable,
  completeGateDecision: unavailable,
  admitNextStore: unavailable,
  withdrawStore: unavailable,
  recoverCohort: unavailable,
}
