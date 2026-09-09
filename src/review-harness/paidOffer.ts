import type { CommercialResearchConfig } from '../features/billing/types'

// Synthetic review fixture; never a live price or activation receipt.
export const syntheticPaidOffer: CommercialResearchConfig = {
  version: 7,
  state: 'active',
  digest: 'a'.repeat(64),
  galleryPriceCents: 1200,
  fullGalleryPriceCents: 1900,
  currency: 'USD',
  taxMode: 'Tax is calculated at checkout.',
  firstChargeRule: 'The first charge follows Checkout confirmation.',
  renewalRule: 'The plan renews monthly until canceled.',
  cancelAnytimeRule: 'Cancel anytime through the self-serve customer portal.',
  refundWindowRule: 'Request a full refund within 48 hours of a charge; no other refunds.',
  upgradeProrationRule: 'Upgrades take effect immediately with prorated charges.',
  downgradeRule:
    'Downgrades take effect at renewal with no partial refund; the last scheduled downgrade wins.',
  failedPaymentGraceRule:
    'Failed payment has a 14-day grace period, then automatically downgrades to Free.',
  hiddenPhotoDeletionRule:
    'Photos over the Free limit hide at downgrade and delete after a 30-day grace period.',
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
    quotaOutageRule: 'Uploads pause during provider outages.',
    moderationAbuseRule: 'Every photo remains subject to moderation and abuse controls.',
    reasonRecoveryAppealRule: 'A reason, recovery step, and appeal path are provided.',
    paidServiceRemedy: 'Service failures receive the published remedy.',
  },
}
