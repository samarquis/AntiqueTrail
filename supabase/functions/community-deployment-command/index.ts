import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  communityRequestAuthorized,
  constrainedDeploymentJwt,
  parseCommunityDeploymentCommand,
} from '../_shared/community-deployment-command.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const deploymentJwt = Deno.env.get('COMMUNITY_DEPLOYMENT_JWT')
const commandSecret = Deno.env.get('COMMUNITY_COMMAND_SECRET')

Deno.serve(async (request) => {
  if (
    request.method !== 'POST' ||
    !commandSecret ||
    !(await communityRequestAuthorized(request, commandSecret))
  )
    return response(404)
  if (!supabaseUrl || !deploymentJwt || !constrainedDeploymentJwt(deploymentJwt))
    return response(503)
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(contentLength) || contentLength > 20_000) return response(400)

  try {
    const command = parseCommunityDeploymentCommand(await request.json())
    const client = createClient(supabaseUrl, deploymentJwt, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await client.rpc('community_deployment_command', {
      p_operation: command.operation,
      p_payload: command.payload,
    })
    if (result.error || result.data === null) return response(503)
    return response(200, { status: 'completed', result: result.data })
  } catch {
    return response(400)
  }
})

function response(status: number, body: unknown = { status: 'unavailable' }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
