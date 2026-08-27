export interface BillingProviderEnv {
  appOrigin?: string
  secretKey?: string
  webhookSecret?: string
  priceFeatured?: string
  priceUnlimited?: string
  providerGateAccepted: boolean
}

export function loadBillingProviderEnv(): BillingProviderEnv {
  return {
    appOrigin: Deno.env.get('APP_ORIGIN'),
    secretKey: Deno.env.get('STRIPE_SECRET_KEY'),
    webhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    priceFeatured: Deno.env.get('STRIPE_PRICE_FEATURED'),
    priceUnlimited: Deno.env.get('STRIPE_PRICE_UNLIMITED'),
    providerGateAccepted: Deno.env.get('BILLING_PROVIDER_GATE_ACCEPTED') === 'true',
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
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
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

export type StripeResult =
  | { ok: true; url: string }
  | { ok: false }

export async function stripeFormPost(
  env: BillingProviderEnv,
  path: string,
  params: Record<string, string>,
  idempotencyKey: string,
): Promise<StripeResult> {
  if (!env.secretKey || !env.providerGateAccepted) return { ok: false }
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
  const body = (await response.json().catch(() => null)) as { url?: unknown } | null
  if (typeof body?.url !== 'string' || !body.url.startsWith('https://')) return { ok: false }
  return { ok: true, url: body.url }
}

declare const Deno: {
  env: { get(name: string): string | undefined }
}
