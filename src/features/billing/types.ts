export interface BillingCapability {
  enabled: boolean
  source: string
}

export interface CheckoutRequest {
  storeId: string
  idempotencyKey: string
  tier: 'gallery' | 'full_gallery'
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

export interface BillingClient {
  getCapability(): Promise<BillingCapability>
  startCheckout(request: CheckoutRequest): Promise<{ requested: boolean; storeId: string }>
  openPortal(storeId: string): Promise<{ requested: boolean; storeId: string }>
}
