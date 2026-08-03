export type BetaAccountRole = 'shopper' | 'administrator' | 'store_representative'
export type BetaOrdinal = 1 | 2 | 3

export interface BetaAccount {
  accountId: string
  cohortId: string
  role: BetaAccountRole
  verified: boolean
  human: boolean
  storeId?: string
}

export type BetaCheckCode =
  | 'consent'
  | 'authority'
  | 'onboarding'
  | 'store_portal'
  | 'data_accuracy'
  | 'direct_publishing'
  | 'controlled_publishing'
  | 'shopper_trip'
  | 'authorization'
  | 'audit'
  | 'support'
  | 'monitoring'
  | 'recovery'
  | 'incident'
  | 'withdrawal'
  | 'current_verification'

export interface BetaGateCheck {
  code: BetaCheckCode
  status: 'passed' | 'failed' | 'missing'
}

export interface BetaDefect {
  defectId: string
  severity: 'blocking' | 'privacy' | 'security' | 'data_loss' | 'other'
  state: 'open' | 'resolved'
}

export interface BetaGatePacket {
  ordinal: BetaOrdinal
  frozenDigest: string
  ownerDisposition: 'continue' | 'withdraw' | 'missing'
  checks: BetaGateCheck[]
  defects: BetaDefect[]
}

export interface BetaGateReceipt {
  receiptId: string
  cohortId: string
  ordinal: BetaOrdinal
  decision: 'pass' | 'reject'
  signerAccountId: string
  signerResponsibility: 'ProductOwner'
  frozenDigest: string
  signedAt: string
  signature: string
}

export interface BetaReceiptVerifier {
  verify(receipt: BetaGateReceipt): Promise<boolean>
}

export interface BetaAdmission {
  ordinal: BetaOrdinal
  storeId: string
  representativeAccountId: string
}

export interface BetaCapabilities {
  readonly openSignup: false
  readonly publicReviews: false
  readonly anonymousRealStoreAccess: false
  readonly publicPromotion: false
  readonly ownerAnalytics: false
  readonly pilotStoreAudience: 'invited_cohort_only'
}

export interface BetaCohortState {
  cohortId: string
  accounts: BetaAccount[]
  admissions: BetaAdmission[]
  receipts: BetaGateReceipt[]
  capabilities: BetaCapabilities
  regionalPublicReadinessReview: 'closed' | 'open'
}

export interface InitialBetaCohortInput {
  cohortId: string
  accounts: BetaAccount[]
  initialStoreId: string
  initialRepresentativeAccountId: string
}
