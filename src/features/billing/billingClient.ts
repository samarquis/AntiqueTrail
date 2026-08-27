import type {
  BillingCapability,
  BillingClient,
  BillingRpcName,
  BillingRpcTransport,
  CheckoutRequest,
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
}

export function createBillingClient(transport: BillingRpcTransport): BillingClient {
  async function call<T>(
    name: BillingRpcName,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<T> {
    const result = await transport.rpc(name, args)
    if (result.error || result.data === null || result.data === undefined)
      throw new Error(GENERIC_BILLING_ERROR)
    return result.data as T
  }

  return {
    getCapability: () => call<BillingCapability>('billing_get_capability'),
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
  }
}

export function isBillingCapabilityEnabled(capability: BillingCapability | null): boolean {
  return capability !== null && capability.source === 'server' && capability.enabled === true
}

/** Route-loader gate: /store-portal/billing stays unreachable while off. */
export function billingRouteEnabled(capability: BillingCapability | null): boolean {
  return isBillingCapabilityEnabled(capability)
}
