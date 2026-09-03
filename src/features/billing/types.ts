export interface BillingCapability {
  enabled: boolean
  source: string
}

export interface CheckoutRequest {
  storeId: string
  idempotencyKey: string
  tier: 'gallery' | 'full_gallery'
}

export type CommercialConfigState = 'approved_inactive'
export type CommercialResearchChoice = 'free' | 'gallery' | 'full_gallery' | 'refused' | 'abandoned'

export interface FullGalleryLimits {
  acceptedFileTypes: readonly string[]
  maxFileBytes: number
  maxWidthPixels: number
  maxHeightPixels: number
  uploadRateRule: string
  quotaOutageRule: string
  moderationAbuseRule: string
  reasonRecoveryAppealRule: string
  paidServiceRemedy: string
}

export interface CommercialResearchConfig {
  version: number
  state: CommercialConfigState
  digest: string
  galleryPriceCents: number
  fullGalleryPriceCents: number
  currency: string
  taxMode: string
  firstChargeRule: string
  renewalRule: string
  cancelAnytimeRule: string
  refundWindowRule: string
  upgradeProrationRule: string
  downgradeRule: string
  failedPaymentGraceRule: string
  hiddenPhotoDeletionRule: string
  refundPolicyVersion: string
  supportPolicyVersion: string
  termsVersion: string
  privacyVersion: string
  fullGalleryLimitsVersion: string
  fullGalleryLimits: FullGalleryLimits
}

export interface CommercialResearchAttempt {
  authorizationId: string
  configVersion: number
  configDigest: string
  artifactDigest: string
  questionVersion: string
  choice: CommercialResearchChoice
  reasonCode: string
  idempotencyKey: string
}

export interface CommercialResearchReceipt {
  attemptId: string
  configVersion: number
  configDigest: string
}

export interface BillingRpcTransport {
  rpc(
    name: BillingRpcName,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown }>
}

export type BillingRpcName =
  | 'billing_get_capability'
  | 'billing_create_checkout_session'
  | 'billing_create_portal_session'
  | 'billing_get_commercial_research_config'
  | 'billing_record_commercial_research_attempt'

export interface BillingClient {
  getCapability(): Promise<BillingCapability>
  startCheckout(request: CheckoutRequest): Promise<{ requested: boolean; storeId: string }>
  openPortal(storeId: string): Promise<{ requested: boolean; storeId: string }>
  getCommercialResearchConfig(authorizationId: string): Promise<CommercialResearchConfig>
  recordCommercialResearchAttempt(
    attempt: CommercialResearchAttempt,
  ): Promise<CommercialResearchReceipt>
}
