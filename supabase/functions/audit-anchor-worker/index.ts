import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  runAuditAnchorWorker,
  type AuditAnchorClaim,
  type AuditAnchorPayload,
  type AuditAnchorWorkerDependencies,
} from '../_shared/audit-anchor-worker.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const workerSecret = Deno.env.get('AUDIT_ANCHOR_WORKER_SECRET')
const providerUrl = Deno.env.get('AUDIT_ANCHOR_URL')
const providerToken = Deno.env.get('AUDIT_ANCHOR_BEARER_TOKEN')

Deno.serve(async (request) => {
  if (
    request.method !== 'POST' ||
    !workerSecret ||
    request.headers.get('authorization') !== `Bearer ${workerSecret}`
  ) {
    return response(404, { status: 'unavailable' })
  }
  if (!supabaseUrl || !serviceKey || !providerUrl || !providerToken) {
    return response(503, { status: 'disabled' })
  }

  try {
    const result = await runAuditAnchorWorker(dependencies())
    return response(result.status === 'retry_scheduled' ? 503 : 200, result)
  } catch {
    return response(503, { status: 'unavailable' })
  }
})

function dependencies(): AuditAnchorWorkerDependencies {
  if (!supabaseUrl || !serviceKey || !providerUrl || !providerToken) throw new Error('disabled')
  const admin = createClient(supabaseUrl, serviceKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const workerId = crypto.randomUUID()
  return {
    async watchdog() {
      const result = await admin.rpc('audit_anchor_watchdog', { p_now: new Date().toISOString() })
      if (result.error) throw result.error
    },
    async prepare() {
      const result = await admin.rpc('prepare_audit_anchor')
      if (result.error) throw result.error
    },
    async claim(): Promise<AuditAnchorClaim | null> {
      const result = await admin.rpc('claim_audit_anchor', {
        p_worker_id: workerId,
        p_now: new Date().toISOString(),
      })
      if (result.error) throw result.error
      return result.data ? (result.data as AuditAnchorClaim) : null
    },
    async publish(payload: AuditAnchorPayload) {
      const providerResponse = await fetch(providerUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${providerToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': payload.idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })
      if (!providerResponse.ok) return { acknowledged: false }
      const receipt = (await providerResponse.json()) as {
        acknowledged?: unknown
        idempotencyKey?: unknown
      }
      return {
        acknowledged:
          receipt.acknowledged === true && receipt.idempotencyKey === payload.idempotencyKey,
      }
    },
    async acknowledge(idempotencyKey, leaseToken) {
      const result = await admin.rpc('acknowledge_audit_anchor', {
        p_idempotency_key: idempotencyKey,
        p_lease_token: leaseToken,
        p_acknowledged_at: new Date().toISOString(),
      })
      if (result.error) throw result.error
    },
    async fail(idempotencyKey, leaseToken, errorCode) {
      const result = await admin.rpc('fail_audit_anchor', {
        p_idempotency_key: idempotencyKey,
        p_lease_token: leaseToken,
        p_now: new Date().toISOString(),
        p_error_code: errorCode,
      })
      if (result.error) throw result.error
    },
  }
}

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
