/* eslint-disable */
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const cleanupJwt = Deno.env.get('CANDIDATE_CLEANUP_JWT')
const bucket = Deno.env.get('CANDIDATE_CLEANUP_BUCKET')

Deno.serve(async (request) => {
  if (request.method !== 'POST' || !url || !cleanupJwt || !bucket) {
    return new Response('Unavailable', { status: 503 })
  }
  const client = createClient(url, cleanupJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const now = new Date().toISOString()
  const expiry = await client.rpc('expire_candidate_shares', { p_now: now, p_limit: 100 })
  if (expiry.error) return new Response('Unavailable', { status: 503 })
  const claimed = await client.rpc('claim_candidate_cleanup', { p_now: now, p_limit: 100 })
  if (claimed.error) return new Response('Unavailable', { status: 503 })

  for (const job of claimed.data ?? []) {
    try {
      const keys = [...job.storage_keys].sort()
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(keys.join('\n')),
      )
      const digestHex = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
      const deletion = await client.storage.from(bucket).remove(keys)
      if (deletion.error) throw deletion.error
      const receiptId = crypto.randomUUID()
      const completion = await client.rpc('complete_candidate_cleanup', {
        p_share_id: job.share_id,
        p_claim_token: job.claim_token,
        p_receipt_id: receiptId,
        p_provider_receipt: `supabase-storage:${receiptId}`,
        p_storage_keys_digest: `\\x${digestHex}`,
        p_completed_at: new Date().toISOString(),
      })
      if (completion.error) throw completion.error
    } catch {
      await client.rpc('fail_candidate_cleanup', {
        p_share_id: job.share_id,
        p_claim_token: job.claim_token,
        p_now: new Date().toISOString(),
        p_error_code: 'storage_unavailable',
      })
    }
  }
  return Response.json({ expired: expiry.data, claimed: claimed.data?.length ?? 0 })
})
