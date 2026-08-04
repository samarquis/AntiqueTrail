/* eslint-disable */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
  resolveDns(host: string, type: 'A' | 'AAAA'): Promise<string[]>
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const hmacSecret = Deno.env.get('CANDIDATE_EMAIL_HMAC_SECRET')
const payloadSecret = Deno.env.get('CANDIDATE_PAYLOAD_SECRET')

export async function handleCandidate(operation: string, request: Request): Promise<Response> {
  if (request.method !== 'POST' || !url || !anonKey) return unavailable()
  const authorization = request.headers.get('authorization')
  if (!authorization) return new Response('Unauthorized', { status: 401 })
  const client = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const body = (await request.json()) as Record<string, unknown>
    if (operation === 'extract') return Response.json(await extract(body))
    if (!serviceKey || !hmacSecret || !payloadSecret) return unavailable()
    if (operation === 'send') return Response.json(await send(client, body))
    if (operation === 'accept') return Response.json(await accept(client, body))
    if (operation === 'block' || operation === 'report') {
      return Response.json(await close(client, operation, body))
    }
    return unavailable()
  } catch {
    return new Response('Unavailable', { status: 503 })
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
  if (!['http:', 'https:'].includes(parsed.protocol) || unsafeHost(parsed.hostname))
    return fallback('private_destination')
  const normalizedUrl = parsed.toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const before = await publicAddresses(parsed.hostname)
    const response = await fetch(normalizedUrl, {
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'text/html,text/plain' },
    })
    const after = await publicAddresses(parsed.hostname)
    if (before.join(',') !== after.join(','))
      return fallback('dns_rebinding', normalizedUrl, parsed.hostname)
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || (!type.includes('text/html') && !type.includes('text/plain')))
      return fallback('unsupported_content', normalizedUrl, parsed.hostname)
    const text = (await response.text()).slice(0, 256_000)
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

function unsafeHost(host: string) {
  const value = host.toLowerCase()
  return (
    value === 'localhost' ||
    value.endsWith('.local') ||
    value === '0.0.0.0' ||
    value === '127.0.0.1' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    /^fe[89ab]/.test(value) ||
    /^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(value)
  )
}
async function publicAddresses(host: string) {
  const values = [
    ...(await Deno.resolveDns(host, 'A').catch(() => [])),
    ...(await Deno.resolveDns(host, 'AAAA').catch(() => [])),
  ].sort()
  if (!values.length) throw new Error('dns')
  if (values.some(unsafeHost)) throw new Error('private')
  return values
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
