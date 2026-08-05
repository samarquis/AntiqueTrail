import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { parseRG01Command } from '../_shared/rg01-command.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const calculationJwt = Deno.env.get('RG01_CALCULATION_JWT')
const signatureJwt = Deno.env.get('RG01_SIGNATURE_JWT')
const signingToken = Deno.env.get('RG01_SIGNING_PROVIDER_TOKEN')
const signingUrl = exactHttps(Deno.env.get('RG01_SIGNING_VERIFY_URL'))
const appOrigin = Deno.env.get('APP_ORIGIN')
const enabled = Deno.env.get('RG01_OPERATIONS_ENABLED') === 'true'
const configuredTimeout = Number(Deno.env.get('RG01_SIGNING_TIMEOUT_MS') ?? '15000')
const signingTimeoutMs = Number.isInteger(configuredTimeout)
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

function reply(status: number, body: unknown, origin?: string): Response {
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
  if (!appOrigin || origin !== appOrigin) return reply(404, { status: 'unavailable' })
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
    return reply(503, { status: 'disabled' }, appOrigin)
  const bearer = request.headers.get('authorization')
  if (!bearer?.startsWith('Bearer ')) return reply(404, { status: 'unavailable' }, appOrigin)
  try {
    const command = parseRG01Command(await request.json())
    const user = createClient(supabaseUrl, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    if (command.operation === 'status') {
      const rpc = await user.rpc('rg01_get_operational_status', {
        p_run_id: command.payload.runId ?? null,
      })
      if (rpc.error) throw new Error('unavailable')
      return reply(200, rpc.data, appOrigin)
    }
    if (command.operation === 'request_decision') {
      const rpc = await user.rpc('rg01_request_decision_challenge', {
        p_run_id: command.payload.runId,
        p_decision: command.payload.decision,
        p_idempotency_key: command.payload.idempotencyKey,
      })
      if (rpc.error) throw new Error('unavailable')
      return reply(200, rpc.data, appOrigin)
    }
    const authorization = await user.rpc('rg01_get_operational_status', { p_run_id: null })
    if (authorization.error) return reply(404, { status: 'unavailable' }, appOrigin)
    if (command.operation === 'consume_decision') {
      if (!signatureJwt || !signingUrl || !signingToken)
        return reply(503, { status: 'no_go' }, appOrigin)
      const verification = await fetch(signingUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${signingToken}`,
          'content-type': 'application/json',
          'idempotency-key': command.payload.idempotencyKey,
        },
        body: JSON.stringify({
          challengeId: command.payload.challengeId,
          payloadDigest: command.payload.payloadDigest,
        }),
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(signingTimeoutMs),
      })
      if (
        !verification.ok ||
        !verification.headers.get('content-type')?.includes('application/json')
      )
        return reply(503, { status: 'verification_unavailable' }, appOrigin)
      const proof = (await verification.json()) as Record<string, unknown>
      if (
        typeof proof.signatureDigest !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(proof.signatureDigest) ||
        proof.challengeId !== command.payload.challengeId ||
        proof.payloadDigest !== command.payload.payloadDigest ||
        typeof proof.providerKeyId !== 'string' ||
        typeof proof.providerVerificationId !== 'string'
      )
        return reply(503, { status: 'verification_invalid' }, appOrigin)
      const service = createClient(supabaseUrl, anonKey, {
        db: { schema: 'app_public' },
        global: { headers: { authorization: `Bearer ${signatureJwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const rpc = await service.rpc('rg01_consume_verified_decision', {
        p_challenge_id: command.payload.challengeId,
        p_payload_digest: `\\x${command.payload.payloadDigest}`,
        p_signature_digest: `\\x${proof.signatureDigest}`,
        p_provider_key_id: proof.providerKeyId,
        p_provider_verification_id: proof.providerVerificationId,
        p_idempotency_key: command.payload.idempotencyKey,
      })
      if (rpc.error) throw new Error('unavailable')
      return reply(200, rpc.data, appOrigin)
    }
    if (!calculationJwt) return reply(503, { status: 'no_go' }, appOrigin)
    const service = createClient(supabaseUrl, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: `Bearer ${calculationJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const rpc = await service.rpc('rg01_execute_calculation', {
      p_operation: command.operation,
      p_payload: command.payload,
    })
    if (rpc.error) throw new Error('unavailable')
    return reply(200, rpc.data, appOrigin)
  } catch {
    return reply(503, { status: 'unavailable' }, appOrigin)
  }
})
