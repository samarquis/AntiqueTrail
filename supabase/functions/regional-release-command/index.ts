import { createClient } from 'npm:@supabase/supabase-js@2.112.1'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const executorJwt = Deno.env.get('REGIONAL_RELEASE_EXECUTOR_JWT')
const commandSecret = Deno.env.get('REGIONAL_RELEASE_COMMAND_SECRET')

async function authorized(request: Request): Promise<boolean> {
  const supplied = request.headers.get('x-antique-trail-release-command')
  if (!commandSecret || !supplied) return false
  const encoder = new TextEncoder()
  const [expected, actual] = await Promise.all(
    [commandSecret, supplied].map(
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
  if (!url || !executorJwt) return new Response('Unavailable', { status: 503 })
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return new Response('Invalid request', { status: 400 })
  }
  if (
    (body.operation !== 'promote' && body.operation !== 'rollback') ||
    typeof body.commandId !== 'string' ||
    typeof body.releaseId !== 'string'
  )
    return new Response('Invalid request', { status: 400 })
  const client = createClient(url, executorJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await client.rpc('execute_regional_release_command', {
    p_operation: body.operation,
    p_command_id: body.commandId,
    p_release_id: body.releaseId,
    p_receipt_ids: body.operation === 'promote' ? body.receiptIds : null,
    p_reason: body.operation === 'rollback' ? body.reason : null,
  })
  if (result.error || (result.data !== 'active' && result.data !== 'rolled_back'))
    return new Response('Unavailable', { status: 503 })
  return Response.json(
    { state: result.data },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
})
