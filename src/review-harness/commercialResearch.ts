import type { BillingClient, CommercialResearchConfig } from '../features/billing'

const config: CommercialResearchConfig = {
  version: 7,
  state: 'approved_inactive',
  digest: 'a'.repeat(64),
  galleryPriceCents: 1200,
  fullGalleryPriceCents: 1900,
  currency: 'USD',
  taxMode: 'Tax is calculated at checkout.',
  firstChargeRule: 'The first charge follows Checkout confirmation.',
  renewalRule: 'The plan renews monthly until canceled.',
  refundPolicyVersion: 'refund-v1',
  supportPolicyVersion: 'support-v1',
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
  fullGalleryLimitsVersion: 'limits-v1',
  fullGalleryLimits: {
    acceptedFileTypes: ['image/jpeg', 'image/png'],
    maxFileBytes: 10_000_000,
    maxWidthPixels: 6000,
    maxHeightPixels: 6000,
    uploadRateRule: 'Up to 20 uploads per hour.',
    quotaOutageRule: 'Uploads pause during quota or provider outages.',
    moderationAbuseRule: 'Every photo remains subject to moderation and abuse controls.',
    reasonRecoveryAppealRule: 'A reason, recovery step, and appeal path are provided.',
    paidServiceRemedy: 'Service failures receive the published remedy.',
  },
}

export const commercialResearchReviewClient: BillingClient = {
  async getCapability() {
    return { enabled: false, source: 'server' }
  },
  async startCheckout() {
    throw new Error('provider_call_forbidden')
  },
  async openPortal() {
    throw new Error('provider_call_forbidden')
  },
  async getCommercialResearchConfig() {
    return config
  },
  async recordCommercialResearchAttempt() {
    return {
      attemptId: 'review-attempt',
      configVersion: config.version,
      configDigest: config.digest,
    }
  },
}
