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
      tier: 'featured',
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
        tier: 'unlimited',
      }),
    ).rejects.toThrow(GENERIC_BILLING_ERROR)
    expect(BILLING_STAGE_DISABLED_MESSAGE).toMatch(/not available/)
  })
})
