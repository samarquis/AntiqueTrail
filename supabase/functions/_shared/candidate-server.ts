/* eslint-disable */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { acceptedSendResponse, timed } from './candidate-response.ts'

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

export interface CandidateConnection {
  hostname: string
  port: number
  transport: 'tcp' | 'udp'
}

export async function handleCandidate(
  operation: string,
  request: Request,
  connection?: CandidateConnection,
): Promise<Response> {
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
  let leaseId: string | null = null
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
    if ((operation === 'extract' || operation === 'send') && !hmacSecret)
      return respond(unavailable())
    if (operation === 'extract' || operation === 'send') {
      const reservation = await reserve(client, operation, connection, body)
      if (!reservation.allowed) return respond(rateLimited(reservation.retryAfter))
      leaseId = reservation.leaseId
    }
    if (operation === 'extract') return respond(Response.json(await extract(body)))
    if (!serviceKey || !hmacSecret || !payloadSecret) return respond(unavailable())
    if (operation === 'send') {
      await send(context.data.userId, body)
      return respond(acceptedSendResponse())
    }
    if (operation === 'accept') return respond(Response.json(await accept(client, body)))
    if (operation === 'block' || operation === 'report') {
      return respond(Response.json(await close(client, operation, body)))
    }
    return respond(unavailable())
  } catch {
    return respond(new Response('Unavailable', { status: 503 }))
  } finally {
    if (leaseId) {
      try {
        await client.rpc('candidate_release_operation', { p_lease_id: leaseId })
      } catch {
        // The short server lease expires safely if the release request itself is interrupted.
      }
    }
  }
}

async function reserve(
  client: any,
  operation: 'extract' | 'send',
  connection: CandidateConnection | undefined,
  body: Record<string, unknown>,
): Promise<Reservation> {
  if (
    !connection ||
    connection.transport !== 'tcp' ||
    !connection.hostname ||
    connection.hostname.length > 64 ||
    !/^[0-9a-f:.]+$/i.test(connection.hostname)
  )
    throw new Error('rate context unavailable')
  let subject = 'invalid'
  if (operation === 'extract' && typeof body.url === 'string') {
    try {
      const parsed = new URL(body.url)
      if (['http:', 'https:'].includes(parsed.protocol)) subject = parsed.hostname.toLowerCase()
    } catch {
      // Invalid URLs still consume the account/IP attempt under one opaque sentinel host.
    }
  } else if (operation === 'send' && typeof body.recipientEmail === 'string') {
    subject = body.recipientEmail.normalize('NFKC').trim().toLowerCase().slice(0, 320) || 'invalid'
  }
  const subjectHmac = await sign(`candidate-${operation}-subject:${subject}`, hmacSecret!)
  const ipHmac = await sign(
    `candidate-${operation}-ip:${coarseIpKey(connection.hostname)}`,
    hmacSecret!,
  )
  const result = await client.rpc('candidate_reserve_operation', {
    p_operation: operation === 'extract' ? 'extract' : 'share_send',
    p_subject_hmac: `\\x${subjectHmac}`,
    p_ip_hmac: `\\x${ipHmac}`,
  })
  if (result.error || typeof result.data?.allowed !== 'boolean')
    throw new Error('rate context unavailable')
  return {
    allowed: result.data.allowed,
    leaseId: typeof result.data.leaseId === 'string' ? result.data.leaseId : null,
    retryAfter:
      Number.isInteger(result.data.retryAfter) && result.data.retryAfter > 0
        ? Math.min(result.data.retryAfter, 86_400)
        : 1,
  }
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
  if (new TextEncoder().encode(originalLink).byteLength > 2_048) return fallback('invalid_link')
  try {
    parsed = new URL(originalLink)
  } catch {
    return fallback('invalid_link')
  }
  if (
    !proxyUrl ||
    !proxyCredential ||
    !['http:', 'https:'].includes(parsed.protocol) ||
    (parsed.protocol === 'http:' && parsed.port && parsed.port !== '80') ||
    (parsed.protocol === 'https:' && parsed.port && parsed.port !== '443') ||
    unsafeAddress(parsed.hostname)
  )
    return fallback('private_destination')
  const normalizedUrl = parsed.toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6_000)
  try {
    const configuredProxy = new URL(proxyUrl)
    if (
      configuredProxy.protocol !== 'https:' ||
      configuredProxy.username ||
      configuredProxy.password
    )
      return fallback('fetch_failed', normalizedUrl, parsed.hostname)
    const response = await fetch(configuredProxy.toString(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Candidate-Proxy-Credential': proxyCredential,
      },
      body: JSON.stringify({
        url: normalizedUrl,
        maxRedirects: 3,
        connectTimeoutMs: 2_000,
        totalTimeoutMs: 6_000,
        maxCompressedBytes: 1_048_576,
        maxDecompressedBytes: 2_097_152,
        maxExtractedTextBytes: 65_536,
        allowedContentTypes: ['text/html', 'text/plain'],
        stripHeaders: ['authorization', 'cookie', 'origin', 'proxy-authorization', 'referer'],
      }),
    })
    if (!response.ok) return fallback('fetch_failed', normalizedUrl, parsed.hostname)
    const result = (await response.json()) as ProxyResult
    if (
      result.pinned !== true ||
      result.credentialVerified !== true ||
      !Number.isInteger(result.redirectCount) ||
      result.redirectCount < 0 ||
      result.redirectCount > 3 ||
      result.headersStripped !== true ||
      !Number.isInteger(result.compressedByteLength) ||
      result.compressedByteLength < 0 ||
      result.compressedByteLength > 1_048_576 ||
      !Number.isInteger(result.decompressedByteLength) ||
      result.decompressedByteLength < 0 ||
      result.decompressedByteLength > 2_097_152 ||
      !Number.isInteger(result.extractedTextByteLength) ||
      result.extractedTextByteLength < 0 ||
      result.extractedTextByteLength > 65_536 ||
      typeof result.body !== 'string' ||
      new TextEncoder().encode(result.body).byteLength !== result.extractedTextByteLength ||
      !Array.isArray(result.destinations) ||
      result.destinations.length !== result.redirectCount + 1 ||
      result.destinations[0]?.url !== normalizedUrl ||
      result.destinations.some((destination) => !validPinnedDestination(destination))
    )
      return fallback('fetch_failed', normalizedUrl, parsed.hostname)
    const type = result.contentType.split(';', 1)[0].trim().toLowerCase()
    if (!['text/html', 'text/plain'].includes(type))
      return fallback('unsupported_content', normalizedUrl, parsed.hostname)
    const text = result.body
    const title =
      type === 'text/plain'
        ? text.split(/\r?\n/, 1)[0]?.trim().slice(0, 160) || null
        : (/<title[^>]*>([^<]{1,300})<\/title>/i.exec(text)?.[1]?.trim().slice(0, 160) ?? null)
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
    return fallback(
      controller.signal.aborted ? 'timeout' : 'fetch_failed',
      normalizedUrl,
      parsed.hostname,
    )
  } finally {
    clearTimeout(timer)
  }
}

async function send(senderUserId: unknown, body: Record<string, unknown>) {
  const senderId = uuid(senderUserId)
  const candidateId = uuid(body.candidateId)
  const email = emailValue(body.recipientEmail)
  const admin = createClient(url!, serviceKey!, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const hmac = await sign(email, hmacSecret!)
  const encryptedRecipient = await encrypt(email, payloadSecret!)
  const queued = await admin.rpc('candidate_enqueue_share_delivery', {
    p_sender_user_id: senderId,
    p_candidate_id: candidateId,
    p_recipient_email_hmac: `\\x${hmac}`,
    p_encrypted_recipient: `\\x${encryptedRecipient}`,
    p_idempotency_key: key(body.idempotencyKey),
  })
  if (queued.error) throw queued.error
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
  headersStripped: boolean
  redirectCount: number
  compressedByteLength: number
  decompressedByteLength: number
  extractedTextByteLength: number
  contentType: string
  body: string
  destinations: Array<{ url: string; addresses: string[] }>
}
interface Reservation {
  allowed: boolean
  leaseId: string | null
  retryAfter: number
}
function validPinnedDestination(value: { url: string; addresses: string[] }) {
  try {
    const url = new URL(value.url)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !(
        (url.protocol === 'http:' && url.port && url.port !== '80') ||
        (url.protocol === 'https:' && url.port && url.port !== '443')
      ) &&
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
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
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
function rateLimited(retryAfter: number) {
  return new Response('Temporarily unavailable', {
    status: 429,
    headers: { 'Retry-After': String(Math.max(1, Math.min(retryAfter, 86_400))) },
  })
}
