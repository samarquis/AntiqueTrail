import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { runBetaLatchWorker } from '../_shared/beta-latch-worker.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const workerSecret = Deno.env.get('BETA_LATCH_WORKER_SECRET')

Deno.serve(async (request) => {
  if (
    request.method !== 'POST' ||
    !workerSecret ||
    request.headers.get('authorization') !== `Bearer ${workerSecret}`
  )
    return response(404, { status: 'unavailable' })
  if (!supabaseUrl || !serviceKey) return response(503, { status: 'disabled' })

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await runBetaLatchWorker({
      async refresh(now) {
        const rpcResult = await admin.rpc('beta_refresh_operational_latch', { p_now: now })
        if (rpcResult.error || !rpcResult.data) throw new Error('unavailable')
        return rpcResult.data as {
          state: 'current' | 'blocked'
          pausedCohorts: number
          hiddenStores: number
        }
      },
    })
    return response(result.status === 'blocked' ? 503 : 200, result)
  } catch {
    return response(503, { status: 'unavailable' })
  }
})

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
