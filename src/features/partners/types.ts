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
}
