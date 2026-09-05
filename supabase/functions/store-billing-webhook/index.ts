import { createClient } from 'npm:@supabase/supabase-js@2.112.1'
import {
  loadBillingProviderEnv,
  providerIdHmac,
  reconcileCheckoutRefund,
  subscriptionPeriodEnd,
  verifyStripeSignature,
} from '../_shared/billing-provider.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const workerJwt = Deno.env.get('BILLING_WORKER_JWT')
const env = loadBillingProviderEnv()

const HANDLED_KINDS = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'refund.updated',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

function unavailable(status = 503): Response {
  return new Response('Unavailable', { status })
}

function stageDisabled(): Response {
  return Response.json({ error: 'stage_disabled' }, { status: 503 })
}

function received(result: string): Response {
  return Response.json({ received: true, result }, { headers: { 'Cache-Control': 'no-store' } })
}

function tierForPrice(priceId: unknown): string | null {
  if (typeof priceId !== 'string') return null
  if (priceId && priceId === env.priceGallery) return 'gallery'
  if (priceId && priceId === env.priceFullGallery) return 'full_gallery'
  return null
}

interface SubscriptionObject {
  id?: unknown
  status?: unknown
  customer?: unknown
  current_period_end?: unknown
  metadata?: { store_id?: unknown } | null
  items?: { data?: Array<{ price?: { id?: unknown } }> } | null
}

interface CheckoutObject {
  id?: unknown
  customer?: unknown
  subscription?: unknown
  payment_status?: unknown
  metadata?: { hmac_key_version?: unknown }
}

interface RefundObject {
  id?: unknown
  status?: unknown
  metadata?: {
    checkout_event_id?: unknown
    checkout_provider_session_id?: unknown
    subscription_id?: unknown
    refund_attempt?: unknown
    hmac_key_version?: unknown
  } | null
}

Deno.serve(async (request) => {
  if (!url || !workerJwt) return unavailable()
  const workerClient = createClient(url, workerJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  if (request.method !== 'POST' || !env.webhookSecret) return unavailable(400)
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return unavailable(400)
  }

  // Signature and replay window are verified before any payload inspection.
  if (
    !(await verifyStripeSignature(
      env.webhookSecret,
      rawBody,
      request.headers.get('stripe-signature'),
    ))
  )
    return new Response('Invalid signature', { status: 400 })

  let event: {
    id?: unknown
    type?: unknown
    created?: unknown
    data?: { object?: SubscriptionObject }
  }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return unavailable(400)
  }
  if (
    typeof event.id !== 'string' ||
    !/^evt_[A-Za-z0-9]{8,120}$/.test(event.id) ||
    typeof event.type !== 'string'
  ) {
    return received('ignored')
  }
  if (!HANDLED_KINDS.has(event.type)) {
    // Unknown types acknowledge without any database write.
    return received('ignored')
  }
  const webhookMode = await workerClient.rpc('billing_get_webhook_mode')
  if (webhookMode.error || webhookMode.data === 'off_prelaunch') return stageDisabled()
  if (webhookMode.data !== 'sales_open' && webhookMode.data !== 'servicing_only')
    return unavailable()
  const object = event.data?.object
  if (event.type === 'checkout.session.expired') {
    const expired = object as CheckoutObject | undefined
    if (typeof expired?.id !== 'string') return received('ignored')
    const binding = await providerIdHmac(
      env,
      expired.id,
      Number(expired.metadata?.hmac_key_version),
    )
    if (!binding) return unavailable()
    const result = await workerClient.rpc('billing_record_checkout_expired', {
      p_provider_session_hmac: binding.digest,
      p_hmac_key_version: binding.keyVersion,
    })
    return result.error || result.data === 'unbound' ? unavailable() : received(String(result.data))
  }
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded' ||
    event.type === 'checkout.session.async_payment_failed'
  ) {
    const checkout = object as CheckoutObject | undefined
    if (
      typeof checkout?.id !== 'string' ||
      !/^cs_[A-Za-z0-9_]{8,120}$/.test(checkout.id) ||
      typeof checkout.customer !== 'string' ||
      !/^cus_[A-Za-z0-9]{8,64}$/.test(checkout.customer) ||
      typeof checkout.subscription !== 'string' ||
      !/^sub_[A-Za-z0-9]{8,64}$/.test(checkout.subscription) ||
      typeof checkout.payment_status !== 'string'
    )
      return received('ignored')
    const providerSessionHmac = await providerIdHmac(
      env,
      checkout.id,
      Number(checkout.metadata?.hmac_key_version),
    )
    if (!providerSessionHmac) return unavailable()
    if (event.type === 'checkout.session.async_payment_failed') {
      const failed = await workerClient.rpc('billing_record_checkout_payment_failure', {
        p_event_id: event.id,
        p_provider_session_hmac: providerSessionHmac.digest,
        p_hmac_key_version: providerSessionHmac.keyVersion,
      })
      if (failed.error || failed.data === 'unbound') return unavailable()
      return received(String(failed.data))
    }
    if (checkout.payment_status !== 'paid') return received('payment_pending')
    const periodEnd = await subscriptionPeriodEnd(env, checkout.subscription)
    if (!periodEnd) return unavailable()
    const applied = await workerClient.rpc('billing_record_checkout_event', {
      p_event_id: event.id,
      p_event_time:
        typeof event.created === 'number' && Number.isFinite(event.created)
          ? new Date(event.created * 1000).toISOString()
          : new Date().toISOString(),
      p_provider_session_hmac: providerSessionHmac.digest,
      p_hmac_key_version: providerSessionHmac.keyVersion,
      p_customer_id: checkout.customer,
      p_subscription_id: checkout.subscription,
      p_period_end: periodEnd,
    })
    if (applied.error || applied.data === 'unbound') return unavailable()
    if (applied.data === 'refund_pending') {
      const result = await reconcileCheckoutRefund(
        (name, args) => workerClient.rpc(name, args),
        env,
        checkout.id,
        providerSessionHmac,
      )
      return result === null ? unavailable() : received(result)
    }
    return received(String(applied.data))
  }
  if (event.type === 'refund.updated') {
    const refund = object as RefundObject | undefined
    const metadata = refund?.metadata
    if (
      typeof refund?.id !== 'string' ||
      !/^re_[A-Za-z0-9]{8,120}$/.test(refund.id) ||
      !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(
        String(refund.status),
      ) ||
      typeof metadata?.checkout_event_id !== 'string' ||
      typeof metadata.checkout_provider_session_id !== 'string' ||
      typeof metadata.subscription_id !== 'string'
    )
      return received('ignored')
    const providerSessionHmac = await providerIdHmac(
      env,
      metadata.checkout_provider_session_id,
      Number(metadata.hmac_key_version),
    )
    if (!providerSessionHmac) return unavailable()
    const recorded = await workerClient.rpc('billing_record_checkout_refund_state', {
      p_event_id: metadata.checkout_event_id,
      p_provider_session_hmac: providerSessionHmac.digest,
      p_hmac_key_version: providerSessionHmac.keyVersion,
      p_subscription_id: metadata.subscription_id,
      p_refund_id: refund.id,
      p_attempt: Number(metadata.refund_attempt),
      p_provider_state:
        refund.status === 'succeeded'
          ? 'succeeded'
          : refund.status === 'failed' || refund.status === 'canceled'
            ? 'failed'
            : 'pending',
    })
    if (recorded.error) return unavailable()
    if (recorded.data === 'refund_failed') {
      const result = await reconcileCheckoutRefund(
        (name, args) => workerClient.rpc(name, args),
        env,
        metadata.checkout_provider_session_id,
        providerSessionHmac,
      )
      return result === null ? unavailable() : received(result)
    }
    return received(String(recorded.data))
  }
  if (
    typeof object?.id !== 'string' ||
    !/^sub_[A-Za-z0-9]{8,64}$/.test(object.id) ||
    typeof object.customer !== 'string' ||
    !/^cus_[A-Za-z0-9]{8,64}$/.test(object.customer)
  ) {
    return received('ignored')
  }

  const storeId =
    typeof object.metadata?.store_id === 'string' &&
    /^[0-9a-f-]{36}$/iu.test(object.metadata.store_id)
      ? object.metadata.store_id
      : null
  const periodEnd =
    typeof object.current_period_end === 'number' && Number.isFinite(object.current_period_end)
      ? new Date(object.current_period_end * 1000).toISOString()
      : null
  const tier = tierForPrice(object.items?.data?.[0]?.price?.id)

  const applied = await workerClient.rpc('billing_record_subscription_event', {
    p_event_id: event.id,
    p_event_kind: event.type,
    // Stripe's event clock anchors out-of-order protection, not receipt time.
    p_event_time:
      typeof event.created === 'number' && Number.isFinite(event.created)
        ? new Date(event.created * 1000).toISOString()
        : new Date().toISOString(),
    p_store_id: storeId,
    p_customer_id: object.customer,
    p_subscription_id: object.id,
    p_status: typeof object.status === 'string' ? object.status : null,
    p_period_end: periodEnd,
    p_tier: tier,
  })
  if (applied.error) {
    const message = typeof applied.error.message === 'string' ? applied.error.message : ''
    if (message.includes('billing_stage_disabled')) return stageDisabled()
    if (message.includes('billing_webhook_invalid')) return received('ignored')
    return unavailable()
  }
  return received(String(applied.data))
})
