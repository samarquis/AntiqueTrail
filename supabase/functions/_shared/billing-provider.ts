export interface BillingProviderEnv {
  appOrigin?: string
  secretKey?: string
  webhookSecret?: string
  priceGallery?: string
  priceFullGallery?: string
  providerIdHmacSecret?: string
  providerIdHmacKeyVersion?: number
  providerIdHmacKeys?: Record<string, string>
  providerGateAccepted: boolean
  referenceKeys?: Record<string, string>
  referenceKeyVersion?: string
}

export function loadBillingProviderEnv(): BillingProviderEnv {
  let keys: Record<string, string> = {}
  try {
    keys = JSON.parse(Deno.env.get('BILLING_PROVIDER_ID_HMAC_KEYS') ?? '{}')
  } catch {
    /* Missing keys fail closed below. */
  }
  return {
    referenceKeys: JSON.parse(Deno.env.get('BILLING_CHECKOUT_REFERENCE_KEYS') ?? '{}'),
    referenceKeyVersion: Deno.env.get('BILLING_CHECKOUT_REFERENCE_KEY_VERSION'),
    providerIdHmacKeys: keys,
    appOrigin: Deno.env.get('APP_ORIGIN'),
    secretKey: Deno.env.get('STRIPE_SECRET_KEY'),
    webhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    priceGallery: Deno.env.get('STRIPE_PRICE_GALLERY'),
    priceFullGallery: Deno.env.get('STRIPE_PRICE_FULL_GALLERY'),
    providerIdHmacSecret: Deno.env.get('BILLING_PROVIDER_ID_HMAC_SECRET'),
    providerIdHmacKeyVersion: Number(Deno.env.get('BILLING_PROVIDER_ID_HMAC_KEY_VERSION') ?? '0'),
    providerGateAccepted: Deno.env.get('BILLING_PROVIDER_GATE_ACCEPTED') === 'true',
  }
}

export async function providerIdHmac(
  env: BillingProviderEnv,
  providerSessionId: string,
  version = env.providerIdHmacKeyVersion,
): Promise<{ digest: string; keyVersion: number } | null> {
  const keyVersion = version
  const secret =
    keyVersion === env.providerIdHmacKeyVersion
      ? env.providerIdHmacSecret
      : env.providerIdHmacKeys?.[String(keyVersion)]
  if (
    typeof secret !== 'string' ||
    !secret ||
    typeof keyVersion !== 'number' ||
    !Number.isSafeInteger(keyVersion) ||
    keyVersion < 1 ||
    !/^cs_[A-Za-z0-9_]{8,120}$/.test(providerSessionId)
  )
    return null
  return {
    digest: await hmacHex(secret, `billing-provider-session:v${keyVersion}:${providerSessionId}`),
    keyVersion,
  }
}

export async function stripeCancelAndRefundSubscription(
  env: BillingProviderEnv,
  subscriptionId: string,
  eventId: string,
  providerSessionId: string,
  attempt = 1,
  hmacKeyVersion = env.providerIdHmacKeyVersion,
): Promise<
  { ok: true; refundId: string; status: 'pending' | 'succeeded' | 'failed' } | { ok: false }
> {
  if (
    !env.secretKey ||
    !env.providerGateAccepted ||
    !/^sub_[A-Za-z0-9]{8,64}$/.test(subscriptionId) ||
    !/^evt_[A-Za-z0-9]{8,120}$/.test(eventId) ||
    !/^cs_[A-Za-z0-9_]{8,120}$/.test(providerSessionId)
  )
    return { ok: false }
  const headers = { Authorization: `Bearer ${env.secretKey}` }
  let subscriptionResponse: Response
  try {
    subscriptionResponse = await fetch(
      `https://api.stripe.com/v1/subscriptions/${subscriptionId}?expand[]=latest_invoice.payment_intent`,
      { headers, redirect: 'error', signal: AbortSignal.timeout(15_000) },
    )
  } catch {
    return { ok: false }
  }
  if (!subscriptionResponse.ok) return { ok: false }
  const subscription = (await subscriptionResponse.json().catch(() => null)) as {
    status?: unknown
    latest_invoice?: { payment_intent?: string | { id?: unknown } } | null
  } | null
  const paymentIntent =
    typeof subscription?.latest_invoice?.payment_intent === 'string'
      ? subscription.latest_invoice.payment_intent
      : subscription?.latest_invoice?.payment_intent?.id
  if (typeof paymentIntent !== 'string' || !/^pi_[A-Za-z0-9]{8,120}$/.test(paymentIntent))
    return { ok: false }
  if (subscription?.status !== 'canceled') {
    let cancellation: Response
    try {
      cancellation = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: { ...headers, 'Idempotency-Key': `${eventId}-cancel` },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      return { ok: false }
    }
    if (!cancellation.ok) return { ok: false }
  }
  let refundResponse: Response
  try {
    refundResponse = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `${eventId}-refund-${attempt}`,
      },
      body: new URLSearchParams({
        payment_intent: paymentIntent,
        'metadata[checkout_event_id]': eventId,
        'metadata[checkout_provider_session_id]': providerSessionId,
        'metadata[subscription_id]': subscriptionId,
        'metadata[refund_attempt]': String(attempt),
        'metadata[hmac_key_version]': String(hmacKeyVersion),
      }).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { ok: false }
  }
  if (!refundResponse.ok) return { ok: false }
  const refund = (await refundResponse.json().catch(() => null)) as {
    id?: unknown
    status?: unknown
  } | null
  if (
    typeof refund?.id !== 'string' ||
    !/^re_[A-Za-z0-9]{8,120}$/.test(refund.id) ||
    !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(
      String(refund.status),
    )
  )
    return { ok: false }
  return {
    ok: true,
    refundId: refund.id,
    status:
      refund.status === 'succeeded'
        ? 'succeeded'
        : refund.status === 'failed' || refund.status === 'canceled'
          ? 'failed'
          : 'pending',
  }
}

const SIGNATURE_TOLERANCE_MS = 300_000

export async function checkoutReference(
  env: BillingProviderEnv,
  value: string,
  decrypt = false,
): Promise<string | null> {
  try {
    const [storedVersion, encoded] = value.split('.')
    const version = decrypt ? storedVersion : env.referenceKeyVersion
    const secret = version ? env.referenceKeys?.[version] : undefined
    if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) return null
    const key = await crypto.subtle.importKey(
      'raw',
      Uint8Array.from(secret.match(/../g)!, (part) => parseInt(part, 16)),
      'AES-GCM',
      false,
      [decrypt ? 'decrypt' : 'encrypt'],
    )
    if (decrypt) {
      const bytes = Uint8Array.from(atob(encoded), (part) => part.charCodeAt(0))
      return new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: bytes.slice(0, 12) },
          key,
          bytes.slice(12),
        ),
      )
    }
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)),
    )
    return `${version}.${btoa(String.fromCharCode(...iv, ...ciphertext))}`
  } catch {
    return null
  }
}

export async function expireProviderCheckout(
  env: BillingProviderEnv,
  id: string,
): Promise<boolean> {
  if (!env.secretKey || !env.providerGateAccepted || !/^cs_[A-Za-z0-9_]{8,120}$/.test(id))
    return false
  const headers = { Authorization: `Bearer ${env.secretKey}` }
  try {
    const read = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    })
    if (!read.ok) return false
    const session = await read.json()
    if (session.status === 'expired') return true
    if (session.status !== 'open') return false
    const expired = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}/expire`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(15000),
    })
    return expired.ok && (await expired.json()).status === 'expired'
  } catch {
    return false
  }
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(key: string, message: string): Promise<string> {
  const encoded = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', encoded, new TextEncoder().encode(message)))
}

function secureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1)
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

/** Stripe scheme: v1 = HMAC-SHA256(secret, `${t}.${rawBody}`), fresh t. */
export async function verifyStripeSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header) return false
  const timestamp = /(?:^|,)\s*t=([0-9]+)\s*(?:,|$)/.exec(header)?.[1]
  if (!timestamp) return false
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > SIGNATURE_TOLERANCE_MS) return false
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`)
  return [...header.matchAll(/v1=([0-9a-f]{64})/g)].some((m) => secureEqual(m[1], expected))
}

export type StripeResult = { ok: true; id: string; url: string } | { ok: false }

export async function stripeFormPost(
  env: BillingProviderEnv,
  path: string,
  params: Record<string, string>,
  idempotencyKey: string,
  surface: 'sales' | 'commercial_research' = 'sales',
): Promise<StripeResult> {
  if (surface !== 'sales' || !env.secretKey || !env.providerGateAccepted) return { ok: false }
  let response: Response
  try {
    response = await fetch(`https://api.stripe.com${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: new URLSearchParams(params).toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { ok: false }
  }
  if (!response.ok) return { ok: false }
  const body = (await response.json().catch(() => null)) as {
    id?: unknown
    url?: unknown
    status?: unknown
  } | null
  if (
    typeof body?.id !== 'string' ||
    !(
      path === '/v1/billing_portal/sessions'
        ? /^bps_[A-Za-z0-9_]{8,120}$/
        : /^cs_[A-Za-z0-9_]{8,120}$/
    ).test(body.id) ||
    typeof body.url !== 'string' ||
    !body.url.startsWith('https://')
  )
    return { ok: false }
  return { ok: true, id: body.id, url: body.url }
}

/** Read-only recovery after the mint window; validation errors cannot prove absence. */
export async function findProviderCheckout(
  env: BillingProviderEnv,
  reservation: {
    sessionId: string
    createdAt: string
    expiresAt: string
    request: Record<string, string>
  },
): Promise<{ id: string | null } | null> {
  const from = Date.parse(reservation.createdAt),
    until = Date.parse(reservation.expiresAt) + 60_000
  if (
    !env.secretKey ||
    !env.providerGateAccepted ||
    !Number.isFinite(from) ||
    !Number.isFinite(until) ||
    Date.now() <= until
  )
    return null
  let cursor = '',
    found: string | null = null
  try {
    for (let page = 0; page < 100; page++) {
      const params = new URLSearchParams({
        limit: '100',
        'created[gte]': String(Math.floor(from / 1000) - 5),
        'created[lte]': String(Math.ceil(until / 1000)),
      })
      if (cursor) params.set('starting_after', cursor)
      const response = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params}`, {
        headers: { Authorization: `Bearer ${env.secretKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) return null
      const body = await response.json()
      if (!Array.isArray(body.data) || typeof body.has_more !== 'boolean') return null
      for (const session of body.data) {
        if (
          session.client_reference_id !== reservation.sessionId &&
          session.metadata?.checkout_session_id !== reservation.sessionId
        )
          continue
        if (
          found ||
          session.client_reference_id !== reservation.sessionId ||
          session.metadata?.checkout_session_id !== reservation.sessionId ||
          session.metadata?.hmac_key_version !==
            reservation.request['metadata[hmac_key_version]'] ||
          session.mode !== 'subscription' ||
          session.currency !== reservation.request['line_items[0][price_data][currency]'] ||
          session.amount_subtotal !==
            Number(reservation.request['line_items[0][price_data][unit_amount]']) ||
          typeof session.id !== 'string' ||
          !/^cs_[A-Za-z0-9_]{8,120}$/.test(session.id)
        )
          return null
        found = session.id
      }
      if (!body.has_more) return { id: found }
      const next = body.data.at(-1)?.id
      if (typeof next !== 'string' || next === cursor) return null
      cursor = next
    }
  } catch {
    return null
  }
  return null
}

/** Checkout carries the subscription identity; the provider owns its renewal clock. */
export async function subscriptionPeriodEnd(
  env: BillingProviderEnv,
  id: string,
): Promise<string | null> {
  if (!env.secretKey || !env.providerGateAccepted || !/^sub_[A-Za-z0-9]{8,64}$/.test(id))
    return null
  try {
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${id}`, {
      headers: { Authorization: `Bearer ${env.secretKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return null
    const subscription = await response.json()
    const end = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end
    return subscription.id === id && typeof end === 'number' && Number.isSafeInteger(end) && end > 0
      ? new Date(end * 1000).toISOString()
      : null
  } catch {
    return null
  }
}

declare const Deno: {
  env: { get(name: string): string | undefined }
}

type BillingRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>

/** Reservations own provider keys; uncertain responses replay the same durable attempt. */
export async function reconcileCheckoutRefund(
  rpc: BillingRpc,
  env: BillingProviderEnv,
  sessionId: string,
  binding: { digest: string; keyVersion: number },
): Promise<string | null> {
  const scope = { p_provider_session_hmac: binding.digest, p_hmac_key_version: binding.keyVersion }
  for (let remaining = 3; remaining > 0; remaining--) {
    const reserved = await rpc('billing_reserve_refund_attempt', scope)
    if (reserved.error) return null
    const attempt = reserved.data as {
      state?: string
      eventId?: string
      subscriptionId?: string
      attempt?: number
    } | null
    if (attempt?.state === 'provider_confirmed') return 'refunded'
    if (attempt?.state === 'provider_pending') return 'refund_pending'
    if (attempt?.state === 'escalated') return 'refund_escalated'
    if (
      attempt?.state !== 'queued' ||
      !attempt.eventId ||
      !attempt.subscriptionId ||
      !attempt.attempt
    )
      return null
    const result = await stripeCancelAndRefundSubscription(
      env,
      attempt.subscriptionId,
      attempt.eventId,
      sessionId,
      attempt.attempt,
      binding.keyVersion,
    )
    if (!result.ok) return null
    const recorded = await rpc('billing_record_checkout_refund_state', {
      ...scope,
      p_event_id: attempt.eventId,
      p_subscription_id: attempt.subscriptionId,
      p_attempt: attempt.attempt,
      p_refund_id: result.refundId,
      p_provider_state: result.status,
    })
    if (recorded.error) return null
    if (recorded.data !== 'refund_failed') return String(recorded.data)
  }
  const exhausted = await rpc('billing_reserve_refund_attempt', scope)
  return exhausted.error ? null : 'refund_escalated'
}
