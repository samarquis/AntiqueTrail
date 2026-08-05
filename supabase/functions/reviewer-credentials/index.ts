import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  parseReviewerCredentialCommand,
  parseReviewerVerification,
} from '../_shared/reviewer-credentials.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const verifierJwt = Deno.env.get('REVIEW_CREDENTIAL_VERIFIER_JWT')
const verifierToken = Deno.env.get('REVIEW_CREDENTIAL_PROVIDER_TOKEN')
const verifierUrl = exactHttps(Deno.env.get('REVIEW_CREDENTIAL_VERIFY_URL'))
const appOrigin = Deno.env.get('APP_ORIGIN')
const enabled = Deno.env.get('REVIEW_CREDENTIAL_PROVIDER_ACCEPTED') === 'true'
const configuredTimeout = Number(Deno.env.get('REVIEW_CREDENTIAL_TIMEOUT_MS') ?? '15000')
const timeoutMs = Number.isInteger(configuredTimeout)
  ? Math.min(30_000, Math.max(100, configuredTimeout))
  : 15_000

function exactHttps(raw: string | undefined): string | undefined {
  if (!raw) return
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
      ? url.toString()
      : undefined
  } catch {
    return
  }
}

function response(status: number, body: unknown, origin?: string): Response {
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
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-max-age': '600',
        vary: 'origin',
      },
    })
  if (request.method !== 'POST' || !enabled || !supabaseUrl || !anonKey)
    return response(503, { status: 'disabled' }, appOrigin)
  const bearer = request.headers.get('authorization')
  if (!bearer?.startsWith('Bearer ')) return response(404, { status: 'unavailable' }, appOrigin)
  try {
    const command = parseReviewerCredentialCommand(await request.json())
    const user = createClient(supabaseUrl, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    if (command.operation === 'request_registration' || command.operation === 'request_assertion') {
      const rpc = await user.rpc('reviews_request_reviewer_capability_challenge', {
        p_capability_token: command.payload.capabilityToken,
        p_ceremony: command.operation === 'request_assertion' ? 'assertion' : 'registration',
        p_idempotency_key: command.payload.idempotencyKey,
      })
      if (rpc.error) throw new Error('unavailable')
      return response(200, rpc.data, appOrigin)
    }
    if (command.operation === 'revoke' || command.operation === 'list') {
      const rpc = await user.rpc('reviews_manage_reviewer_credentials', {
        p_operation: command.operation,
        p_capability_token: command.payload.capabilityToken,
        p_credential_record_id:
          command.operation === 'revoke' ? command.payload.credentialRecordId : null,
        p_idempotency_key: command.payload.idempotencyKey,
      })
      if (rpc.error) throw new Error('unavailable')
      return response(200, rpc.data, appOrigin)
    }
    if (!verifierJwt || !verifierUrl || !verifierToken)
      return response(503, { status: 'provider_no_go' }, appOrigin)
    const verification = await fetch(verifierUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${verifierToken}`,
        'content-type': 'application/json',
        'idempotency-key': command.payload.idempotencyKey,
      },
      body: JSON.stringify({
        ceremony: command.operation === 'complete_registration' ? 'registration' : 'assertion',
        challengeId: command.payload.challengeId,
        response: command.payload.ceremony,
      }),
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!verification.ok || !verification.headers.get('content-type')?.includes('application/json'))
      return response(503, { status: 'verification_unavailable' }, appOrigin)
    const proof = parseReviewerVerification(
      command.operation === 'complete_registration' ? 'registration' : 'assertion',
      command.payload.challengeId,
      await verification.json(),
    )
    const service = createClient(supabaseUrl, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: `Bearer ${verifierJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const rpc =
      command.operation === 'complete_registration'
        ? await service.rpc('reviews_complete_reviewer_registration', {
            p_challenge_id: command.payload.challengeId,
            p_credential_id_digest: `\\x${proof.credentialIdDigest}`,
            p_public_key_digest: `\\x${proof.publicKeyDigest}`,
            p_provider_credential_id: proof.providerCredentialId,
            p_provider_verification_id: proof.providerVerificationId,
            p_provider_key_id: proof.providerKeyId,
            p_discoverable: proof.discoverable,
            p_sign_count: proof.signCount,
          })
        : await service.rpc('reviews_complete_reviewer_assertion', {
            p_challenge_id: command.payload.challengeId,
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
