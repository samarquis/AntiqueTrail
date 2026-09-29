export interface CorrectionActor {
  userId: string
  sessionId: string
}

export interface CorrectionGateway {
  hmacSecret: string
  verify(token: string): Promise<CorrectionActor | null>
  submit(args: Record<string, unknown>): Promise<{
    data: unknown
    error?: { code?: string; message?: string; details?: string } | null
  }>
}

/** Only call after the provider verifies this exact token and user id. */
export function verifiedCorrectionSession(token: string, userId: string): CorrectionActor | null {
  try {
    const encoded = token.split('.')[1]?.replaceAll('-', '+').replaceAll('_', '/')
    if (!encoded) return null
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as {
      sub?: unknown
      session_id?: unknown
    }
    if (
      claims.sub !== userId ||
      typeof claims.session_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        claims.session_id,
      )
    )
      return null
    return { userId, sessionId: claims.session_id }
  } catch {
    return null
  }
}

export async function handleCorrectionSubmit(
  request: Request,
  platformAddress: string | undefined,
  gateway: CorrectionGateway | null,
): Promise<Response> {
  if (request.method !== 'POST' || !gateway?.hmacSecret || !platformAddress?.trim())
    return new Response('Unavailable', { status: 503 })
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/iu)?.[1]
  if (!token) return new Response('Unauthorized', { status: 401 })
  try {
    const actor = await gateway.verify(token)
    if (!actor) return new Response('Unauthorized', { status: 401 })
    const body = (await request.json()) as Record<string, unknown>
    if (
      !body ||
      typeof body.storeId !== 'string' ||
      typeof body.type !== 'string' ||
      typeof body.description !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        body.idempotencyKey,
      )
    )
      throw new Error('invalid input')
    const ipHmac = await sign(
      `correction-submit-ip:${coarseIpKey(platformAddress.trim())}`,
      gateway.hmacSecret,
    )
    const result = await gateway.submit({
      p_actor_user_id: actor.userId,
      p_idempotency_key: body.idempotencyKey,
      p_session_id: actor.sessionId,
      p_store_id: body.storeId,
      p_type: body.type,
      p_description: body.description,
      p_public_source_url:
        typeof body.publicSourceUrl === 'string' && body.publicSourceUrl
          ? body.publicSourceUrl
          : null,
      p_ip_hmac: `\\x${ipHmac}`,
    })
    if (
      result.error?.code === '42900' ||
      result.error?.message?.includes('correction_rate_limited')
    )
      return new Response('Temporarily unavailable', {
        status: 429,
        headers: { 'Retry-After': retryAfterFrom(result.error) },
      })
    if (result.error?.code === '42501') return new Response('Unauthorized', { status: 401 })
    if (result.error) throw result.error
    return Response.json(result.data)
  } catch {
    return new Response('Unavailable', { status: 503 })
  }
}

function retryAfterFrom(error: { details?: string }) {
  let value = 1
  try {
    const parsed = JSON.parse(error.details ?? '') as { retryAfter?: number }
    if (Number.isInteger(parsed.retryAfter) && parsed.retryAfter > 0) value = parsed.retryAfter
  } catch {
    // Fall back to minimum retry when detail payload is unreadable.
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
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu.exec(value)
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
