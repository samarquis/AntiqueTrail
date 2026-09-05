import { createClient } from 'npm:@supabase/supabase-js@2.112.1'
import {
  checkoutReference,
  expireProviderCheckout,
  loadBillingProviderEnv,
  providerIdHmac,
  findProviderCheckout,
} from '../_shared/billing-provider.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

// Activation #181 installs the minute scheduler and its independent invocation credential.
Deno.serve(async (request) => {
  const secret = Deno.env.get('BILLING_EXPIRY_SCHEDULER_SECRET')
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
  const env = loadBillingProviderEnv()
  const client = createClient(url, jwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const due = await client.rpc('billing_due_checkout_expiry')
  if (due.error || !Array.isArray(due.data)) return new Response('Unavailable', { status: 503 })
  let pending = 0
  for (const row of due.data) {
    let id =
      typeof row.ciphertext === 'string' ? await checkoutReference(env, row.ciphertext, true) : null
    if (!id) {
      // Never create after expiry; a complete provider scan also recovers terminal sessions.
      const recovered = await findProviderCheckout(env, row)
      if (!recovered) {
        pending++
        continue
      }
      if (!recovered.id) {
        const rejected = await client.rpc('billing_record_checkout_create_rejected', {
          p_checkout_session_id: row.sessionId,
        })
        if (rejected.error || rejected.data !== 'failed') pending++
        continue
      }
      id = recovered.id
      const binding = await providerIdHmac(
        env,
        id,
        Number(row.request['metadata[hmac_key_version]']),
      )
      if (!binding) {
        pending++
        continue
      }
      const bound = await client.rpc('billing_bind_checkout_provider', {
        p_checkout_session_id: row.sessionId,
        p_provider_session_hmac: binding.digest,
        p_hmac_key_version: binding.keyVersion,
        p_provider_session_ciphertext: await checkoutReference(env, id),
      })
      if (bound.error) {
        pending++
        continue
      }
      row.hmac = binding.digest
      row.keyVersion = binding.keyVersion
    }
    if (!(await expireProviderCheckout(env, id))) {
      pending++
      continue
    }
    const recorded = await client.rpc('billing_record_checkout_expired', {
      p_provider_session_hmac: row.hmac,
      p_hmac_key_version: row.keyVersion,
    })
    if (recorded.error) pending++
  }
  return Response.json({ pending }, { status: pending ? 503 : 200 })
})
