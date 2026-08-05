import { describe, expect, it, vi } from 'vitest'
import { BetaApiError, createBetaClient } from './betaClient'

describe('durable Controlled Private Beta client', () => {
  it('admits only the explicitly requested next store through the durable RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { cohortId: 'cohort-1', ordinal: 2, storeId: 'store-2', state: 'active' },
      error: null,
    }))
    const client = createBetaClient({ rpc })

    await expect(
      client.admitNextStore({
        cohortId: 'cohort-1',
        storeId: 'store-2',
        representativeAccountId: 'representative-2',
        expectedCohortVersion: 4,
        idempotencyKey: 'admit-store-2',
      }),
    ).resolves.toMatchObject({ ordinal: 2, storeId: 'store-2' })

    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('beta_admit_next_store', {
      p_cohort_id: 'cohort-1',
      p_store_id: 'store-2',
      p_representative_user_id: 'representative-2',
      p_expected_cohort_version: 4,
      p_idempotency_key: 'admit-store-2',
    })
  })

  it('requests a Product Owner decision challenge without client-authored evidence', async () => {
    const rpc = vi.fn(async () => ({
      data: { challengeId: 'challenge-1', payloadDigest: 'ab'.repeat(32) },
      error: null,
    }))
    const client = createBetaClient({ rpc })

    await client.requestGateDecision({ cohortId: 'cohort-1', ordinal: 1, decision: 'pass' })

    expect(rpc).toHaveBeenCalledWith('beta_request_gate_decision', {
      p_cohort_id: 'cohort-1',
      p_ordinal: 1,
      p_decision: 'pass',
    })
    expect(JSON.stringify(rpc.mock.calls[0])).not.toMatch(/checks|defects|receipt|signature/i)
  })

  it('completes the one-use decision challenge without accepting a client signature', async () => {
    const rpc = vi.fn(async () => ({
      data: { receiptId: 'receipt-1', decision: 'pass' },
      error: null,
    }))
    const client = createBetaClient({ rpc })

    await client.completeGateDecision({
      challengeId: 'challenge-1',
      payloadDigest: 'ab'.repeat(32),
      idempotencyKey: 'sign-gate-1',
    })

    expect(rpc).toHaveBeenCalledWith('beta_complete_gate_decision', {
      p_challenge_id: 'challenge-1',
      p_payload_digest: 'ab'.repeat(32),
      p_idempotency_key: 'sign-gate-1',
    })
    expect(JSON.stringify(rpc.mock.calls[0])).not.toMatch(/signature|checks|defects/i)
  })

  it('recovers a paused cohort only through an explicit versioned command', async () => {
    const rpc = vi.fn(async () => ({
      data: { cohortId: 'cohort-1', state: 'active', recoveredStores: 1 },
      error: null,
    }))
    const client = createBetaClient({ rpc })

    await client.recoverCohort({
      cohortId: 'cohort-1',
      expectedCohortVersion: 7,
      idempotencyKey: 'recover-cohort-1',
    })

    expect(rpc).toHaveBeenCalledWith('beta_recover_cohort', {
      p_cohort_id: 'cohort-1',
      p_expected_cohort_version: 7,
      p_idempotency_key: 'recover-cohort-1',
    })
  })

  it('fails closed with one generic error', async () => {
    const client = createBetaClient({ rpc: async () => ({ data: null, error: 'denied' }) })

    await expect(client.getState('cohort-1')).rejects.toBeInstanceOf(BetaApiError)
  })
})
