import { createClient } from 'npm:@supabase/supabase-js@2.112.1'
import { loadBillingProviderEnv } from '../_shared/billing-provider.ts'
import {
  dispatchSubscriptionChange,
  record,
  refundCharge,
} from '../_shared/billing-servicing-provider.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('BILLING_SERVICING_SCHEDULER_SECRET')
  const url = Deno.env.get('SUPABASE_URL')
  const jwt = Deno.env.get('BILLING_WORKER_JWT')
  if (
    request.method !== 'POST' ||
    !secret ||
    request.headers.get('x-scheduler-secret') !== secret ||
    !url ||
    !jwt
  )
    return new Response('Unavailable', { status: 403 })
  const client = createClient(url, jwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const due = await client.rpc('billing_due_servicing')
  if (
    due.error ||
    !record(due.data) ||
    !Array.isArray(due.data.changes) ||
    !Array.isArray(due.data.refunds)
  )
    return new Response('Unavailable', { status: 503 })
  const env = loadBillingProviderEnv()
  let pending = 0
  for (const id of due.data.changes) {
    if (
      typeof id !== 'string' ||
      !(await dispatchSubscriptionChange((name, args) => client.rpc(name, args), env, id))
    )
      pending++
  }
  for (const id of due.data.refunds) {
    if (
      typeof id !== 'string' ||
      !(await refundCharge((name, args) => client.rpc(name, args), env, id))
    )
      pending++
  }
  return Response.json(
    { pending },
    { status: pending ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  )
})
