import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { verifyDeviceProof } from '../_shared/trip-device-proof.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const gatewayJwt = Deno.env.get('TRIP_GO_GATEWAY_JWT')
const unavailable = () => new Response('Unavailable', { status: 503 })

function sessionId(authorization: string): string | null {
  try {
    const payload = authorization.slice('Bearer '.length).split('.')[1]
    if (!payload) return null
    const decoded = JSON.parse(
      atob(
        payload
          .replaceAll('-', '+')
          .replaceAll('_', '/')
          .padEnd(Math.ceil(payload.length / 4) * 4, '='),
      ),
    ) as { session_id?: unknown }
    return typeof decoded.session_id === 'string' && /^[0-9a-f-]{36}$/u.test(decoded.session_id)
      ? decoded.session_id
      : null
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST' || !url || !anonKey || !gatewayJwt) return unavailable()
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })
  try {
    const body = (await request.json()) as {
      tripId?: string
      action?: string
      stopId?: string | null
      baseVersion?: number
      deviceKeyId?: string
      devicePublicKey?: JsonWebKey
      proof?: { issuedAt?: string; nonce?: string; signature?: string }
    }
    if (
      !body.tripId ||
      !body.action ||
      !Number.isInteger(body.baseVersion) ||
      !body.deviceKeyId ||
      !body.devicePublicKey ||
      !body.proof?.issuedAt ||
      !body.proof.nonce ||
      !body.proof.signature ||
      !(await verifyDeviceProof({
        publicKey: body.devicePublicKey,
        deviceKeyId: body.deviceKeyId,
        purpose: 'go-v1',
        fields: [body.tripId, body.action, body.stopId ?? '', body.baseVersion!],
        issuedAt: body.proof.issuedAt,
        nonce: body.proof.nonce,
        signature: body.proof.signature,
      }))
    )
      return new Response('Invalid proof', { status: 400 })

    const userClient = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const user = await userClient.auth.getUser()
    const verifiedSessionId = sessionId(authorization)
    if (user.error || !user.data.user || !verifiedSessionId)
      return new Response('Unauthorized', { status: 401 })

    const gateway = createClient(url, gatewayJwt, {
      db: { schema: 'app_public' },
      global: { headers: { Authorization: `Bearer ${gatewayJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await gateway.rpc('execute_verified_go_command', {
      target_user_id: user.data.user.id,
      target_session_id: verifiedSessionId,
      trip_id: body.tripId,
      action: body.action,
      stop_id: body.stopId ?? null,
      base_version: body.baseVersion,
      device_key_id: body.deviceKeyId,
      proof_nonce: body.proof.nonce,
      proof_issued_at: body.proof.issuedAt,
    })
    if (result.error) return new Response('Conflict', { status: 409 })
    return Response.json(result.data)
  } catch {
    return unavailable()
  }
})
