import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(
    handler: (request: Request, info: { remoteAddr?: { hostname?: string } }) => Promise<Response>,
  ): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const gatewayJwt = Deno.env.get('PUBLIC_CATALOG_GATEWAY_JWT')
const allowedOrigin = Deno.env.get('PUBLIC_APP_ORIGIN')
const rateSalt = Deno.env.get('PUBLIC_CATALOG_RATE_SALT')

function sessionIdFromVerifiedJwt(token: string) {
  try {
    const encoded = token.split('.')[1]
    const normalized = encoded.replaceAll('-', '+').replaceAll('_', '/')
    const claims = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    ) as { session_id?: unknown }
    return typeof claims.session_id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        claims.session_id,
      )
      ? claims.session_id
      : null
  } catch {
    return null
  }
}

Deno.serve(async (request, connection) => {
  const origin = request.headers.get('origin')
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    ...(origin && allowedOrigin === origin ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
  if (request.method === 'OPTIONS')
    return new Response(null, { status: origin === allowedOrigin ? 204 : 403, headers })
  // The connection address comes from the Edge runtime, not a caller-controlled
  // forwarding header. It is used only to derive the rotating rate-limit key.
  const platformAddress = connection.remoteAddr?.hostname?.trim()
  if (
    request.method !== 'POST' ||
    !url ||
    !anonKey ||
    !gatewayJwt ||
    !rateSalt ||
    !platformAddress ||
    origin !== allowedOrigin
  )
    return Response.json({ error: { code: 'GATEWAY_UNAVAILABLE' } }, { status: 503, headers })
  let body: { operation?: string; args?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: { code: 'INVALID_REQUEST' } }, { status: 400, headers })
  }
  if (body.operation !== 'list' && body.operation !== 'details' && body.operation !== 'map')
    return Response.json({ error: { code: 'INVALID_OPERATION' } }, { status: 400, headers })
  const gatewayClient = createClient(url, gatewayJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const authorization = request.headers.get('authorization')
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  const verifiedUser =
    bearer && bearer !== anonKey
      ? (
          await createClient(url, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          }).auth.getUser(bearer)
        ).data.user
      : undefined
  const actor = verifiedUser?.id
  const sessionId = actor && bearer ? sessionIdFromVerifiedJwt(bearer) : null
  // The actor binding is derived from a provider-verified token. A caller can
  // never inject another shopper id into saved/visited map filters.
  const safeArgs = { ...(body.args ?? {}) }
  delete safeArgs.p_actor_user_id
  if (body.operation === 'map' && actor) safeArgs.p_actor_user_id = actor
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${rateSalt}|${platformAddress}`),
  )
  const keyHash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  const syntheticResult = await gatewayClient.rpc('synthetic_catalog_gateway_request', {
    p_key_hash: keyHash,
    p_user_id: actor ?? null,
    p_session_id: sessionId,
    p_operation: body.operation,
    p_args: safeArgs,
  })
  if (!syntheticResult.error) return Response.json({ data: syntheticResult.data }, { headers })
  if (syntheticResult.error.message.includes('catalog_rate_limited'))
    return Response.json(
      { error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { ...headers, 'Retry-After': '300' } },
    )
  if (syntheticResult.error.message.includes('synthetic_catalog_forbidden'))
    return Response.json({ error: { code: 'ALPHA_AUTH_REQUIRED' } }, { status: 403, headers })
  if (syntheticResult.error.message.includes('synthetic_catalog_map_disabled'))
    return Response.json({ error: { code: 'MAP_UNAVAILABLE' } }, { status: 503, headers })
  if (!syntheticResult.error.message.includes('synthetic_catalog_outside_stage'))
    return Response.json({ error: { code: 'CATALOG_UNAVAILABLE' } }, { status: 503, headers })
  const result = await gatewayClient.rpc('public_catalog_gateway_request', {
    p_key_hash: keyHash,
    p_operation: body.operation,
    p_args: safeArgs,
  })
  if (result.error?.message?.includes('catalog_rate_limited'))
    return Response.json(
      { error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { ...headers, 'Retry-After': '300' } },
    )
  if (result.error)
    return Response.json({ error: { code: 'CATALOG_UNAVAILABLE' } }, { status: 503, headers })
  return Response.json({ data: result.data }, { headers })
})
