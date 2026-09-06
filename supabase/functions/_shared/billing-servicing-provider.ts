import type { BillingProviderEnv } from './billing-provider.ts'
// @ts-expect-error Deno Edge imports require an explicit TypeScript extension.
import { scheduleChangeForm } from './billing-schedule.ts'

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

export async function cancellationPortal(
  env: BillingProviderEnv,
  context: unknown,
  configurationId: string | undefined,
): Promise<{ url: string } | null> {
  if (
    !record(context) ||
    typeof context.subscriptionId !== 'string' ||
    !/^sub_[A-Za-z0-9]{8,64}$/.test(context.subscriptionId) ||
    typeof context.customerId !== 'string' ||
    !env.appOrigin
  )
    return null
  const subscription = await stripe(env, `subscriptions/${context.subscriptionId}`)
  if (
    !subscription ||
    subscription.id !== context.subscriptionId ||
    subscription.customer !== context.customerId
  )
    return null
  const returnUrl = `${new URL(env.appOrigin).origin}/store-portal/billing`
  // Stripe's portal cannot cancel subscriptions with an attached update.
  // Opening billing never releases or rewrites that schedule.
  if (typeof subscription.schedule === 'string') return { url: returnUrl }
  if (
    subscription.schedule !== null ||
    !configurationId ||
    !/^bpc_[A-Za-z0-9]{8,120}$/.test(configurationId)
  )
    return null
  const config = await stripe(env, `billing_portal/configurations/${configurationId}`)
  if (
    !config ||
    !record(config.features) ||
    !record(config.features.subscription_cancel) ||
    config.features.subscription_cancel.enabled !== true ||
    config.features.subscription_cancel.mode !== 'at_period_end' ||
    !record(config.features.subscription_update) ||
    config.features.subscription_update.enabled !== false
  )
    return null
  const session = await stripe(
    env,
    'billing_portal/sessions',
    'POST',
    {
      configuration: configurationId,
      customer: context.customerId,
      return_url: returnUrl,
      'flow_data[type]': 'subscription_cancel',
      'flow_data[subscription_cancel][subscription]': context.subscriptionId,
      'flow_data[after_completion][type]': 'redirect',
      'flow_data[after_completion][redirect][return_url]': returnUrl,
    },
    crypto.randomUUID(),
  )
  if (!session || typeof session.url !== 'string') return null
  const parsed = new URL(session.url)
  return parsed.protocol === 'https:' &&
    parsed.hostname === 'billing.stripe.com' &&
    !parsed.username &&
    !parsed.password
    ? { url: session.url }
    : null
}

export async function dispatchSubscriptionChange(
  rpc: Rpc,
  env: BillingProviderEnv,
  changeId: string,
): Promise<boolean> {
  if (!env.providerGateAccepted || !env.secretKey) return false
  const prepared = await rpc('billing_prepare_subscription_change', { p_change_id: changeId })
  if (prepared.error || !record(prepared.data)) return false
  const context = { ...prepared.data }
  if (['applied', 'compensated', 'superseded', 'scheduled'].includes(String(context.state)))
    return true
  if (context.state === 'compensation_pending')
    return compensateSubscriptionChange(rpc, env, context)
  if (
    context.state === 'pending' &&
    record(context.mutation) &&
    typeof context.mutation.path === 'string' &&
    record(context.mutation.parameters)
  ) {
    // Stripe can prune idempotency keys after 24 hours. An old unresolved write
    // must be reconciled from provider events, never blindly dispatched again.
    if (
      typeof context.dispatchedAt !== 'string' ||
      Date.now() - Date.parse(context.dispatchedAt) >= 23 * 60 * 60 * 1000 ||
      !Number.isFinite(Date.parse(context.dispatchedAt))
    )
      return false
    const frozen = stringFields(context.mutation.parameters)
    if (!frozen) return false
    const result = await stripe(env, context.mutation.path, 'POST', frozen, `${changeId}-modify`)
    return typeof result?.id === 'string' && context.mutation.path.endsWith(`/${result.id}`)
  }
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
      periodEnd: subscription.current_period_end,
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
    typeof request.productId !== 'string' ||
    typeof request.periodEnd !== 'number' ||
    !Number.isSafeInteger(request.periodEnd)
  )
    return false
  // Recheck the generation after provider reads and before the idempotent mutation.
  const fenced = await rpc('billing_prepare_subscription_change', { p_change_id: changeId })
  if (fenced.error || !record(fenced.data) || fenced.data.state !== 'pending') return false
  // Each change owns its price, allowing a verified event and any later
  // incremental-charge compensation to identify the exact modification.
  let targetPrice: string | undefined
  if (context.targetTier !== 'free') {
    const price = await stripe(
      env,
      'prices',
      'POST',
      {
        product: request.productId,
        currency: context.currency,
        unit_amount: String(context.priceCents),
        'recurring[interval]': 'month',
        'metadata[paid_change_id]': changeId,
      },
      `${changeId}-price`,
    )
    if (
      !price ||
      typeof price.id !== 'string' ||
      !/^price_[A-Za-z0-9]{8,120}$/.test(price.id) ||
      price.product !== request.productId ||
      price.unit_amount !== context.priceCents ||
      price.currency !== context.currency
    )
      return false
    targetPrice = price.id
  }
  if (subscription.schedule != null || context.targetTier === 'gallery') {
    let schedule: RecordValue | null
    if (
      typeof subscription.schedule === 'string' &&
      /^sub_sched_[A-Za-z0-9]{8,120}$/.test(subscription.schedule)
    ) {
      schedule = await stripe(env, `subscription_schedules/${subscription.schedule}`)
    } else if (subscription.schedule === null) {
      const fence = await rpc('billing_prepare_subscription_change', { p_change_id: changeId })
      if (fence.error || !record(fence.data) || fence.data.state !== 'pending') return false
      schedule = await stripe(
        env,
        'subscription_schedules',
        'POST',
        { from_subscription: context.subscriptionId },
        `${changeId}-schedule`,
      )
    } else return false
    if (
      !schedule ||
      typeof schedule.id !== 'string' ||
      !/^sub_sched_[A-Za-z0-9]{8,120}$/.test(schedule.id) ||
      schedule.subscription !== context.subscriptionId ||
      schedule.customer !== context.customerId
    )
      return false
    const params = scheduleChangeForm(schedule, {
      kind:
        context.targetTier === 'full_gallery'
          ? 'upgrade'
          : context.targetTier === 'free'
            ? 'cancel'
            : 'downgrade',
      priceId: targetPrice,
      periodEnd: request.periodEnd,
      changeId,
    })
    if (!params) return false
    const binding = await rpc('billing_bind_provider_mutation', {
      p_change_id: changeId,
      p_path: `subscription_schedules/${schedule.id}`,
      p_parameters: params,
      p_price_id: targetPrice ?? null,
    })
    if (
      binding.error ||
      !record(binding.data) ||
      typeof binding.data.path !== 'string' ||
      !record(binding.data.parameters)
    )
      return false
    const frozen = stringFields(binding.data.parameters)
    if (!frozen) return false
    const fence = await rpc('billing_prepare_subscription_change', { p_change_id: changeId })
    if (fence.error || !record(fence.data) || fence.data.state !== 'pending') return false
    const changed = await stripe(env, binding.data.path, 'POST', frozen, `${changeId}-modify`)
    return changed?.id === schedule.id && changed.subscription === context.subscriptionId
  }
  const params: Record<string, string> = {
    'metadata[paid_change_id]': changeId,
    proration_behavior: context.targetTier === 'full_gallery' ? 'create_prorations' : 'none',
  }
  if (context.targetTier === 'free') params.cancel_at_period_end = 'true'
  else
    Object.assign(params, {
      'items[0][id]': request.itemId,
      'items[0][price]': targetPrice!,
      'items[0][quantity]': '1',
    })
  const binding = await rpc('billing_bind_provider_mutation', {
    p_change_id: changeId,
    p_path: `subscriptions/${context.subscriptionId}`,
    p_parameters: params,
    p_price_id: targetPrice ?? null,
  })
  if (
    binding.error ||
    !record(binding.data) ||
    typeof binding.data.path !== 'string' ||
    !record(binding.data.parameters)
  )
    return false
  const frozen = stringFields(binding.data.parameters)
  if (!frozen) return false
  const finalFence = await rpc('billing_prepare_subscription_change', { p_change_id: changeId })
  if (finalFence.error || !record(finalFence.data) || finalFence.data.state !== 'pending')
    return false
  const changed = await stripe(
    env,
    `subscriptions/${context.subscriptionId}`,
    'POST',
    frozen,
    `${changeId}-modify`,
  )
  // The response does not grant an entitlement. Only the verified webhook does.
  return changed?.id === context.subscriptionId
}

function stringFields(value: RecordValue): Record<string, string> | null {
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') return null
    result[key] = entry
  }
  return result
}

/** Called only after the gateway verifies the signature and the servicing gate. */
export async function recordServicingEvent(
  rpc: Rpc,
  event: unknown,
  env?: BillingProviderEnv,
): Promise<string | null | undefined> {
  if (
    !record(event) ||
    typeof event.type !== 'string' ||
    !record(event.data) ||
    !record(event.data.object)
  )
    return undefined
  const object = event.data.object
  const metadata = record(object.metadata) ? object.metadata : {}
  if (event.type === 'invoice.payment_succeeded') {
    if (
      !env ||
      typeof object.charge !== 'string' ||
      !/^ch_[A-Za-z0-9]{8,120}$/.test(object.charge) ||
      typeof object.subscription !== 'string' ||
      typeof object.customer !== 'string'
    )
      return undefined
    const charge = await stripe(env, `charges/${object.charge}`)
    if (
      !charge ||
      charge.id !== object.charge ||
      charge.invoice !== object.id ||
      charge.customer !== object.customer ||
      charge.paid !== true ||
      charge.captured !== true ||
      typeof charge.created !== 'number' ||
      !Number.isSafeInteger(charge.created) ||
      typeof charge.amount_captured !== 'number' ||
      !Number.isSafeInteger(charge.amount_captured) ||
      charge.amount_captured <= 0 ||
      typeof charge.currency !== 'string'
    )
      return null
    const result = await rpc('billing_record_charge', {
      p_store_id: null,
      p_subscription_id: object.subscription,
      p_customer_id: object.customer,
      p_charge_id: charge.id,
      p_charged_at: new Date(charge.created * 1000).toISOString(),
      p_amount: charge.amount_captured,
      p_currency: charge.currency,
    })
    return result.error || result.data === 'unbound' ? null : String(result.data)
  }
  if (event.type === 'refund.updated' && typeof metadata.servicing_refund_id === 'string') {
    const result = await rpc('billing_record_charge_refund', {
      p_refund_request_id: metadata.servicing_refund_id,
      p_charge_id: object.charge,
      p_refund_id: object.id,
      p_amount: object.amount,
      p_state:
        object.status === 'succeeded'
          ? 'succeeded'
          : ['failed', 'canceled'].includes(String(object.status))
            ? 'failed'
            : 'pending',
    })
    return result.error ? null : String(result.data)
  }
  const changeId = metadata.paid_change_id
  if (
    typeof changeId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(changeId)
  )
    return undefined
  if (event.type.startsWith('customer.subscription.')) {
    if (
      typeof event.created !== 'number' ||
      !Number.isSafeInteger(event.created) ||
      typeof event.id !== 'string'
    )
      return null
    const item = subscriptionItem(object)
    if (!item && object.status !== 'canceled') return null
    const end = object.status === 'canceled' ? event.created : object.current_period_end
    if (typeof end !== 'number' || !Number.isSafeInteger(end)) return null
    const result = await rpc('billing_record_change_event', {
      p_change_id: changeId,
      p_event_id: event.id,
      p_event_time: new Date(event.created * 1000).toISOString(),
      p_subscription_id: object.id,
      p_customer_id: object.customer,
      p_price_id: item?.price.id ?? null,
      p_status: object.status,
      p_cancel_at_period_end: object.cancel_at_period_end === true,
      p_period_end: new Date(end * 1000).toISOString(),
    })
    if (result.error) return null
    return result.data === 'change_complete' ||
      (['past_due', 'unpaid', 'canceled'].includes(String(object.status)) &&
        ['awaiting_target', 'awaiting_boundary', 'compensation_pending'].includes(
          String(result.data),
        ))
      ? undefined
      : String(result.data)
  }
  if (event.type === 'subscription_schedule.updated') {
    if (!Array.isArray(object.phases) || !record(object.current_phase)) return null
    const currentEnd = object.current_phase.end_date
    if (typeof currentEnd !== 'number' || !Number.isSafeInteger(currentEnd)) return null
    const future: unknown = object.phases.find(
      (phase: unknown) => record(phase) && phase.start_date === currentEnd,
    )
    let priceId: string | null = null
    if (
      record(future) &&
      Array.isArray(future.items) &&
      future.items.length === 1 &&
      record(future.items[0]) &&
      typeof future.items[0].price === 'string' &&
      future.items[0].quantity === 1
    )
      priceId = future.items[0].price
    else if (object.end_behavior !== 'cancel') return undefined
    const result = await rpc('billing_record_schedule_event', {
      p_change_id: changeId,
      p_subscription_id: object.subscription,
      p_customer_id: object.customer,
      p_schedule_id: object.id,
      p_price_id: priceId,
      p_boundary: new Date(currentEnd * 1000).toISOString(),
    })
    return result.error ? null : String(result.data)
  }
  return undefined
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
    typeof context.request.sourcePriceId !== 'string' ||
    typeof context.targetPriceId !== 'string'
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
  if (!(await compensateProrationItems(rpc, env, context))) return false
  // A later independently valid event owns the current entitlement. Never undo it.
  if (
    subscription.metadata.paid_change_id === context.changeId &&
    subscription.status !== 'canceled' &&
    item.price.id === context.targetPriceId
  ) {
    let path = `subscriptions/${context.subscriptionId}`
    let params: Record<string, string> = {
      'items[0][id]': item.id,
      'items[0][price]': context.request.sourcePriceId,
      proration_behavior: 'none',
    }
    if (subscription.schedule !== null) {
      if (
        typeof subscription.schedule !== 'string' ||
        !/^sub_sched_[A-Za-z0-9]{8,120}$/.test(subscription.schedule)
      )
        return false
      const schedule = await stripe(env, `subscription_schedules/${subscription.schedule}`)
      if (
        !schedule ||
        schedule.subscription !== context.subscriptionId ||
        schedule.customer !== context.customerId ||
        typeof subscription.current_period_end !== 'number'
      )
        return false
      const form = scheduleChangeForm(schedule, {
        kind: 'restore',
        priceId: context.request.sourcePriceId,
        periodEnd: subscription.current_period_end,
        changeId: context.changeId,
      })
      if (!form) return false
      path = `subscription_schedules/${subscription.schedule}`
      params = form
    }
    const reverted = await stripe(env, path, 'POST', params, `${context.changeId}-restore`)
    if (!reverted || typeof reverted.id !== 'string' || !path.endsWith(`/${reverted.id}`))
      return false
  }
  const observed = await stripe(env, `subscriptions/${context.subscriptionId}`)
  if (!observed || observed.customer !== context.customerId || !record(observed.metadata))
    return false
  const observedItem = subscriptionItem(observed)
  if (
    observed.status !== 'canceled' &&
    (typeof context.currentPriceId !== 'string' ||
      observedItem?.price.id !== context.currentPriceId)
  )
    return false
  if (
    !observedItem ||
    (observed.metadata.paid_change_id === context.changeId &&
      observed.status !== 'canceled' &&
      observedItem.price.id !== context.request.sourcePriceId)
  )
    return false
  const tail = await stripeList(
    env,
    `invoiceitems?customer=${encodeURIComponent(String(context.customerId))}`,
  )
  const boundItems = context.compensationItems
  if (
    !tail ||
    !Array.isArray(boundItems) ||
    tail.some(
      (entry) =>
        entry.subscription === context.subscriptionId &&
        record(entry.price) &&
        entry.price.id === context.targetPriceId &&
        !boundItems.includes(entry.id),
    )
  )
    return false
  const saved = await rpc('billing_record_change_compensation', {
    p_change_id: context.changeId,
    p_subscription_id: context.subscriptionId,
    p_observation: {
      subscriptionId: context.subscriptionId,
      entitlementReconciled: true,
      incrementalChargeReconciled: true,
      currentSubscriptionVersion: context.currentSubscriptionVersion,
      observedAt: new Date().toISOString(),
    },
  })
  return !saved.error && saved.data === 'compensated'
}

async function stripeList(env: BillingProviderEnv, path: string): Promise<RecordValue[] | null> {
  const result: RecordValue[] = []
  let cursor = ''
  // Bounded execution; an incomplete inventory remains a pending obligation.
  for (let page = 0; page < 100; page++) {
    const list = await stripe(
      env,
      `${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`,
    )
    if (
      !list ||
      !Array.isArray(list.data) ||
      typeof list.has_more !== 'boolean' ||
      !list.data.every(record)
    )
      return null
    for (const entry of list.data) if (record(entry)) result.push(entry)
    if (!list.has_more) return result
    const last: unknown = list.data.at(-1)
    if (!record(last) || typeof last.id !== 'string' || last.id === cursor) return null
    cursor = last.id
  }
  return null
}

async function compensateProrationItems(
  rpc: Rpc,
  env: BillingProviderEnv,
  context: RecordValue,
): Promise<boolean> {
  if (typeof context.customerId !== 'string' || !record(context.request)) return false
  const request = context.request
  const inventory = await stripeList(
    env,
    `invoiceitems?customer=${encodeURIComponent(context.customerId)}`,
  )
  if (!inventory) return false
  let ids = context.compensationItems
  if (ids === null) {
    const debit = inventory.filter(
      (entry) =>
        entry.subscription === context.subscriptionId &&
        entry.proration === true &&
        record(entry.price) &&
        entry.price.id === context.targetPriceId,
    )
    if (debit.length !== 1 || !record(debit[0].period)) return false
    const period = debit[0].period
    const credit = inventory.filter(
      (entry) =>
        entry.subscription === context.subscriptionId &&
        entry.proration === true &&
        record(entry.price) &&
        entry.price.id === request.sourcePriceId &&
        record(entry.period) &&
        entry.period.start === period.start &&
        entry.period.end === period.end &&
        typeof entry.amount === 'number' &&
        entry.amount <= 0,
    )
    if (credit.length !== 1 || typeof debit[0].id !== 'string' || typeof credit[0].id !== 'string')
      return false
    const bound = await rpc('billing_bind_compensation_items', {
      p_change_id: context.changeId,
      p_items: [debit[0].id, credit[0].id],
    })
    if (bound.error) return false
    ids = bound.data
    context.compensationItems = ids
  }
  if (!Array.isArray(ids) || ids.length !== 2 || !ids.every((id) => typeof id === 'string'))
    return false
  if (
    inventory.some(
      (entry) =>
        entry.subscription === context.subscriptionId &&
        record(entry.price) &&
        entry.price.id === context.targetPriceId &&
        (typeof entry.id !== 'string' || !ids.includes(entry.id)),
    )
  )
    return false
  const remaining = inventory.filter(
    (entry) => typeof entry.id === 'string' && ids.includes(entry.id),
  )
  const invoices = new Set<string>()
  for (const entry of remaining) {
    if (
      entry.customer !== context.customerId ||
      entry.subscription !== context.subscriptionId ||
      typeof entry.id !== 'string'
    )
      return false
    if (entry.invoice === null) {
      const deleted = await stripe(env, `invoiceitems/${entry.id}`, 'DELETE')
      if (deleted?.id !== entry.id || deleted.deleted !== true) return false
    } else if (typeof entry.invoice === 'string' && /^in_[A-Za-z0-9]{8,120}$/.test(entry.invoice))
      invoices.add(entry.invoice)
    else return false
  }
  for (const invoiceId of invoices) {
    const invoice = await stripe(env, `invoices/${invoiceId}`)
    if (
      !invoice ||
      invoice.customer !== context.customerId ||
      invoice.subscription !== context.subscriptionId
    )
      return false
    if (invoice.status === 'draft') {
      for (const entry of remaining.filter((entry) => entry.invoice === invoiceId)) {
        const deleted = await stripe(env, `invoiceitems/${entry.id}`, 'DELETE')
        if (!deleted || deleted.id !== entry.id || deleted.deleted !== true) return false
      }
      continue
    }
    if (invoice.status !== 'paid' && invoice.status !== 'open') return false
    const lines = await stripeList(env, `invoices/${invoiceId}/lines`)
    if (!lines) return false
    const affected = lines.filter(
      (line) => typeof line.invoice_item === 'string' && ids.includes(line.invoice_item),
    )
    if (affected.length !== 2) return false
    let amount = 0
    for (const line of affected) {
      if (
        typeof line.amount_excluding_tax !== 'number' ||
        !Number.isSafeInteger(line.amount_excluding_tax) ||
        !Array.isArray(line.tax_amounts)
      )
        return false
      amount += line.amount_excluding_tax
      for (const tax of line.tax_amounts) {
        if (!record(tax) || typeof tax.amount !== 'number' || !Number.isSafeInteger(tax.amount))
          return false
        amount += tax.amount
      }
    }
    if (!Number.isSafeInteger(amount) || amount < 0) return false
    if (amount === 0) continue
    const creditNotes = await stripeList(env, `credit_notes?invoice=${invoiceId}`)
    if (!creditNotes) return false
    const priorCredits = creditNotes.filter(
      (note) => record(note.metadata) && note.metadata.paid_change_id === context.changeId,
    )
    if (priorCredits.length > 1) return false
    if (invoice.status === 'open' || priorCredits.length === 1) {
      if (
        typeof invoice.amount_remaining !== 'number' ||
        !Number.isSafeInteger(invoice.amount_remaining)
      )
        return false
      const note =
        priorCredits[0] ??
        (await stripe(
          env,
          'credit_notes',
          'POST',
          {
            invoice: invoiceId,
            amount: String(amount),
            refund_amount: String(Math.max(0, amount - invoice.amount_remaining)),
            reason: 'order_change',
            'metadata[paid_change_id]': String(context.changeId),
          },
          `${context.changeId}-${invoiceId}-credit`,
        ))
      if (
        !note ||
        note.invoice !== invoiceId ||
        note.customer !== context.customerId ||
        note.status !== 'issued' ||
        note.amount !== amount ||
        typeof note.pre_payment_amount !== 'number' ||
        typeof note.post_payment_amount !== 'number' ||
        note.pre_payment_amount + note.post_payment_amount !== amount
      )
        return false
      if (note.post_payment_amount > 0) {
        if (typeof note.refund !== 'string' || !/^re_[A-Za-z0-9]{8,120}$/.test(note.refund))
          return false
        const refunded = await stripe(env, `refunds/${note.refund}`)
        if (
          !refunded ||
          refunded.charge !== invoice.charge ||
          refunded.amount !== note.post_payment_amount ||
          refunded.status !== 'succeeded'
        )
          return false
      }
      continue
    }
    if (typeof invoice.charge !== 'string' || !/^ch_[A-Za-z0-9]{8,120}$/.test(invoice.charge))
      return false
    const refunds = await stripeList(env, `refunds?charge=${encodeURIComponent(invoice.charge)}`)
    if (!refunds) return false
    const attempts = refunds.filter(
      (refund) => record(refund.metadata) && refund.metadata.paid_change_id === context.changeId,
    )
    const prior = attempts.filter(
      (refund) => refund.status !== 'failed' && refund.status !== 'canceled',
    )
    if (prior.length > 1) return false
    const refund =
      prior[0] ??
      (await stripe(
        env,
        'refunds',
        'POST',
        {
          charge: invoice.charge,
          amount: String(amount),
          'metadata[paid_change_id]': String(context.changeId),
        },
        `${context.changeId}-${invoiceId}-compensate-${attempts.length + 1}`,
      ))
    if (
      !refund ||
      refund.charge !== invoice.charge ||
      refund.amount !== amount ||
      refund.status !== 'succeeded'
    )
      return false
  }
  return true
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
    !Number.isSafeInteger(context.amount) ||
    context.amount <= 0 ||
    typeof context.attempt !== 'number' ||
    !Number.isSafeInteger(context.attempt) ||
    context.attempt <= 0
  )
    return false
  let refund: RecordValue | null
  if (typeof context.providerRefundId === 'string') {
    if (!/^re_[A-Za-z0-9]{8,120}$/.test(context.providerRefundId)) return false
    refund = await stripe(env, `refunds/${context.providerRefundId}`)
  } else {
    const refunds = await stripeList(env, `refunds?charge=${encodeURIComponent(context.chargeId)}`)
    if (!refunds) return false
    const existing = refunds.filter(
      (entry) =>
        record(entry.metadata) &&
        entry.metadata.servicing_refund_id === refundRequestId &&
        entry.status !== 'failed' &&
        entry.status !== 'canceled',
    )
    if (existing.length > 1) return false
    refund =
      existing[0] ??
      (await stripe(
        env,
        'refunds',
        'POST',
        {
          charge: context.chargeId,
          amount: String(context.amount),
          'metadata[servicing_refund_id]': refundRequestId,
          'metadata[servicing_refund_attempt]': String(context.attempt),
        },
        `${refundRequestId}-${context.attempt}-refund`,
      ))
  }
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
