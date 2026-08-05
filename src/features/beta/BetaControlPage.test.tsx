import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BetaControlPage } from './BetaControlPage'
import type { DurableBetaClient, DurableBetaState } from './betaClient'

const state: DurableBetaState = {
  cohortId: 'cohort-1',
  state: 'active',
  currentOrdinal: 1,
  version: 4,
  regionalPublicReadinessReview: 'closed',
  capabilities: {
    openSignup: false,
    publicReviews: false,
    anonymousRealStoreAccess: false,
    publicPromotion: false,
    ownerAnalytics: false,
    pilotStoreAudience: 'invited_cohort_only',
  },
  admissions: [
    {
      cohortId: 'cohort-1',
      ordinal: 1,
      storeId: 'store-1',
      representativeAccountId: 'representative-1',
      state: 'active',
      gateState: 'pending',
    },
  ],
}

function client(): DurableBetaClient {
  return {
    getState: vi.fn(async () => state),
    requestGateDecision: vi.fn(async () => ({
      challengeId: 'challenge-1',
      payloadDigest: 'digest-1',
      expiresInSeconds: 1800,
    })),
    completeGateDecision: vi.fn(async () => ({
      receiptId: 'receipt-1',
      cohortId: 'cohort-1',
      ordinal: 1 as const,
      decision: 'pass' as const,
      signatureKind: 'authenticated_product_owner_mfa' as const,
    })),
    admitNextStore: vi.fn(async (input) => ({
      cohortId: input.cohortId,
      ordinal: 2 as const,
      storeId: input.storeId,
      state: 'active' as const,
    })),
    withdrawStore: vi.fn(async (input) => ({
      cohortId: input.cohortId,
      ordinal: 1 as const,
      storeId: input.storeId,
      state: 'withdrawn' as const,
    })),
    recoverCohort: vi.fn(async () => state),
  }
}

describe('controlled beta operations page', () => {
  afterEach(cleanup)

  it('requires an explicit two-step Product Owner decision and exact next-store admission', async () => {
    const user = userEvent.setup()
    const boundary = client()
    render(<BetaControlPage cohortId="cohort-1" client={boundary} />)
    expect(
      screen.getByText(/exactly two verified shopper accounts.*one verified administrator/i),
    ).toBeVisible()
    expect(screen.getByText(/there is no open signup path/i)).toBeVisible()
    expect(await screen.findByText(/cohort active; current ordinal 1/i)).toBeVisible()

    await user.click(screen.getByRole('button', { name: /request pass decision/i }))
    expect(boundary.requestGateDecision).toHaveBeenCalledWith({
      cohortId: 'cohort-1',
      ordinal: 1,
      decision: 'pass',
    })
    expect(boundary.completeGateDecision).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /confirm product owner pass/i }))
    expect(boundary.completeGateDecision).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: 'challenge-1', payloadDigest: 'digest-1' }),
    )

    await user.type(screen.getByLabelText(/^store id$/i), 'store-2')
    await user.type(screen.getByLabelText(/representative account id/i), 'representative-2')
    await user.click(screen.getByRole('button', { name: /admit next store/i }))
    expect(boundary.admitNextStore).toHaveBeenCalledWith(
      expect.objectContaining({
        cohortId: 'cohort-1',
        storeId: 'store-2',
        representativeAccountId: 'representative-2',
        expectedCohortVersion: 4,
      }),
    )
  })
})
