import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { prepareSyntheticPartnerPayload } from '../_shared/partner-command-payload.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const syntheticEnabled = Deno.env.get('PARTNER_SYNTHETIC_ENABLED') === 'true'
const emailHmacSecret = Deno.env.get('PARTNER_EMAIL_HMAC_SECRET')
const evidenceHmacSecret = Deno.env.get('PARTNER_EVIDENCE_HMAC_SECRET')

Deno.serve(async (request) => {
  if (request.method !== 'POST' || !url || !anonKey) return unavailable()
  const authorization = request.headers.get('authorization')
  if (!authorization) return new Response('Unauthorized', { status: 401 })
  try {
    const body = (await request.json()) as {
      operation?: string
      payload?: Record<string, unknown>
      synthetic?: boolean
    }
    // This deployment intentionally implements only Synthetic evidence. A
    // real E-01 path remains unavailable until its approved provider exists.
    if (!body.synthetic || !syntheticEnabled) return unavailable()
    if (
      !body.operation ||
      ![
        'exchange_invitation',
        'accept_consent',
        'bind_identity',
        'submit_authority_signal',
        'request_authority_recheck',
      ].includes(body.operation)
    )
      return unavailable()
    const client = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const payload = await prepareSyntheticPartnerPayload(body.operation, body.payload ?? {}, {
      emailHmacSecret,
      evidenceHmacSecret,
    })
    const result = await client.rpc('partner_synthetic_command', {
      p_operation: body.operation,
      p_payload: payload,
    })
    if (result.error) return unavailable()
    return Response.json(result.data)
  } catch {
    return unavailable()
  }
})

function unavailable() {
  return new Response('Unavailable', { status: 503 })
}
