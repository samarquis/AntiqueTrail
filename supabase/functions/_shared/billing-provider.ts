export interface BillingProviderEnv {
  appOrigin?: string
  secretKey?: string
  webhookSecret?: string
  priceGallery?: string
  priceFullGallery?: string
  providerIdHmacSecret?: string
  providerIdHmacKeyVersion?: number
  providerGateAccepted: boolean
}

export function loadBillingProviderEnv(): BillingProviderEnv {
  return {
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
): Promise<{ digest: string; keyVersion: number } | null> {
  const keyVersion = env.providerIdHmacKeyVersion
  if (
    !env.providerIdHmacSecret ||
    typeof keyVersion !== 'number' ||
    !Number.isSafeInteger(keyVersion) ||
    keyVersion < 1 ||
    !/^cs_[A-Za-z0-9_]{8,120}$/.test(providerSessionId)
  )
    return null
  return {
    digest: await hmacHex(
      env.providerIdHmacSecret,
      `billing-provider-session:v${keyVersion}:${providerSessionId}`,
    ),
    keyVersion,
  }
}

export async function stripeCancelAndRefundSubscription(
  env: BillingProviderEnv,
  subscriptionId: string,
  eventId: string,
  providerSessionId: string,
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
        'Idempotency-Key': `${eventId}-refund`,
      },
      body: new URLSearchParams({
        payment_intent: paymentIntent,
        'metadata[checkout_event_id]': eventId,
        'metadata[checkout_provider_session_id]': providerSessionId,
        'metadata[subscription_id]': subscriptionId,
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
  const body = (await response.json().catch(() => null)) as { id?: unknown; url?: unknown } | null
  if (
    typeof body?.id !== 'string' ||
    !/^cs_[A-Za-z0-9_]{8,120}$/.test(body.id) ||
    typeof body.url !== 'string' ||
    !body.url.startsWith('https://')
  )
    return { ok: false }
  return { ok: true, id: body.id, url: body.url }
}

declare const Deno: {
  env: { get(name: string): string | undefined }
}
