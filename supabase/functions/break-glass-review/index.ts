import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  parseBreakGlassReviewCommand,
  parseBreakGlassVerification,
} from '../_shared/break-glass-review.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}
const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const verifierJwt = Deno.env.get('REVIEW_CREDENTIAL_VERIFIER_JWT')
const verifierToken = Deno.env.get('REVIEW_CREDENTIAL_PROVIDER_TOKEN')
const verifierUrl = Deno.env.get('REVIEW_CREDENTIAL_VERIFY_URL')
const appOrigin = Deno.env.get('APP_ORIGIN')
const enabled = Deno.env.get('BREAK_GLASS_REVIEW_ACCEPTED') === 'true'

function response(status: number, body: unknown, origin?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
    },
  })
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? undefined
  if (!appOrigin || origin !== appOrigin) return response(404, { status: 'unavailable' })
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': appOrigin,
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type',
        vary: 'origin',
      },
    })
  if (request.method !== 'POST' || !enabled || !url || !anonKey)
    return response(503, { status: 'disabled' }, appOrigin)
  try {
    const command = parseBreakGlassReviewCommand(await request.json())
    const capability = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    if (command.operation === 'packet') {
      const result = await capability.rpc('reviews_get_break_glass_packet', {
        p_capability_token: command.payload.capabilityToken,
      })
      if (result.error) throw new Error('unavailable')
      return response(200, result.data, appOrigin)
    }
    if (command.operation === 'request_assertion') {
      const result = await capability.rpc('reviews_request_break_glass_assertion', {
        p_capability_token: command.payload.capabilityToken,
        p_idempotency_key: command.payload.idempotencyKey,
      })
      if (result.error) throw new Error('unavailable')
      return response(200, result.data, appOrigin)
    }
    if (command.operation === 'submit') {
      const result = await capability.rpc('reviews_submit_break_glass_review', {
        p_capability_token: command.payload.capabilityToken,
        p_assertion_receipt_id: command.payload.assertionReceiptId,
        p_packet_hash: `\\x${command.payload.packetHash}`,
        p_decision: command.payload.decision,
        p_reason: command.payload.reason,
        p_follow_up_reference: command.payload.followUpReference,
        p_idempotency_key: command.payload.idempotencyKey,
      })
      if (result.error) throw new Error('unavailable')
      return response(200, result.data, appOrigin)
    }
    if (!verifierJwt || !verifierToken || !verifierUrl)
      return response(503, { status: 'provider_no_go' }, appOrigin)
    const verification = await fetch(verifierUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${verifierToken}`,
        'content-type': 'application/json',
        'idempotency-key': command.payload.idempotencyKey,
      },
      body: JSON.stringify({
        ceremony: 'assertion',
        challengeId: command.payload.challengeId,
        response: command.payload.ceremony,
      }),
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!verification.ok) return response(503, { status: 'verification_unavailable' }, appOrigin)
    const proof = parseBreakGlassVerification(
      command.payload.challengeId,
      await verification.json(),
    )
    const service = createClient(url, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: `Bearer ${verifierJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const result = await service.rpc('reviews_complete_break_glass_assertion', {
      p_challenge_id: proof.challengeId,
      p_credential_id_digest: `\\x${proof.credentialIdDigest}`,
      p_assertion_digest: `\\x${proof.assertionDigest}`,
      p_provider_verification_id: proof.providerVerificationId,
      p_provider_key_id: proof.providerKeyId,
      p_sign_count: proof.signCount,
    })
    if (result.error) throw new Error('unavailable')
    return response(200, result.data, appOrigin)
  } catch {
    return response(503, { status: 'unavailable' }, appOrigin)
  }
})
