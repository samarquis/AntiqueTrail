import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { verifiedArchive } from '../_shared/account-lifecycle.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const workerJwt = Deno.env.get('ACCOUNT_LIFECYCLE_WORKER_JWT')
const bucket = Deno.env.get('ACCOUNT_EXPORT_BUCKET')

Deno.serve(async (request) => {
  if (request.method !== 'POST' || !url || !anonKey || !workerJwt || !bucket)
    return new Response('Unavailable', { status: 503 })
  const authorization = request.headers.get('authorization')
  if (!authorization) return new Response('Unauthorized', { status: 401 })
  try {
    const body = (await request.json()) as { jobId?: string }
    if (!body.jobId || !/^[0-9a-f-]{36}$/iu.test(body.jobId)) return unavailable()
    const user = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const issued = await user.rpc('issue_account_export_download', { p_job_id: body.jobId })
    const handoffId = issued.data?.handoffId
    if (issued.error || typeof handoffId !== 'string') return unavailable()
    const service = createClient(url, workerJwt, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const consumed = await service.rpc('consume_account_export_handoff', {
      p_handoff_id: handoffId,
    })
    if (consumed.error || !consumed.data) return unavailable()
    const objectKey = consumed.data.objectKey
    const checksum = consumed.data.checksum
    const bytes = Number(consumed.data.bytes)
    if (
      typeof objectKey !== 'string' ||
      typeof checksum !== 'string' ||
      !Number.isSafeInteger(bytes)
    )
      return unavailable()
    const archive = await service.storage.from(bucket).download(objectKey)
    if (archive.error) return unavailable()
    const payload = new Uint8Array(await archive.data.arrayBuffer())
    if (!(await verifiedArchive(payload, bytes, checksum))) return unavailable()
    return new Response(payload, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="antique-trail-export-${body.jobId}.json"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return unavailable()
  }
})

function unavailable() {
  return new Response('Unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
