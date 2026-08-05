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

export interface DurableBetaClient {
  getState(cohortId: string): Promise<unknown>
  requestGateDecision(input: {
    cohortId: string
    ordinal: BetaOrdinal
    decision: 'pass' | 'reject'
  }): Promise<unknown>
  completeGateDecision(input: {
    challengeId: string
    payloadDigest: string
    idempotencyKey: string
  }): Promise<unknown>
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
  }): Promise<unknown>
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
