import { describe, expect, it, vi } from 'vitest'
import {
  REQUIRED_BETA_CHECKS,
  admitNextStore,
  createInitialBetaCohort,
  recordGateDecision,
} from './betaMachine'
import type { BetaAccount, BetaGatePacket, BetaGateReceipt, BetaReceiptVerifier } from './types'

const accounts: BetaAccount[] = [
  {
    accountId: 'shopper-primary',
    cohortId: 'cohort-1',
    role: 'shopper',
    verified: true,
    human: true,
  },
  {
    accountId: 'shopper-independent',
    cohortId: 'cohort-1',
    role: 'shopper',
    verified: true,
    human: true,
  },
  {
    accountId: 'administrator-1',
    cohortId: 'cohort-1',
    role: 'administrator',
    verified: true,
    human: true,
  },
  {
    accountId: 'representative-1',
    cohortId: 'cohort-1',
    role: 'store_representative',
    verified: true,
    human: true,
    storeId: 'store-1',
  },
]

function passingPacket(ordinal: 1 | 2 | 3): BetaGatePacket {
  return {
    ordinal,
    frozenDigest: `digest-${ordinal}`,
    ownerDisposition: 'continue',
    checks: REQUIRED_BETA_CHECKS.map((code) => ({ code, status: 'passed' as const })),
    defects: [],
  }
}

function receipt(ordinal: 1 | 2 | 3, decision: 'pass' | 'reject' = 'pass'): BetaGateReceipt {
  return {
    receiptId: `receipt-${ordinal}-${decision}`,
    cohortId: 'cohort-1',
    ordinal,
    decision,
    signerAccountId: 'product-owner-1',
    signerResponsibility: 'ProductOwner',
    frozenDigest: `digest-${ordinal}`,
    signedAt: '2026-08-03T12:00:00Z',
    signature: 'opaque-signature',
  }
}

const verifiedReceipt: BetaReceiptVerifier = {
  verify: vi.fn(async () => true),
}

describe('Controlled Private Beta expansion machine', () => {
  it('creates only the separate-account, invitation-only initial cohort', () => {
    const state = createInitialBetaCohort({
      cohortId: 'cohort-1',
      accounts,
      initialStoreId: 'store-1',
      initialRepresentativeAccountId: 'representative-1',
    })

    expect(state.admissions).toHaveLength(1)
    expect(new Set(state.accounts.map((account) => account.accountId))).toHaveLength(4)
    expect(state.capabilities).toEqual({
      openSignup: false,
      publicReviews: false,
      anonymousRealStoreAccess: false,
      publicPromotion: false,
      ownerAnalytics: false,
      pilotStoreAudience: 'invited_cohort_only',
    })
  })

  it('rejects a shared role account or an AI participant in the initial cohort', () => {
    expect(() =>
      createInitialBetaCohort({
        cohortId: 'cohort-1',
        accounts: [
          ...accounts,
          {
            accountId: 'administrator-1',
            cohortId: 'cohort-1',
            role: 'shopper',
            verified: true,
            human: true,
          },
        ],
        initialStoreId: 'store-1',
        initialRepresentativeAccountId: 'representative-1',
      }),
    ).toThrow('beta_accounts_must_be_separate')

    expect(() =>
      createInitialBetaCohort({
        cohortId: 'cohort-1',
        accounts: accounts.map((account) =>
          account.accountId === 'shopper-independent' ? { ...account, human: false } : account,
        ),
        initialStoreId: 'store-1',
        initialRepresentativeAccountId: 'representative-1',
      }),
    ).toThrow('beta_human_cohort_only')
  })

  it('blocks a passing decision on missing checks, owner withdrawal, or any unresolved defect', async () => {
    const state = createInitialBetaCohort({
      cohortId: 'cohort-1',
      accounts,
      initialStoreId: 'store-1',
      initialRepresentativeAccountId: 'representative-1',
    })
    const incomplete = passingPacket(1)
    incomplete.checks = incomplete.checks.slice(1)
    await expect(
      recordGateDecision(state, incomplete, receipt(1), verifiedReceipt),
    ).rejects.toThrow('beta_gate_checks_incomplete')
    await expect(
      recordGateDecision(
        state,
        { ...passingPacket(1), ownerDisposition: 'withdraw' },
        receipt(1),
        verifiedReceipt,
      ),
    ).rejects.toThrow('beta_owner_did_not_continue')
    await expect(
      recordGateDecision(
        state,
        {
          ...passingPacket(1),
          defects: [{ defectId: 'defect-1', severity: 'other', state: 'open' }],
        },
        receipt(1),
        verifiedReceipt,
      ),
    ).rejects.toThrow('beta_unresolved_defects')
  })

  it('allows an authenticated rejection but requires a verified exact-digest receipt to pass', async () => {
    const state = createInitialBetaCohort({
      cohortId: 'cohort-1',
      accounts,
      initialStoreId: 'store-1',
      initialRepresentativeAccountId: 'representative-1',
    })
    const incomplete = passingPacket(1)
    incomplete.checks[0] = { ...incomplete.checks[0], status: 'failed' }
    const rejected = await recordGateDecision(
      state,
      incomplete,
      receipt(1, 'reject'),
      verifiedReceipt,
    )
    expect(rejected.receipts[0]?.decision).toBe('reject')
    expect(() => admitNextStore(rejected, accounts[3], 'store-2')).toThrow(
      'beta_prior_gate_not_passed',
    )

    await expect(
      recordGateDecision(
        state,
        passingPacket(1),
        { ...receipt(1), frozenDigest: 'different-digest' },
        verifiedReceipt,
      ),
    ).rejects.toThrow('beta_receipt_mismatch')
    await expect(
      recordGateDecision(state, passingPacket(1), receipt(1), { verify: async () => false }),
    ).rejects.toThrow('beta_receipt_signature_invalid')
  })

  it('adds exactly one verified representative/store after each passing receipt and stops at three', async () => {
    let state = createInitialBetaCohort({
      cohortId: 'cohort-1',
      accounts,
      initialStoreId: 'store-1',
      initialRepresentativeAccountId: 'representative-1',
    })
    state = await recordGateDecision(state, passingPacket(1), receipt(1), verifiedReceipt)
    state = admitNextStore(
      state,
      {
        accountId: 'representative-2',
        cohortId: 'cohort-1',
        role: 'store_representative',
        verified: true,
        human: true,
        storeId: 'store-2',
      },
      'store-2',
    )
    state = await recordGateDecision(state, passingPacket(2), receipt(2), verifiedReceipt)
    state = admitNextStore(
      state,
      {
        accountId: 'representative-3',
        cohortId: 'cohort-1',
        role: 'store_representative',
        verified: true,
        human: true,
        storeId: 'store-3',
      },
      'store-3',
    )
    state = await recordGateDecision(state, passingPacket(3), receipt(3), verifiedReceipt)

    expect(state.admissions.map((admission) => admission.ordinal)).toEqual([1, 2, 3])
    expect(state.regionalPublicReadinessReview).toBe('open')
    expect(state.capabilities.publicReviews).toBe(false)
    expect(state.capabilities.anonymousRealStoreAccess).toBe(false)
    expect(() =>
      admitNextStore(
        state,
        {
          accountId: 'representative-4',
          cohortId: 'cohort-1',
          role: 'store_representative',
          verified: true,
          human: true,
          storeId: 'store-4',
        },
        'store-4',
      ),
    ).toThrow('beta_store_cap_reached')
  })
})
