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
const allowedOrigin = Deno.env.get('APP_ORIGIN')

function responseHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  return {
    'Cache-Control': 'private, no-store',
    Vary: 'Authorization, Origin',
    ...(origin && allowedOrigin === origin ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    const headers = responseHeaders(request)
    if (!headers['Access-Control-Allow-Origin']) return new Response(null, { status: 403, headers })
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '600',
      },
    })
  }
  if (request.method !== 'POST' || !url || !anonKey || !workerJwt || !bucket)
    return unavailable(request)
  const authorization = request.headers.get('authorization')
  if (!authorization)
    return new Response('Unauthorized', { status: 401, headers: responseHeaders(request) })
  try {
    const body = (await request.json()) as { jobId?: string }
    if (!body.jobId || !/^[0-9a-f-]{36}$/iu.test(body.jobId)) return unavailable(request)
    const user = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const issued = await user.rpc('issue_account_export_download', { p_job_id: body.jobId })
    const handoffId = issued.data?.handoffId
    if (issued.error || typeof handoffId !== 'string') return unavailable(request)
    const service = createClient(url, workerJwt, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const consumed = await service.rpc('consume_account_export_handoff', {
      p_handoff_id: handoffId,
    })
    if (consumed.error || !consumed.data) return unavailable(request)
    const objectKey = consumed.data.objectKey
    const checksum = consumed.data.checksum
    const bytes = Number(consumed.data.bytes)
    if (
      typeof objectKey !== 'string' ||
      typeof checksum !== 'string' ||
      !Number.isSafeInteger(bytes)
    )
      return unavailable(request)
    const archive = await service.storage.from(bucket).download(objectKey)
    if (archive.error) return unavailable(request)
    const payload = new Uint8Array(await archive.data.arrayBuffer())
    if (!(await verifiedArchive(payload, bytes, checksum))) return unavailable(request)
    return new Response(payload, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="antique-trail-export-${body.jobId}.json"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...responseHeaders(request),
      },
    })
  } catch {
    return unavailable(request)
  }
})

function unavailable(request: Request) {
  return new Response('Unavailable', {
    status: 503,
    headers: responseHeaders(request),
  })
}
