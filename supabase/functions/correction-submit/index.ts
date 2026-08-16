import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(
    handler: (request: Request, info: { remoteAddr?: { hostname?: string } }) => Promise<Response>,
  ): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const hmacSecret = Deno.env.get('CANDIDATE_EMAIL_HMAC_SECRET')

Deno.serve(async (request, connection) => {
  // The connection address comes from the Edge runtime, not a caller-controlled
  // forwarding header; only its coarse /24 or /64 prefix is hashed into the IP
  // rate key, so no precise location leaves the platform.
  const platformAddress = connection.remoteAddr?.hostname?.trim()
  if (request.method !== 'POST' || !url || !anonKey || !hmacSecret || !platformAddress)
    return new Response('Unavailable', { status: 503 })
  const authorization = request.headers.get('authorization')
  if (!authorization) return new Response('Unauthorized', { status: 401 })
  const client = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const context = await client.rpc('candidate_edge_context')
    if (
      context.error ||
      context.data?.active !== true ||
      !['Shopper', 'Representative', 'Administrator'].includes(context.data?.role)
    )
      return new Response('Unauthorized', { status: 401 })
    const body = (await request.json()) as Record<string, unknown>
    if (
      typeof body.storeId !== 'string' ||
      typeof body.type !== 'string' ||
      typeof body.description !== 'string'
    )
      throw new Error('invalid input')
    const ipHmac = await sign(`correction-submit-ip:${coarseIpKey(platformAddress)}`, hmacSecret)
    const result = await client.rpc('shopper_submit_correction', {
      p_store_id: body.storeId,
      p_type: body.type,
      p_description: body.description,
      p_public_source_url:
        typeof body.publicSourceUrl === 'string' && body.publicSourceUrl
          ? body.publicSourceUrl
          : null,
      p_ip_hmac: `\\x${ipHmac}`,
    })
    if (result.error?.code === '42900' || result.error?.message?.includes('correction_rate_limited'))
      return new Response('Temporarily unavailable', {
        status: 429,
        headers: { 'Retry-After': retryAfterFrom(result.error) },
      })
    if (result.error) throw result.error
    return Response.json(result.data)
  } catch {
    return new Response('Unavailable', { status: 503 })
  }
})

function retryAfterFrom(error: { details?: string }) {
  let value = 1
  try {
    const parsed = JSON.parse(error.details ?? '') as { retryAfter?: number }
    if (Number.isInteger(parsed.retryAfter) && parsed.retryAfter > 0) value = parsed.retryAfter
  } catch {
    // Fall back to the minimum retry when the detail payload is unreadable.
  }
  return String(Math.max(1, Math.min(value, 86_400)))
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

function hex(value: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(value instanceof Uint8Array ? value.buffer : value)]
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('')
}

function coarseIpKey(value: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value)
  if (mapped) return coarseIpKey(mapped[1])
  if (value.includes('.')) {
    const parts = value.split('.')
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255))
      throw new Error('rate context unavailable')
    return `${parts.slice(0, 3).join('.')}.0/24`
  }
  const halves = value.toLowerCase().split('::')
  if (halves.length > 2) throw new Error('rate context unavailable')
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (
    [...left, ...right].some((word) => !/^[0-9a-f]{1,4}$/.test(word)) ||
    (halves.length === 1 && left.length !== 8) ||
    (halves.length === 2 && left.length + right.length >= 8)
  )
    throw new Error('rate context unavailable')
  const expanded = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
  return `${expanded
    .slice(0, 4)
    .map((word) => word.padStart(4, '0'))
    .join(':')}::/64`
}