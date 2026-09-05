import type { BillingProviderEnv } from './billing-provider.ts'

type RecordValue = Record<string, unknown>
type Rpc = (name: string, args: RecordValue) => PromiseLike<{ data: unknown; error: unknown }>

export function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Pin the provider representation used by the staged contract tests. */
async function stripe(
  env: BillingProviderEnv,
  path: string,
  method = 'GET',
  body?: Record<string, string>,
  key?: string,
) {
  if (!env.providerGateAccepted || !env.secretKey) return null
  try {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.secretKey}`,
        'Stripe-Version': '2024-06-20',
        ...(key ? { 'Idempotency-Key': key } : {}),
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(body ? { body: new URLSearchParams(body).toString() } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    const value: unknown = await response.json()
    return record(value) ? value : null
  } catch {
    return null
  }
}

function subscriptionItem(subscription: RecordValue) {
  if (
    !record(subscription.items) ||
    !Array.isArray(subscription.items.data) ||
    subscription.items.data.length !== 1 ||
    subscription.items.has_more !== false
  )
    return null
  const item: unknown = subscription.items.data[0]
  if (
    !record(item) ||
    typeof item.id !== 'string' ||
    !/^si_[A-Za-z0-9]{8,120}$/.test(item.id) ||
    !record(item.price) ||
    typeof item.price.id !== 'string' ||
    typeof item.price.product !== 'string' ||
    item.quantity !== 1
  )
    return null
  return { id: item.id, price: item.price }
}

export async function dispatchSubscriptionChange(
  rpc: Rpc,
  env: BillingProviderEnv,
  changeId: string,
): Promise<boolean> {
  if (!env.providerGateAccepted || !env.secretKey) return false
  const prepared = await rpc('billing_prepare_subscription_change', { p_change_id: changeId })
  if (prepared.error || !record(prepared.data)) return false
  const context = prepared.data
  if (['applied', 'compensated', 'superseded', 'scheduled'].includes(String(context.state)))
    return true
  if (context.state === 'compensation_pending')
    return compensateSubscriptionChange(rpc, env, context)
  if (
    context.state !== 'pending' ||
    typeof context.subscriptionId !== 'string' ||
    !/^sub_[A-Za-z0-9]{8,64}$/.test(context.subscriptionId) ||
    typeof context.customerId !== 'string' ||
    typeof context.priceCents !== 'number' ||
    !Number.isSafeInteger(context.priceCents) ||
    typeof context.currency !== 'string' ||
    !/^[a-z]{3}$/.test(context.currency)
  )
    return false
  const subscription = await stripe(env, `subscriptions/${context.subscriptionId}`)
  if (
    !subscription ||
    subscription.id !== context.subscriptionId ||
    subscription.customer !== context.customerId
  )
    return false
  const item = subscriptionItem(subscription)
  if (!item) return false
  let request = context.request
  if (request === null) {
    request = {
      subscriptionId: context.subscriptionId,
      customerId: context.customerId,
      itemId: item.id,
      sourcePriceId: item.price.id,
      productId: item.price.product,
      targetTier: context.targetTier,
      priceCents: context.priceCents,
      currency: context.currency,
    }
    const bound = await rpc('billing_bind_change_request', {
      p_change_id: changeId,
      p_request: request,
    })
    if (bound.error) return false
  }
  if (
    !record(request) ||
    typeof request.itemId !== 'string' ||
    typeof request.productId !== 'string'
  )
    return false
  // Recheck the generation after provider reads and before the idempotent mutation.
  const fenced = await rpc('billing_prepare_subscription_change', { p_change_id: changeId })
  if (fenced.error || !record(fenced.data) || fenced.data.state !== 'pending') return false
  const params: Record<string, string> = {
    'metadata[paid_change_id]': changeId,
    proration_behavior: context.targetTier === 'full_gallery' ? 'create_prorations' : 'none',
  }
  if (context.targetTier === 'free') params.cancel_at_period_end = 'true'
  else
    Object.assign(params, {
      'items[0][id]': request.itemId,
      'items[0][price_data][currency]': context.currency,
      'items[0][price_data][unit_amount]': String(context.priceCents),
      'items[0][price_data][product]': request.productId,
      'items[0][price_data][recurring][interval]': 'month',
      'items[0][quantity]': '1',
    })
  const changed = await stripe(
    env,
    `subscriptions/${context.subscriptionId}`,
    'POST',
    params,
    `${changeId}-modify`,
  )
  // The response does not grant an entitlement. Only the verified webhook does.
  return changed?.id === context.subscriptionId
}

async function compensateSubscriptionChange(
  rpc: Rpc,
  env: BillingProviderEnv,
  context: RecordValue,
): Promise<boolean> {
  if (
    typeof context.subscriptionId !== 'string' ||
    !/^sub_[A-Za-z0-9]{8,64}$/.test(context.subscriptionId) ||
    typeof context.changeId !== 'string' ||
    !record(context.request) ||
    typeof context.request.sourcePriceId !== 'string'
  )
    return false
  const subscription = await stripe(env, `subscriptions/${context.subscriptionId}`)
  if (
    !subscription ||
    subscription.id !== context.subscriptionId ||
    subscription.customer !== context.customerId
  )
    return false
  const item = subscriptionItem(subscription)
  if (!item || !record(subscription.metadata)) return false
  // A later independently valid event owns the current entitlement. Never undo it.
  if (
    subscription.metadata.paid_change_id === context.changeId &&
    context.currentState === 'active' &&
    context.currentTier === context.sourceTier &&
    item.price.id !== context.request.sourcePriceId
  ) {
    const reverted = await stripe(
      env,
      `subscriptions/${context.subscriptionId}`,
      'POST',
      {
        'items[0][id]': item.id,
        'items[0][price]': context.request.sourcePriceId,
        proration_behavior: 'none',
      },
      `${context.changeId}-restore`,
    )
    if (reverted?.id !== context.subscriptionId) return false
  }
  // Financial finality requires exact line/charge attribution; absence of a latest
  // invoice or an uncertain provider response is never evidence of zero liability.
  return false
}

export async function refundCharge(
  rpc: Rpc,
  env: BillingProviderEnv,
  refundRequestId: string,
): Promise<boolean> {
  if (!env.providerGateAccepted || !env.secretKey) return false
  const prepared = await rpc('billing_prepare_charge_refund', {
    p_refund_request_id: refundRequestId,
  })
  if (prepared.error || !record(prepared.data)) return false
  const context = prepared.data
  if (context.state === 'succeeded') return true
  if (
    context.state !== 'pending' ||
    typeof context.chargeId !== 'string' ||
    !/^ch_[A-Za-z0-9]{8,120}$/.test(context.chargeId) ||
    typeof context.amount !== 'number' ||
    !Number.isSafeInteger(context.amount)
  )
    return false
  const refund =
    typeof context.providerRefundId === 'string'
      ? await stripe(env, `refunds/${context.providerRefundId}`)
      : await stripe(
          env,
          'refunds',
          'POST',
          {
            charge: context.chargeId,
            amount: String(context.amount),
            'metadata[servicing_refund_id]': refundRequestId,
          },
          `${refundRequestId}-refund`,
        )
  if (
    !refund ||
    typeof refund.id !== 'string' ||
    refund.charge !== context.chargeId ||
    refund.amount !== context.amount ||
    !['pending', 'succeeded', 'failed'].includes(String(refund.status))
  )
    return false
  const saved = await rpc('billing_record_charge_refund', {
    p_refund_request_id: refundRequestId,
    p_charge_id: context.chargeId,
    p_refund_id: refund.id,
    p_state: refund.status,
    p_amount: refund.amount,
  })
  return !saved.error && saved.data === 'succeeded'
}
