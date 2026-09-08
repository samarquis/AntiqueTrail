import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  parseAppealReviewCommand,
  parseAppealReviewVerifierOptions,
  parseAppealReviewVerifierProof,
} from '../_shared/appeal-review.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const verifierJwt = Deno.env.get('REVIEW_CREDENTIAL_VERIFIER_JWT')
const verifierToken = Deno.env.get('REVIEW_CREDENTIAL_PROVIDER_TOKEN')
const verifierUrl = exactHttps(Deno.env.get('REVIEW_CREDENTIAL_VERIFY_URL'))
const optionsUrl = exactHttps(Deno.env.get('REVIEW_CREDENTIAL_OPTIONS_URL'))
const appOrigin = Deno.env.get('APP_ORIGIN')
const enabled = Deno.env.get('APPEAL_REVIEW_ACCEPTED') === 'true'

function exactHttps(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const value = new URL(raw)
    return value.protocol === 'https:' && !value.username && !value.password && !value.hash
      ? value.toString()
      : undefined
  } catch {
    return undefined
  }
}

function response(status: number, body: unknown, origin?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/json; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
    },
  })
}

async function providerRequest(url: string, body: unknown, idempotencyKey: string) {
  if (!verifierToken) throw new Error('provider unavailable')
  const result = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${verifierToken}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
    redirect: 'error',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15_000),
  })
  if (!result.ok || !result.headers.get('content-type')?.includes('application/json'))
    throw new Error('provider unavailable')
  return result.json()
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
  if (request.method !== 'POST' || !enabled || !supabaseUrl || !anonKey)
    return response(503, { status: 'disabled' }, appOrigin)
  try {
    const command = parseAppealReviewCommand(await request.json())
    const capability = createClient(supabaseUrl, anonKey, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    if (command.operation === 'request_assertion') {
      if (!optionsUrl) return response(503, { status: 'provider_no_go' }, appOrigin)
      const rpc = await capability.rpc('reviews_request_independent_appeal_assertion', {
        p_capability_token: command.payload.capabilityToken,
        p_idempotency_key: command.payload.idempotencyKey,
      })
      if (rpc.error || !rpc.data) throw new Error('unavailable')
      const challenge = rpc.data as { challengeId: string; rpId: string; origin: string }
      const options = parseAppealReviewVerifierOptions(
        await providerRequest(
          optionsUrl,
          { ceremony: 'assertion', challenge },
          command.payload.idempotencyKey,
        ),
      )
      return response(200, { ...rpc.data, allowCredentials: options.allowCredentials }, appOrigin)
    }
    if (command.operation === 'packet') {
      const rpc = await capability.rpc('reviews_get_independent_appeal_packet', {
        p_capability_token: command.payload.capabilityToken,
        p_assertion_receipt_id: command.payload.assertionReceiptId,
      })
      if (rpc.error) throw new Error('unavailable')
      return response(200, rpc.data, appOrigin)
    }
    if (command.operation === 'submit') {
      const rpc = await capability.rpc('reviews_submit_independent_appeal', {
        p_capability_token: command.payload.capabilityToken,
        p_assertion_receipt_id: command.payload.assertionReceiptId,
        p_packet_hash: `\\x${command.payload.packetHash}`,
        p_outcome: command.payload.outcome,
        p_reason: command.payload.reason,
        p_idempotency_key: command.payload.idempotencyKey,
      })
      if (rpc.error) throw new Error('unavailable')
      return response(200, rpc.data, appOrigin)
    }
    if (!verifierJwt || !verifierUrl) return response(503, { status: 'provider_no_go' }, appOrigin)
    const proof = parseAppealReviewVerifierProof(
      command.payload.challengeId,
      await providerRequest(
        verifierUrl,
        {
          ceremony: 'assertion',
          challengeId: command.payload.challengeId,
          response: command.payload.ceremony,
        },
        command.payload.idempotencyKey,
      ),
    )
    const service = createClient(supabaseUrl, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: `Bearer ${verifierJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const rpc = await service.rpc('reviews_complete_independent_appeal_assertion', {
      p_challenge_id: proof.challengeId,
      p_credential_id_digest: `\\x${proof.credentialIdDigest}`,
      p_assertion_digest: `\\x${proof.assertionDigest}`,
      p_provider_verification_id: proof.providerVerificationId,
      p_provider_key_id: proof.providerKeyId,
      p_sign_count: proof.signCount,
    })
    if (rpc.error) throw new Error('unavailable')
    return response(200, rpc.data, appOrigin)
  } catch {
    return response(503, { status: 'unavailable' }, appOrigin)
  }
})
