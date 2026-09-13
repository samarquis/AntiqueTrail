export interface CatalogConfig {
  url?: string
  anonKey?: string
  gatewayJwt?: string
  allowedOrigin?: string
  rateSalt?: string
  publicTest: boolean
}
export interface CatalogDependencies {
  gateway(): {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string } | null }>
  }
  verify(bearer: string): Promise<{ id: string } | null>
}

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

export function createPublicCatalogHandler(
  config: CatalogConfig,
  dependencies: CatalogDependencies,
) {
  const { url, anonKey, gatewayJwt, allowedOrigin, rateSalt, publicTest } = config
  return async (request: Request, connection: { remoteAddr?: { hostname?: string } } = {}) => {
    const origin = request.headers.get('origin')
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      // Browser preflight rejects the signed-in Authorization bearer without this list.
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
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
      !allowedOrigin ||
      !platformAddress ||
      origin !== allowedOrigin ||
      (publicTest &&
        (url !== 'https://uaupykgpegbseboklubv.supabase.co' ||
          allowedOrigin !== 'https://antique-trail.vercel.app'))
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
    const gatewayClient = dependencies.gateway()
    const authorization = request.headers.get('authorization')
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    const verifiedUser = bearer && bearer !== anonKey ? await dependencies.verify(bearer) : null
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
    if (publicTest) {
      // This server setting selects a separately admitted scope. Errors must never
      // fall through to another stage's catalog or an old assessment receipt.
      if (body.operation === 'map')
        return Response.json({ error: { code: 'MAP_UNAVAILABLE' } }, { status: 503, headers })
      const result = await gatewayClient.rpc('public_test_catalog_gateway_request', {
        p_key_hash: keyHash,
        p_operation: body.operation,
        p_args: safeArgs,
      })
      if (result.error?.message?.includes('catalog_rate_limited'))
        return Response.json(
          { error: { code: 'RATE_LIMITED' } },
          {
            status: 429,
            headers: { ...headers, 'Retry-After': '300' },
          },
        )
      if (result.error)
        return Response.json({ error: { code: 'CATALOG_UNAVAILABLE' } }, { status: 503, headers })
      return Response.json({ data: result.data }, { headers })
    }
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
  }
}
