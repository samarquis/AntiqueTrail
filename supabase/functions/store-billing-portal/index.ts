import { createClient } from 'npm:@supabase/supabase-js@2.112.1'
import { loadBillingProviderEnv, stripeFormPost } from '../_shared/billing-provider.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const workerJwt = Deno.env.get('BILLING_WORKER_JWT')
const env = loadBillingProviderEnv()

function cors(request: Request): Record<string, string> | undefined {
  const origin = request.headers.get('origin')
  if (!origin || !env.appOrigin || origin !== env.appOrigin) return
  return {
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'private, no-store',
    Vary: 'Authorization, Origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

function unavailable(headers: Record<string, string> = {}, status = 503): Response {
  return new Response('Unavailable', { status, headers })
}

function stageDisabled(headers: Record<string, string>): Response {
  return Response.json({ error: 'stage_disabled' }, { status: 503, headers })
}

async function capabilityEnabled(
  client: ReturnType<typeof createClient>,
): Promise<boolean> {
  const result = await client.rpc('billing_get_capability')
  if (result.error) return false
  const value = result.data as { enabled?: unknown } | null
  return value?.enabled === true
}

Deno.serve(async (request) => {
  const headers = cors(request)
  if (!headers) return unavailable({}, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST' || !url || !anonKey || !workerJwt) return unavailable(headers)
  const authorization = request.headers.get('authorization')
  if (!authorization) return unavailable(headers, 401)

  // Capability first: nothing below may run or allocate while staged off.
  const userClient = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  if (!(await capabilityEnabled(userClient))) return stageDisabled(headers)

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return unavailable(headers, 400)
  }
  const storeId = body.storeId
  if (typeof storeId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(storeId))
    return unavailable(headers, 400)

  const reserved = await userClient.rpc('billing_create_portal_session', { p_store_id: storeId })
  if (reserved.error) {
    const message = typeof reserved.error.message === 'string' ? reserved.error.message : ''
    if (message.includes('billing_stage_disabled')) return stageDisabled(headers)
    if (message.includes('billing_action_denied')) return unavailable(headers, 403)
    return unavailable(headers)
  }

  const workerClient = createClient(url, workerJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const context = await workerClient.rpc('billing_get_portal_context', { p_store_id: storeId })
  const customerId =
    typeof context.data === 'string' ? context.data : undefined
  if (!customerId || !/^cus_[A-Za-z0-9]{8,64}$/.test(customerId)) return unavailable(headers)

  const minted = await stripeFormPost(
    env,
    '/v1/billing_portal/sessions',
    {
      customer: customerId,
      return_url: `${new URL(env.appOrigin!).origin}/store-portal/billing`,
    },
    crypto.randomUUID(),
  )
  if (!minted.ok) return unavailable(headers)
  return Response.json(
    { url: minted.url },
    { status: 200, headers },
  )
})
