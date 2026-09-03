import type {
  BillingCapability,
  BillingClient,
  BillingRpcName,
  BillingRpcTransport,
  CommercialResearchConfig,
  CommercialResearchReceipt,
  FullGalleryLimits,
  CheckoutRequest,
  CommercialResearchAttempt,
} from './types'

export const GENERIC_BILLING_ERROR = "We couldn't complete this billing action. Please try again."
export const BILLING_STAGE_DISABLED_MESSAGE =
  'Photo-tier memberships are not available in this release.'

/**
 * Red-first: written against the Package 13 contract before this module
 * existed — the served capability must say ON for any surface to render.
 */
export const DISABLED_BILLING_CAPABILITY: BillingCapability = {
  enabled: false,
  source: 'server',
}

function unavailable<T>(): Promise<T> {
  return Promise.reject(new Error(GENERIC_BILLING_ERROR))
}

/** The default boundary never starts checkout or opens a portal. */
export const unavailableBillingClient: BillingClient = {
  async getCapability() {
    return DISABLED_BILLING_CAPABILITY
  },
  async startCheckout() {
    return unavailable()
  },
  async openPortal() {
    return unavailable()
  },
  async getCommercialResearchConfig() {
    return unavailable()
  },
  async recordCommercialResearchAttempt() {
    return unavailable()
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(GENERIC_BILLING_ERROR)
  return value
}

function requiredPositiveInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(GENERIC_BILLING_ERROR)
  return Number(value)
}

function parseLimits(value: unknown): FullGalleryLimits {
  if (!isRecord(value)) throw new Error(GENERIC_BILLING_ERROR)
  const acceptedFileTypes = value.acceptedFileTypes
  if (
    !Array.isArray(acceptedFileTypes) ||
    acceptedFileTypes.length === 0 ||
    !acceptedFileTypes.every((item) => typeof item === 'string' && item.length > 0)
  )
    throw new Error(GENERIC_BILLING_ERROR)
  return {
    acceptedFileTypes,
    maxFileBytes: requiredPositiveInteger(value, 'maxFileBytes'),
    maxWidthPixels: requiredPositiveInteger(value, 'maxWidthPixels'),
    maxHeightPixels: requiredPositiveInteger(value, 'maxHeightPixels'),
    uploadRateRule: requiredString(value, 'uploadRateRule'),
    quotaOutageRule: requiredString(value, 'quotaOutageRule'),
    moderationAbuseRule: requiredString(value, 'moderationAbuseRule'),
    reasonRecoveryAppealRule: requiredString(value, 'reasonRecoveryAppealRule'),
    paidServiceRemedy: requiredString(value, 'paidServiceRemedy'),
  }
}

function parseCommercialResearchConfig(value: unknown): CommercialResearchConfig {
  if (!isRecord(value) || value.state !== 'approved_inactive')
    throw new Error(GENERIC_BILLING_ERROR)
  return {
    version: requiredPositiveInteger(value, 'version'),
    state: value.state,
    digest: requiredString(value, 'digest'),
    galleryPriceCents: requiredPositiveInteger(value, 'galleryPriceCents'),
    fullGalleryPriceCents: requiredPositiveInteger(value, 'fullGalleryPriceCents'),
    currency: requiredString(value, 'currency'),
    taxMode: requiredString(value, 'taxMode'),
    firstChargeRule: requiredString(value, 'firstChargeRule'),
    renewalRule: requiredString(value, 'renewalRule'),
    refundPolicyVersion: requiredString(value, 'refundPolicyVersion'),
    supportPolicyVersion: requiredString(value, 'supportPolicyVersion'),
    termsVersion: requiredString(value, 'termsVersion'),
    privacyVersion: requiredString(value, 'privacyVersion'),
    fullGalleryLimitsVersion: requiredString(value, 'fullGalleryLimitsVersion'),
    fullGalleryLimits: parseLimits(value.fullGalleryLimits),
  }
}

function parseCommercialResearchReceipt(value: unknown): CommercialResearchReceipt {
  if (!isRecord(value)) throw new Error(GENERIC_BILLING_ERROR)
  return {
    attemptId: requiredString(value, 'attemptId'),
    configVersion: requiredPositiveInteger(value, 'configVersion'),
    configDigest: requiredString(value, 'configDigest'),
  }
}

export function createBillingClient(transport: BillingRpcTransport): BillingClient {
  async function call(
    name: BillingRpcName,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<unknown> {
    const result = await transport.rpc(name, args)
    if (result.error || result.data === null || result.data === undefined)
      throw new Error(GENERIC_BILLING_ERROR)
    return result.data
  }

  return {
    getCapability: async () => {
      const value = await call('billing_get_capability')
      if (
        !isRecord(value) ||
        typeof value.enabled !== 'boolean' ||
        typeof value.source !== 'string'
      )
        throw new Error(GENERIC_BILLING_ERROR)
      return { enabled: value.enabled, source: value.source }
    },
    startCheckout: ({ storeId, idempotencyKey }: CheckoutRequest) =>
      call('billing_create_checkout_session', {
        p_store_id: storeId,
        p_idempotency_key: idempotencyKey,
      }).then(() => ({ requested: true, storeId })),
    openPortal: (storeId: string) =>
      call('billing_create_portal_session', { p_store_id: storeId }).then(() => ({
        requested: true,
        storeId,
      })),
    getCommercialResearchConfig: (authorizationId: string) =>
      call('billing_get_commercial_research_config', {
        p_authorization_id: authorizationId,
      }).then(parseCommercialResearchConfig),
    recordCommercialResearchAttempt: (attempt: CommercialResearchAttempt) =>
      call('billing_record_commercial_research_attempt', {
        p_authorization_id: attempt.authorizationId,
        p_config_version: attempt.configVersion,
        p_config_digest: attempt.configDigest,
        p_artifact_digest: attempt.artifactDigest,
        p_question_version: attempt.questionVersion,
        p_choice: attempt.choice,
        p_reason_code: attempt.reasonCode,
        p_idempotency_key: attempt.idempotencyKey,
      }).then(parseCommercialResearchReceipt),
  }
}

export function isBillingCapabilityEnabled(capability: BillingCapability | null): boolean {
  return capability !== null && capability.source === 'server' && capability.enabled === true
}

/** Route-loader gate: /store-portal/billing stays unreachable while off. */
export function billingRouteEnabled(capability: BillingCapability | null): boolean {
  return isBillingCapabilityEnabled(capability)
}
