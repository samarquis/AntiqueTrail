import type {
  BetaAccount,
  BetaCapabilities,
  BetaCheckCode,
  BetaCohortState,
  BetaGatePacket,
  BetaGateReceipt,
  BetaOrdinal,
  BetaReceiptVerifier,
  InitialBetaCohortInput,
} from './types'

export const REQUIRED_BETA_CHECKS: readonly BetaCheckCode[] = [
  'consent',
  'authority',
  'onboarding',
  'store_portal',
  'data_accuracy',
  'direct_publishing',
  'controlled_publishing',
  'shopper_trip',
  'authorization',
  'audit',
  'support',
  'monitoring',
  'recovery',
  'incident',
  'withdrawal',
  'current_verification',
]

export const DISABLED_PUBLIC_BETA_CAPABILITIES: BetaCapabilities = Object.freeze({
  openSignup: false,
  publicReviews: false,
  anonymousRealStoreAccess: false,
  publicPromotion: false,
  ownerAnalytics: false,
  pilotStoreAudience: 'invited_cohort_only',
})

function assertInitialAccounts(input: InitialBetaCohortInput): void {
  const ids = input.accounts.map((account) => account.accountId)
  if (new Set(ids).size !== ids.length) throw new Error('beta_accounts_must_be_separate')
  if (input.accounts.some((account) => !account.human)) throw new Error('beta_human_cohort_only')
  if (input.accounts.some((account) => !account.verified))
    throw new Error('beta_verified_accounts_only')
  if (input.accounts.some((account) => account.cohortId !== input.cohortId))
    throw new Error('beta_wrong_cohort')

  const shoppers = input.accounts.filter((account) => account.role === 'shopper')
  const administrators = input.accounts.filter((account) => account.role === 'administrator')
  const representatives = input.accounts.filter(
    (account) => account.role === 'store_representative',
  )
  if (shoppers.length !== 2 || administrators.length !== 1 || representatives.length !== 1)
    throw new Error('beta_initial_role_contract_invalid')
  if (
    shoppers.some((account) => account.storeId) ||
    administrators.some((account) => account.storeId)
  )
    throw new Error('beta_non_representative_store_scope')

  const representative = representatives[0]
  if (
    representative.accountId !== input.initialRepresentativeAccountId ||
    representative.storeId !== input.initialStoreId
  )
    throw new Error('beta_representative_store_scope_invalid')
}

export function createInitialBetaCohort(input: InitialBetaCohortInput): BetaCohortState {
  assertInitialAccounts(input)
  return {
    cohortId: input.cohortId,
    accounts: input.accounts.map((account) => ({ ...account })),
    admissions: [
      {
        ordinal: 1,
        storeId: input.initialStoreId,
        representativeAccountId: input.initialRepresentativeAccountId,
      },
    ],
    receipts: [],
    capabilities: DISABLED_PUBLIC_BETA_CAPABILITIES,
    regionalPublicReadinessReview: 'closed',
  }
}

function assertReceiptMatches(
  state: BetaCohortState,
  packet: BetaGatePacket,
  receipt: BetaGateReceipt,
): void {
  if (
    receipt.cohortId !== state.cohortId ||
    receipt.ordinal !== packet.ordinal ||
    receipt.frozenDigest !== packet.frozenDigest ||
    receipt.signerResponsibility !== 'ProductOwner' ||
    !receipt.receiptId ||
    !receipt.signerAccountId ||
    !receipt.signedAt ||
    !receipt.signature
  )
    throw new Error('beta_receipt_mismatch')
  if (!state.admissions.some((admission) => admission.ordinal === packet.ordinal))
    throw new Error('beta_gate_ordinal_not_admitted')
}

function assertPassingPacket(packet: BetaGatePacket): void {
  const codes = packet.checks.map((check) => check.code)
  const uniqueCodes = new Set(codes)
  if (
    codes.length !== REQUIRED_BETA_CHECKS.length ||
    uniqueCodes.size !== REQUIRED_BETA_CHECKS.length ||
    REQUIRED_BETA_CHECKS.some((code) => !uniqueCodes.has(code))
  )
    throw new Error('beta_gate_checks_incomplete')
  if (packet.checks.some((check) => check.status !== 'passed'))
    throw new Error('beta_gate_check_failed')
  if (packet.ownerDisposition !== 'continue') throw new Error('beta_owner_did_not_continue')
  if (packet.defects.some((defect) => defect.state === 'open'))
    throw new Error('beta_unresolved_defects')
}

function sameReceipt(left: BetaGateReceipt, right: BetaGateReceipt): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export async function recordGateDecision(
  state: BetaCohortState,
  packet: BetaGatePacket,
  receipt: BetaGateReceipt,
  verifier: BetaReceiptVerifier,
): Promise<BetaCohortState> {
  const replay = state.receipts.find((existing) => existing.receiptId === receipt.receiptId)
  if (replay) {
    if (!sameReceipt(replay, receipt)) throw new Error('beta_receipt_replay_mismatch')
    return state
  }
  assertReceiptMatches(state, packet, receipt)
  if (!(await verifier.verify(receipt))) throw new Error('beta_receipt_signature_invalid')
  if (receipt.decision === 'pass') assertPassingPacket(packet)

  const opensReadiness = receipt.decision === 'pass' && receipt.ordinal === 3
  return {
    ...state,
    receipts: [...state.receipts, { ...receipt }],
    capabilities: DISABLED_PUBLIC_BETA_CAPABILITIES,
    regionalPublicReadinessReview: opensReadiness ? 'open' : state.regionalPublicReadinessReview,
  }
}

function nextOrdinal(count: number): BetaOrdinal {
  if (count === 1) return 2
  if (count === 2) return 3
  throw new Error('beta_store_cap_reached')
}

export function admitNextStore(
  state: BetaCohortState,
  representative: BetaAccount,
  storeId: string,
): BetaCohortState {
  if (state.admissions.length >= 3 || state.regionalPublicReadinessReview === 'open')
    throw new Error('beta_store_cap_reached')
  const prior = state.admissions[state.admissions.length - 1]
  const latestPriorReceipt = [...state.receipts]
    .reverse()
    .find((receipt) => receipt.ordinal === prior.ordinal)
  if (latestPriorReceipt?.decision !== 'pass') throw new Error('beta_prior_gate_not_passed')
  if (
    representative.role !== 'store_representative' ||
    !representative.verified ||
    !representative.human ||
    representative.cohortId !== state.cohortId ||
    representative.storeId !== storeId
  )
    throw new Error('beta_next_representative_invalid')
  if (state.accounts.some((account) => account.accountId === representative.accountId))
    throw new Error('beta_accounts_must_be_separate')
  if (state.admissions.some((admission) => admission.storeId === storeId))
    throw new Error('beta_store_already_admitted')

  return {
    ...state,
    accounts: [...state.accounts, { ...representative }],
    admissions: [
      ...state.admissions,
      {
        ordinal: nextOrdinal(state.admissions.length),
        storeId,
        representativeAccountId: representative.accountId,
      },
    ],
    capabilities: DISABLED_PUBLIC_BETA_CAPABILITIES,
  }
}
