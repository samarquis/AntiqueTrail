import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { runAccountLifecycleWorker } from '../_shared/account-lifecycle.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const workerJwt = Deno.env.get('ACCOUNT_LIFECYCLE_WORKER_JWT')
const bucket = Deno.env.get('ACCOUNT_EXPORT_BUCKET')
const candidateBucket = Deno.env.get('CANDIDATE_CLEANUP_BUCKET')
const schedulerToken = Deno.env.get('ACCOUNT_LIFECYCLE_SCHEDULER_TOKEN')

async function schedulerAuthorized(request: Request): Promise<boolean> {
  const supplied = request.headers.get('x-antique-trail-scheduler')
  if (!schedulerToken || !supplied) return false
  const encoder = new TextEncoder()
  const [expected, actual] = await Promise.all(
    [schedulerToken, supplied].map(
      async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
    ),
  )
  let difference = 0
  for (let index = 0; index < expected.length; index += 1)
    difference |= expected[index] ^ actual[index]
  return difference === 0
}

Deno.serve(async (request) => {
  if (request.method !== 'POST' || !(await schedulerAuthorized(request)))
    return new Response('Unauthorized', { status: 401 })
  if (!url || !workerJwt || !bucket) return new Response('Unavailable', { status: 503 })
  const client = createClient(url, workerJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  async function rpc<T>(command: string, payload: Record<string, unknown>): Promise<T> {
    const result = await client.rpc(command, payload)
    if (result.error) throw result.error
    return result.data as T
  }
  try {
    await rpc('store_application_retention', {})
    await rpc('promotion_retention', {})
    const summary = await runAccountLifecycleWorker({
      claimExports: (now, limit) => rpc('claim_account_exports', { p_now: now, p_limit: limit }),
      buildExport: (jobId, claimToken) =>
        rpc('build_account_export', { p_job_id: jobId, p_claim_token: claimToken }),
      async getExportMedia(bucketId, objectKey, maxBytes) {
        if (bucketId !== 'candidate-private' || !candidateBucket)
          throw new Error('account_export_media_unavailable')
        const storage = client.storage.from(candidateBucket)
        const info = await storage.info(objectKey)
        if (info.error) throw info.error
        const authoritativeBytes = info.data.size
        if (
          typeof authoritativeBytes !== 'number' ||
          !Number.isSafeInteger(authoritativeBytes) ||
          authoritativeBytes < 0 ||
          authoritativeBytes > maxBytes
        )
          throw new Error('account_export_media_too_large')
        const result = await storage.download(objectKey)
        if (result.error) throw result.error
        if (result.data.size > maxBytes) throw new Error('account_export_media_too_large')
        return new Uint8Array(await result.data.arrayBuffer())
      },
      async putArchive(objectKey, bytes) {
        const result = await client.storage.from(bucket).upload(objectKey, bytes, {
          contentType: 'application/zip',
          cacheControl: '0',
          upsert: true,
        })
        if (result.error) throw result.error
      },
      completeExport: (input) =>
        rpc('complete_account_export', {
          p_job_id: input.jobId,
          p_claim_token: input.claimToken,
          p_object_key: input.objectKey,
          p_checksum: `\\x${[...input.checksum].map((value) => value.toString(16).padStart(2, '0')).join('')}`,
          p_bytes: input.bytes,
          p_completed_at: input.completedAt,
        }),
      failExport: (jobId, claimToken, now) =>
        rpc('fail_account_export', {
          p_job_id: jobId,
          p_claim_token: claimToken,
          p_now: now,
          p_error_code: 'archive_build_failed',
        }),
      expireExports: (now, limit) => rpc('expire_account_exports', { p_now: now, p_limit: limit }),
      async deleteArchive(objectKey) {
        const result = await client.storage.from(bucket).remove([objectKey])
        if (result.error) throw result.error
      },
      completeExportExpiry: (jobId, objectKey, completedAt) =>
        rpc('complete_account_export_expiry', {
          p_job_id: jobId,
          p_object_key: objectKey,
          p_completed_at: completedAt,
        }),
      claimMemoryPurges: (now, limit) =>
        rpc('claim_due_private_memory_purges', { p_now: now, p_limit: limit }),
      completeMemoryPurge: (undoToken, claimToken, completedAt) =>
        rpc('complete_private_memory_purge', {
          p_undo_token: undoToken,
          p_claim_token: claimToken,
          p_completed_at: completedAt,
        }),
      failMemoryPurge: (undoToken, claimToken, now) =>
        rpc('fail_private_memory_purge', {
          p_undo_token: undoToken,
          p_claim_token: claimToken,
          p_now: now,
        }),
      purgeDismissals: (now, limit) =>
        rpc('purge_due_catalog_dismissals', { p_now: now, p_limit: limit }),
      runReviewLifecycle: (now, limit) =>
        rpc('run_due_review_lifecycle', { p_now: now, p_limit: limit }),
      claimAccountDeletions: (now, limit) =>
        rpc('claim_due_account_deletions', { p_now: now, p_limit: limit }),
      async deleteAccountStorageObject(bucketId, objectKey) {
        const providerBucket =
          bucketId === 'account-exports'
            ? bucket
            : bucketId === 'candidate-private'
              ? candidateBucket
              : undefined
        if (!providerBucket) throw new Error('account_deletion_storage_unavailable')
        const result = await client.storage.from(providerBucket).remove([objectKey])
        if (result.error) throw result.error
      },
      prepareAccountDeletion: (requestId, claimToken, preparedAt) =>
        rpc('prepare_account_deletion', {
          p_deletion_request_id: requestId,
          p_claim_token: claimToken,
          p_prepared_at: preparedAt,
        }),
      async deleteProviderUser(userId) {
        const deletion = await client.auth.admin.deleteUser(userId, false)
        if (deletion.error) {
          const detail = deletion.error as { status?: number; code?: string }
          if (detail.status !== 404 && detail.code !== 'user_not_found') throw deletion.error
        }
        const verification = await client.auth.admin.getUserById(userId)
        if (!verification.error) throw new Error('provider_user_still_present')
        const detail = verification.error as { status?: number; code?: string }
        if (detail.status !== 404 && detail.code !== 'user_not_found') throw verification.error
      },
      completeAccountDeletion: (requestId, claimToken, completedAt) =>
        rpc('complete_account_deletion', {
          p_deletion_request_id: requestId,
          p_claim_token: claimToken,
          p_completed_at: completedAt,
        }),
      failAccountDeletion: (requestId, claimToken, now, errorCode) =>
        rpc('fail_account_deletion', {
          p_deletion_request_id: requestId,
          p_claim_token: claimToken,
          p_now: now,
          p_error_code: errorCode,
        }),
    })
    return Response.json(summary, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return new Response('Unavailable', { status: 503 })
  }
})
