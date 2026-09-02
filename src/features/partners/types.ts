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
  resumeHandle?: string
  consentReceiptId?: string
}

export interface PartnerConsentStatus {
  requiredVersion: string
  acceptedVersion?: string
  reconsentRequired: boolean
  materialTerms: string[]
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
  consentReceiptId?: string
  consentPolicyVersion?: string
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
  /** Server rechecks this exact catalog ID; labels and client flags never authorize a claim. */
  storeId: string
  relationship: string
  authorityStatement: string
  idempotencyKey: string
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
  recheckDueAt?: string
  exactStoreScope?: string
  conflict?: { state: 'open' | 'resolved' | 'rejected' | 'withdrawn' }
}

export interface PartnerClient {
  exchangeInvitation(token: string): Promise<PartnerInvitation>
  resumeInvitation(resumeHandle: string): Promise<PartnerInvitation>
  acceptConsent(input: {
    resumeHandle: string
    idempotencyKey: string
    identity: PartnerTypedIdentity
    acknowledgements: PartnerConsentAcknowledgements
  }): Promise<PartnerStatus>
  getConsentStatus(): Promise<PartnerConsentStatus>
  acceptMaterialTerms(input: {
    policyVersion: string
    acknowledgements: { reviewed: boolean; voluntary: boolean }
    idempotencyKey: string
  }): Promise<PartnerConsentStatus>
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
