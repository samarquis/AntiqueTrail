import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  runMediaPublish,
  runMediaPurge,
  type MediaPipelineDependencies,
} from '../_shared/media-pipeline.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const workerJwt = Deno.env.get('MEDIA_WORKER_JWT')
const lifecycleJwt = Deno.env.get('MEDIA_LIFECYCLE_JWT')
const schedulerToken = Deno.env.get('MEDIA_SCHEDULER_TOKEN')
const privateBucket = Deno.env.get('MEDIA_PRIVATE_BUCKET')
const publicBucket = Deno.env.get('MEDIA_PUBLIC_BUCKET')

async function authorized(request: Request): Promise<boolean> {
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
  if (request.method !== 'POST' || !(await authorized(request)))
    return new Response('Unauthorized', { status: 401 })
  if (!url || !workerJwt || !lifecycleJwt || !privateBucket || !publicBucket)
    return new Response('Unavailable', { status: 503 })
  try {
    const body = (await request.json()) as { operation?: unknown; jobId?: unknown }
    if (
      (body.operation !== 'publish' && body.operation !== 'purge' && body.operation !== 'sweep') ||
      (body.operation !== 'sweep' &&
        (typeof body.jobId !== 'string' || !/^[0-9a-f-]{36}$/iu.test(body.jobId)))
    )
      throw new Error('media_unavailable')
    const worker = createClient(url, workerJwt, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const lifecycle = createClient(url, lifecycleJwt, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const rpc = async <T>(
      client: ReturnType<typeof createClient>,
      command: string,
      payload: Record<string, unknown>,
    ): Promise<T> => {
      const result = await client.rpc(command, payload)
      if (result.error) throw result.error
      return result.data as T
    }
    const unavailable = async (): Promise<never> => Promise.reject(new Error('media_unavailable'))
    const dependencies: MediaPipelineDependencies = {
      reserve: unavailable,
      putPrivate: unavailable,
      scan: unavailable,
      reencode: unavailable,
      recordQuarantined: unavailable,
      recordProcessed: unavailable,
      claimPublish: async (jobId) => {
        const value = await rpc<Record<string, unknown>>(worker, 'media_claim_publish_job', {
          p_job_id: jobId,
        })
        return {
          uploadId: String(value.uploadId),
          privateDerivativeKey: String(value.privateDerivativeKey),
          publicDerivativeKey: String(value.publicDerivativeKey),
        }
      },
      async getPrivate(key) {
        const result = await worker.storage.from(privateBucket).download(key)
        if (result.error) throw result.error
        return new Uint8Array(await result.data.arrayBuffer())
      },
      async putPublic(key, bytes, options) {
        const result = await worker.storage.from(publicBucket).upload(key, bytes, options)
        if (result.error) throw result.error
      },
      completePublish: (jobId, uploadId, publicKey) =>
        rpc(worker, 'media_complete_publish_job', {
          p_job_id: jobId,
          p_upload_id: uploadId,
          p_public_key: publicKey,
        }),
      claimPurge: async (jobId) => {
        const value = await rpc<Record<string, unknown>>(lifecycle, 'media_claim_purge_job', {
          p_job_id: jobId,
        })
        return {
          uploadId: String(value.uploadId),
          privateKeys: Array.isArray(value.privateKeys) ? value.privateKeys.map(String) : [],
          publicKeys: Array.isArray(value.publicKeys) ? value.publicKeys.map(String) : [],
        }
      },
      async deletePrivate(key) {
        const result = await lifecycle.storage.from(privateBucket).remove([key])
        if (result.error) throw result.error
      },
      async deletePublic(key) {
        const result = await lifecycle.storage.from(publicBucket).remove([key])
        if (result.error) throw result.error
      },
      completePurge: (jobId, uploadId) =>
        rpc(lifecycle, 'media_complete_purge_job', {
          p_job_id: jobId,
          p_upload_id: uploadId,
        }),
    }
    if (body.operation === 'sweep') {
      const [publishJobs, purgeJobs] = await Promise.all([
        rpc<string[]>(worker, 'media_list_publish_jobs', { p_limit: 10 }),
        rpc<string[]>(lifecycle, 'media_list_purge_jobs', { p_limit: 10 }),
      ])
      let published = 0
      let purged = 0
      for (const jobId of publishJobs) {
        await runMediaPublish(jobId, dependencies)
        published += 1
      }
      for (const jobId of purgeJobs) {
        await runMediaPurge(jobId, dependencies)
        purged += 1
      }
      return Response.json(
        { published, purged },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    const jobId = body.jobId as string
    const result =
      body.operation === 'publish'
        ? await runMediaPublish(jobId, dependencies)
        : await runMediaPurge(jobId, dependencies)
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return new Response('Unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
})
