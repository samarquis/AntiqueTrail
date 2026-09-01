import { createClient } from 'npm:@supabase/supabase-js@2.112.1'
import { loadBillingProviderEnv, verifyStripeSignature } from '../_shared/billing-provider.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const workerJwt = Deno.env.get('BILLING_WORKER_JWT')
const env = loadBillingProviderEnv()

const HANDLED_KINDS = new Set([
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

Deno.serve(async (request) => {
  // Capability first: the endpoint is inert end to end while staged off.
  if (!url || !workerJwt) return unavailable()
  const workerClient = createClient(url, workerJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const capability = await workerClient.rpc('billing_get_capability')
  const value = capability.data as { enabled?: unknown } | null
  if (capability.error || value?.enabled !== true) return stageDisabled()

  if (request.method !== 'POST' || !env.webhookSecret) return unavailable(400)
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return unavailable(400)
  }

  // Signature and replay window are verified before any payload inspection.
  if (
    !(await verifyStripeSignature(env.webhookSecret, rawBody, request.headers.get('stripe-signature')))
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
  const object = event.data?.object
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
