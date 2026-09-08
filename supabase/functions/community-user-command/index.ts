import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { parseCommunityUserCommand } from '../_shared/community-user-command.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}
const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

Deno.serve(async (request) => {
  if (request.method !== 'POST' || !url || !anonKey) return response(503)
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return response(401)
  const length = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(length) || length > 20_000) return response(400)
  try {
    const command = parseCommunityUserCommand(await request.json())
    const client = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await client.rpc('community_preparation_command', {
      p_operation: command.operation,
      p_payload: command.payload,
    })
    if (result.error || result.data === null) return response(503)
    return response(200, result.data)
  } catch {
    return response(503)
  }
})

function response(status: number, body: unknown = { status: 'unavailable' }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/json; charset=utf-8',
      vary: 'Authorization',
      'x-content-type-options': 'nosniff',
    },
  })
}
