// Red-first: asserts the Package 13 flag-off contract. These expectations were
// fixed before src/features/billing existed and must fail against any build
// that leaks a billing surface while photo_tiers_enabled is false.
import { describe, expect, it, vi } from 'vitest'
import {
  BILLING_STAGE_DISABLED_MESSAGE,
  DISABLED_BILLING_CAPABILITY,
  GENERIC_BILLING_ERROR,
  billingRouteEnabled,
  createBillingClient,
  isBillingCapabilityEnabled,
  unavailableBillingClient,
} from './billingClient'
import type { BillingCapability } from './types'

function capability(overrides: Partial<BillingCapability> = {}): BillingCapability {
  return { enabled: true, source: 'server', ...overrides }
}

describe('billing capability gating', () => {
  it('treats only server-served enabled capabilities as on', () => {
    expect(isBillingCapabilityEnabled(capability())).toBe(true)
    expect(isBillingCapabilityEnabled(capability({ enabled: false }))).toBe(false)
    expect(isBillingCapabilityEnabled(capability({ source: 'local' }))).toBe(false)
    expect(isBillingCapabilityEnabled(DISABLED_BILLING_CAPABILITY)).toBe(false)
    expect(isBillingCapabilityEnabled(null)).toBe(false)
  })

  it('keeps every route hidden when the served capability is off or untrusted', () => {
    expect(billingRouteEnabled(capability())).toBe(true)
    expect(billingRouteEnabled(capability({ enabled: false }))).toBe(false)
    expect(billingRouteEnabled(null)).toBe(false)
  })

  it('maps owner actions to exact bounded RPCs', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'billing_get_capability' ? capability() : { requested: true },
      error: null,
    }))
    const client = createBillingClient({ rpc })
    const idempotencyKey = '0b8df3be-6f5e-4a55-9c1d-2f1f7bd2f4aa'

    await client.getCapability()
    await client.startCheckout({
      storeId: 'store-1',
      idempotencyKey,
      tier: 'gallery',
    })
    await client.openPortal('store-1')

    expect(rpc.mock.calls).toEqual([
      ['billing_get_capability', {}],
      [
        'billing_create_checkout_session',
        { p_store_id: 'store-1', p_idempotency_key: idempotencyKey },
      ],
      ['billing_create_portal_session', { p_store_id: 'store-1' }],
    ])
  })

  it('parses one exact inactive research config and records only its bound response', async () => {
    const config = {
      version: 7,
      state: 'approved_inactive',
      digest: 'a'.repeat(64),
      galleryPriceCents: 1200,
      fullGalleryPriceCents: 1900,
      currency: 'USD',
      taxMode: 'Tax calculated at checkout.',
      firstChargeRule: 'First charge occurs after Checkout confirmation.',
      renewalRule: 'Renews monthly until canceled.',
      refundPolicyVersion: 'refund-v1',
      supportPolicyVersion: 'support-v1',
      termsVersion: 'terms-v1',
      privacyVersion: 'privacy-v1',
      fullGalleryLimitsVersion: 'limits-v1',
      fullGalleryLimits: {
        acceptedFileTypes: ['image/jpeg'],
        maxFileBytes: 10_000_000,
        maxWidthPixels: 6000,
        maxHeightPixels: 6000,
        uploadRateRule: 'Up to 20 uploads per hour.',
        quotaOutageRule: 'Uploads pause during provider outages.',
        moderationAbuseRule: 'Every photo remains subject to moderation.',
        reasonRecoveryAppealRule: 'A reason, recovery step, and appeal path are provided.',
        paidServiceRemedy: 'Service failures receive the published remedy.',
      },
    }
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === 'billing_get_commercial_research_config'
          ? config
          : { attemptId: 'attempt-1', configVersion: 7, configDigest: 'a'.repeat(64) },
      error: null,
    }))
    const client = createBillingClient({ rpc })
    await expect(client.getCommercialResearchConfig('authorization-1')).resolves.toEqual(config)
    await client.recordCommercialResearchAttempt({
      authorizationId: 'authorization-1',
      configVersion: 7,
      configDigest: 'a'.repeat(64),
      artifactDigest: 'b'.repeat(64),
      questionVersion: 'questions-v1',
      choice: 'gallery',
      reasonCode: 'more_photos',
      idempotencyKey: 'attempt-key-1',
    })
    expect(rpc.mock.calls).toEqual([
      ['billing_get_commercial_research_config', { p_authorization_id: 'authorization-1' }],
      [
        'billing_record_commercial_research_attempt',
        {
          p_authorization_id: 'authorization-1',
          p_config_version: 7,
          p_config_digest: 'a'.repeat(64),
          p_artifact_digest: 'b'.repeat(64),
          p_question_version: 'questions-v1',
          p_choice: 'gallery',
          p_reason_code: 'more_photos',
          p_idempotency_key: 'attempt-key-1',
        },
      ],
    ])
  })

  it('rejects malformed or non-inactive research payloads at the client boundary', async () => {
    const client = createBillingClient({
      rpc: vi.fn(async () => ({ data: { state: 'active', version: 1 }, error: null })),
    })
    await expect(client.getCommercialResearchConfig('authorization-1')).rejects.toThrow(
      GENERIC_BILLING_ERROR,
    )
  })

  it('rejects failed and empty responses with one generic error', async () => {
    const failing = createBillingClient({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'billing_stage_disabled' } })),
    })
    await expect(failing.openPortal('store-1')).rejects.toThrow(GENERIC_BILLING_ERROR)
    const empty = createBillingClient({
      rpc: vi.fn(async () => ({ data: undefined, error: null })),
    })
    await expect(empty.getCapability()).rejects.toThrow(GENERIC_BILLING_ERROR)
  })

  it('default boundary never reports an enabled stage or performs actions', async () => {
    expect(await unavailableBillingClient.getCapability()).toEqual(DISABLED_BILLING_CAPABILITY)
    await expect(
      unavailableBillingClient.startCheckout({
        storeId: 'store-1',
        idempotencyKey: '0b8df3be-6f5e-4a55-9c1d-2f1f7bd2f4aa',
        tier: 'full_gallery',
      }),
    ).rejects.toThrow(GENERIC_BILLING_ERROR)
    await expect(
      unavailableBillingClient.getCommercialResearchConfig('authorization-1'),
    ).rejects.toThrow(GENERIC_BILLING_ERROR)
    expect(BILLING_STAGE_DISABLED_MESSAGE).toMatch(/not available/)
  })
})
