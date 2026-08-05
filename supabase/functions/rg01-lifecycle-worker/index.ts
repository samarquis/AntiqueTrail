import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const lifecycleJwt = Deno.env.get('RG01_LIFECYCLE_JWT')
const secret = Deno.env.get('RG01_LIFECYCLE_WORKER_SECRET')

Deno.serve(async (request) => {
  if (
    request.method !== 'POST' ||
    !secret ||
    request.headers.get('authorization') !== `Bearer ${secret}`
  )
    return response(404, { status: 'unavailable' })
  if (!url || !anonKey || !lifecycleJwt) return response(503, { status: 'disabled' })
  try {
    const client = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: `Bearer ${lifecycleJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const rpc = await client.rpc('rg01_lifecycle_watchdog', { p_now: new Date().toISOString() })
    if (rpc.error) throw new Error('unavailable')
    const data = rpc.data as { status?: string }
    return response(data.status === 'blocked' ? 503 : 200, data)
  } catch {
    return response(503, { status: 'unavailable' })
  }
})

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  })
}
