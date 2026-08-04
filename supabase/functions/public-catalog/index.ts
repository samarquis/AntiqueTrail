/* eslint-disable */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(
    handler: (
      request: Request,
      info: { remoteAddr?: { hostname?: string } },
    ) => Promise<Response>,
  ): void
}

const url = Deno.env.get('SUPABASE_URL')
const gatewayJwt = Deno.env.get('PUBLIC_CATALOG_GATEWAY_JWT')
const allowedOrigin = Deno.env.get('PUBLIC_APP_ORIGIN')
const rateSalt = Deno.env.get('PUBLIC_CATALOG_RATE_SALT')

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
  if (body.operation !== 'list' && body.operation !== 'details')
    return Response.json({ error: { code: 'INVALID_OPERATION' } }, { status: 400, headers })
  const client = createClient(url, gatewayJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${rateSalt}|${platformAddress}`),
  )
  const keyHash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  const result = await client.rpc('public_catalog_gateway_request', {
    p_key_hash: keyHash,
    p_operation: body.operation,
    p_args: body.args ?? {},
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
