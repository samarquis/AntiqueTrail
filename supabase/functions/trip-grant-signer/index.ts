import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { verifyDeviceProof } from '../_shared/trip-device-proof.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const signerJwt = Deno.env.get('TRIP_GRANT_SIGNER_JWT')
const privateJwk = Deno.env.get('TRIP_GRANT_SIGNING_PRIVATE_JWK')
const keyId = Deno.env.get('TRIP_GRANT_SIGNING_KEY_ID')

function unavailable() {
  return new Response('Unavailable', { status: 503 })
}

function base64Url(bytes: ArrayBuffer) {
  let binary = ''
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

Deno.serve(async (request) => {
  if (request.method !== 'POST' || !url || !anonKey || !signerJwt || !privateJwk || !keyId)
    return unavailable()
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })

  try {
    const body = (await request.json()) as {
      tripId?: string
      installId?: string
      deviceId?: string
      deviceKeyId?: string
      devicePublicKey?: JsonWebKey
      proof?: { issuedAt?: string; nonce?: string; signature?: string }
    }
    if (
      !body.tripId ||
      !body.installId ||
      !body.deviceKeyId ||
      !body.devicePublicKey ||
      !body.proof?.issuedAt ||
      !body.proof.nonce ||
      !body.proof.signature ||
      !(await verifyDeviceProof({
        publicKey: body.devicePublicKey,
        deviceKeyId: body.deviceKeyId,
        purpose: 'grant-v1',
        fields: [body.tripId, body.installId],
        issuedAt: body.proof.issuedAt,
        nonce: body.proof.nonce,
        signature: body.proof.signature,
      }))
    )
      return new Response('Invalid request', { status: 400 })

    const userClient = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const claimsResult = await userClient.rpc('prepare_offline_grant_claims', {
      trip_id: body.tripId,
      install_id: body.installId,
      device_id: body.deviceKeyId,
      device_key_id: body.deviceKeyId,
    })
    if (claimsResult.error || !claimsResult.data || typeof claimsResult.data !== 'object')
      return new Response('Forbidden', { status: 403 })

    const claims = claimsResult.data as Record<string, unknown>
    const key = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(privateJwk) as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
    const signedBytes = new TextEncoder().encode(
      JSON.stringify([
        claims.accountId,
        claims.tripId,
        claims.installId,
        claims.deviceId,
        claims.deviceKeyId,
        claims.sessionSecurityVersion,
        claims.issuedAt,
        claims.expiresAt,
        claims.reauthorizeBy,
        claims.nonce,
      ]),
    )
    const signature = base64Url(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signedBytes),
    )
    const signedGrant = { keyId, claims, signature }

    const signerClient = createClient(url, signerJwt, {
      db: { schema: 'app_public' },
      global: { headers: { Authorization: `Bearer ${signerJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const receipt = await signerClient.rpc('record_verified_offline_grant_receipt', {
      target_trip_id: claims.tripId,
      target_user_id: claims.accountId,
      install_id: claims.installId,
      device_key_id: claims.deviceKeyId,
      session_security_version: claims.sessionSecurityVersion,
      signed_grant: signedGrant,
      expires_at: claims.expiresAt,
      proof_nonce: body.proof.nonce,
      proof_issued_at: body.proof.issuedAt,
    })
    if (receipt.error) return unavailable()
    return Response.json({ state: 'ready', receiptId: receipt.data })
  } catch {
    return unavailable()
  }
})
