import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const monitorJwt = Deno.env.get('ROUTING_MONITOR_JWT')
const secret = Deno.env.get('ROUTING_OPERATIONS_WORKER_SECRET')

Deno.serve(async (request) => {
  if (
    request.method !== 'POST' ||
    !secret ||
    request.headers.get('authorization') !== `Bearer ${secret}`
  )
    return reply(404, { status: 'unavailable' })
  if (!url || !anonKey || !monitorJwt) return reply(503, { status: 'disabled' })
  try {
    const client = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: `Bearer ${monitorJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await client.rpc('routing_purge_operations', {
      p_now: new Date().toISOString(),
      p_limit: 500,
    })
    if (result.error) throw new Error('unavailable')
    return reply(200, { status: 'ok', purged: result.data })
  } catch {
    return reply(503, { status: 'unavailable' })
  }
})

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  })
}
