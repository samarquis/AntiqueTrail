/* eslint-disable */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const hmacSecret = Deno.env.get('CANDIDATE_EMAIL_HMAC_SECRET')
const payloadSecret = Deno.env.get('CANDIDATE_PAYLOAD_SECRET')
const proxyUrl = Deno.env.get('CANDIDATE_OUTBOUND_PROXY_URL')
const proxyCredential = Deno.env.get('CANDIDATE_OUTBOUND_PROXY_SIGNED_CREDENTIAL')
const MINIMUM_SEND_RESPONSE_MS = 500

export async function handleCandidate(operation: string, request: Request): Promise<Response> {
  const startedAt = Date.now()
  const respond = (response: Response) => timed(operation, startedAt, response)
  if (request.method !== 'POST' || !url || !anonKey) return respond(unavailable())
  const authorization = request.headers.get('authorization')
  if (!authorization) return respond(new Response('Unauthorized', { status: 401 }))
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
    ) {
      return respond(new Response('Unauthorized', { status: 401 }))
    }
    const body = (await request.json()) as Record<string, unknown>
    if (operation === 'extract') return respond(Response.json(await extract(body)))
    if (!serviceKey || !hmacSecret || !payloadSecret) return respond(unavailable())
    if (operation === 'send') return respond(Response.json(await send(client, body)))
    if (operation === 'accept') return respond(Response.json(await accept(client, body)))
    if (operation === 'block' || operation === 'report') {
      return respond(Response.json(await close(client, operation, body)))
    }
    return respond(unavailable())
  } catch {
    return respond(new Response('Unavailable', { status: 503 }))
  }
}

async function extract(body: Record<string, unknown>) {
  const originalLink = typeof body.url === 'string' ? body.url : ''
  const originalNote = typeof body.note === 'string' ? body.note.slice(0, 2000) : ''
  const fallback = (
    reason: string,
    normalizedUrl: string | null = null,
    host: string | null = null,
  ) => ({
    mode: 'manual_fallback',
    reason,
    originalLink,
    originalNote,
    normalizedUrl,
    destinationHost: host,
    suggestions: { title: null, description: null, canonicalUrl: null, verified: false },
    publicWriteAllowed: false,
  })
  let parsed: URL
  try {
    parsed = new URL(originalLink)
  } catch {
    return fallback('invalid_link')
  }
  if (
    !proxyUrl ||
    !proxyCredential ||
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.port !== '' ||
    unsafeAddress(parsed.hostname)
  )
    return fallback('private_destination')
  const normalizedUrl = parsed.toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const configuredProxy = new URL(proxyUrl)
    if (configuredProxy.protocol !== 'https:' || configuredProxy.username || configuredProxy.password)
      return fallback('fetch_failed', normalizedUrl, parsed.hostname)
    const response = await fetch(configuredProxy.toString(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Candidate-Proxy-Credential': proxyCredential,
      },
      body: JSON.stringify({ url: normalizedUrl, maxRedirects: 3, maxBytes: 256_000, timeoutMs: 5_000 }),
    })
    if (!response.ok) return fallback('fetch_failed', normalizedUrl, parsed.hostname)
    const result = (await response.json()) as ProxyResult
    if (
      result.pinned !== true ||
      result.credentialVerified !== true ||
      !Number.isInteger(result.redirectCount) ||
      result.redirectCount < 0 ||
      result.redirectCount > 3 ||
      !Number.isInteger(result.byteLength) ||
      result.byteLength < 0 ||
      result.byteLength > 256_000 ||
      typeof result.body !== 'string' ||
      new TextEncoder().encode(result.body).byteLength > 256_000 ||
      !Array.isArray(result.destinations) ||
      result.destinations.length !== result.redirectCount + 1 ||
      result.destinations[0]?.url !== normalizedUrl ||
      result.destinations.some((destination) => !validPinnedDestination(destination))
    )
      return fallback('fetch_failed', normalizedUrl, parsed.hostname)
    const type = result.contentType
    if (!type.includes('text/html') && !type.includes('text/plain'))
      return fallback('unsupported_content', normalizedUrl, parsed.hostname)
    const text = result.body
    const title =
      /<title[^>]*>([^<]{1,300})<\/title>/i.exec(text)?.[1]?.trim().slice(0, 160) ?? null
    return {
      mode: 'suggestions',
      originalLink,
      originalNote,
      normalizedUrl,
      destinationHost: parsed.hostname,
      suggestions: { title, description: null, canonicalUrl: null, verified: false },
      publicWriteAllowed: false,
    }
  } catch {
    return fallback('fetch_failed', normalizedUrl, parsed.hostname)
  } finally {
    clearTimeout(timer)
  }
}

async function send(client: any, body: Record<string, unknown>) {
  const candidateId = uuid(body.candidateId)
  const email = emailValue(body.recipientEmail)
  const source = await client.rpc('candidate_edge_share_source', { p_candidate_id: candidateId })
  if (source.error || !source.data) throw new Error('unavailable')
  const admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (users.error) throw users.error
  const recipient =
    users.data.users.find((item: any) => item.email?.toLowerCase() === email)?.id ?? null
  const hmac = await sign(email, hmacSecret!)
  const encrypted = await encrypt(JSON.stringify(source.data), payloadSecret!)
  const result = await client.rpc('candidate_edge_send_share', {
    p_candidate_id: candidateId,
    p_recipient_id: recipient,
    p_recipient_email_hmac: `\\x${hmac}`,
    p_encrypted_payload: `\\x${encrypted}`,
    p_idempotency_key: key(body.idempotencyKey),
  })
  if (result.error) throw result.error
  return result.data
}

async function accept(client: any, body: Record<string, unknown>) {
  const shareId = uuid(body.shareId)
  const payload = await client.rpc('candidate_edge_payload', { p_share_id: shareId })
  if (payload.error || !payload.data) throw new Error('unavailable')
  const decoded = JSON.parse(await decrypt(payload.data, payloadSecret!))
  const result = await client.rpc('candidate_edge_accept_share', {
    p_share_id: shareId,
    p_title: decoded.title,
    p_url_note: decoded.urlNote,
    p_idempotency_key: key(body.idempotencyKey),
  })
  if (result.error) throw result.error
  return result.data
}

async function close(client: any, operation: string, body: Record<string, unknown>) {
  const shareId = uuid(body.shareId)
  const user = await client.auth.getUser()
  if (user.error || !user.data.user) throw new Error('unavailable')
  const reporter = await sign(user.data.user.id, hmacSecret!)
  const reported = await sign(shareId, hmacSecret!)
  const result = await client.rpc('candidate_edge_close_share', {
    p_share_id: shareId,
    p_action: operation,
    p_reporter_hmac: `\\x${reporter}`,
    p_reported_hmac: `\\x${reported}`,
    p_idempotency_key: key(body.idempotencyKey),
  })
  if (result.error) throw result.error
  return result.data
}

interface ProxyResult {
  pinned: boolean
  credentialVerified: boolean
  redirectCount: number
  byteLength: number
  contentType: string
  body: string
  destinations: Array<{ url: string; addresses: string[] }>
}
function validPinnedDestination(value: { url: string; addresses: string[] }) {
  try {
    const url = new URL(value.url)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.port === '' &&
      !unsafeAddress(url.hostname) &&
      Array.isArray(value.addresses) &&
      value.addresses.length > 0 &&
      value.addresses.every((address) => !unsafeAddress(address))
    )
  } catch {
    return false
  }
}
function unsafeAddress(input: string) {
  const value = input.toLowerCase().replace(/^\[|\]$/g, '')
  if (value === 'localhost' || value.endsWith('.local') || value === '::' || value === '::1')
    return true
  const mapped = /^::ffff:(.+)$/.exec(value)
  if (mapped) {
    if (mapped[1].includes('.')) return unsafeAddress(mapped[1])
    const words = mapped[1].split(':')
    if (words.length !== 2 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return true
    const high = Number.parseInt(words[0], 16)
    const low = Number.parseInt(words[1], 16)
    if (!Number.isInteger(high) || !Number.isInteger(low) || high > 0xffff || low > 0xffff)
      return true
    return unsafeAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  if (value.includes(':'))
    return (
      /^(fc|fd|fe|ff)/.test(value) ||
      value.startsWith('::') ||
      value.startsWith('100:') ||
      value.startsWith('2001:2:') ||
      value.startsWith('2001:db8:')
    )
  const parts = value.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false
  const [a, b, c] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  )
}
function uuid(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))
    throw new Error('invalid')
  return value
}
function emailValue(value: unknown) {
  if (typeof value !== 'string') throw new Error('invalid')
  const email = value.normalize('NFKC').trim().toLowerCase()
  if (email.length > 320 || !email.includes('@')) throw new Error('invalid')
  return email
}
function key(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value
    : crypto.randomUUID()
}
async function sign(value: string, secret: string) {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(value)))
}
async function aesKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}
async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await aesKey(secret),
      new TextEncoder().encode(value),
    ),
  )
  return hex(new Uint8Array([...iv, ...data]))
}
async function decrypt(value: string, secret: string) {
  const all = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(0, 12) },
      await aesKey(secret),
      all.slice(12),
    ),
  )
}
function hex(value: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(value instanceof Uint8Array ? value.buffer : value)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
}
function unavailable() {
  return new Response('Unavailable', { status: 503 })
}
async function timed(operation: string, startedAt: number, response: Response) {
  if (operation === 'send') {
    const remaining = MINIMUM_SEND_RESPONSE_MS - (Date.now() - startedAt)
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
  }
  return response
}
