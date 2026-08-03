export type InvitationState = 'active' | 'registration_pending' | 'consumed' | 'expired' | 'revoked'
export type PendingIdentityState = 'provisional' | 'auth_pending' | 'bound' | 'expired'
export type OnboardingState =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export interface PartnerInvitation {
  state: InvitationState
  expiresAt?: string
  maskedRecipient?: string
}

export interface PartnerDraft {
  storeName: string
  address: string
  hours: string
  website: string
  description: string
}

export interface PartnerTypedIdentity {
  name: string
  title: string
  store: string
  email: string
}

export interface PartnerConsentAcknowledgements {
  authority: boolean
  voluntary: boolean
  permittedData: boolean
  noPayment: boolean
  withdrawal: boolean
}

export interface PartnerStatus {
  invitation: InvitationState
  pendingIdentity: PendingIdentityState
  onboarding: OnboardingState
  storeScope?: string
}

export type PartnerClaimState =
  | 'draft'
  | 'submitted'
  | 'verification_pending'
  | 'changes_requested'
  | 'conflict'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'revoked'

export type PartnerClaimRiskTier = 'standard' | 'elevated' | 'high'

export interface PartnerClaimDraft {
  storeReference: string
  relationship: string
  authorityStatement: string
}

export interface PartnerClaimSignalInput {
  claimId: string
  channelClass:
    | 'published_business_contact'
    | 'callback'
    | 'mailed_code'
    | 'filing_lookup'
    | 'in_person'
  evidenceReference: string
}

export interface PartnerClaimStatus {
  claimId: string
  state: PartnerClaimState
  riskTier: PartnerClaimRiskTier
  verifiedSignalCount: number
  requiredSignalCount: 2
  recheckDueAt?: string
  exactStoreScope?: string
  conflict?: { state: 'open' | 'resolved' | 'rejected' | 'withdrawn' }
}

export interface PartnerClient {
  exchangeInvitation(token: string): Promise<PartnerInvitation>
  acceptConsent(input: {
    token: string
    identity: PartnerTypedIdentity
    acknowledgements: PartnerConsentAcknowledgements
  }): Promise<PartnerStatus>
  bindIdentity(): Promise<PartnerStatus>
  getStatus(): Promise<PartnerStatus>
  saveDraft(draft: PartnerDraft): Promise<PartnerStatus>
  submitDraft(): Promise<PartnerStatus>
  withdraw(): Promise<PartnerStatus>
  submitClaim(draft: PartnerClaimDraft): Promise<PartnerClaimStatus>
  getClaimStatus(): Promise<PartnerClaimStatus | null>
  submitAuthoritySignal(input: PartnerClaimSignalInput): Promise<PartnerClaimStatus>
  withdrawClaim(claimId: string): Promise<PartnerClaimStatus>
  requestAuthorityRecheck(claimId: string): Promise<PartnerClaimStatus>
}
