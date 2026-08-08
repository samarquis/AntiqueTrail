import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { handleAccountRegistration } from '../_shared/account-registration.ts'
import { validateRegistrationEndpoints, withDeadline } from '../_shared/registration-config.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const appOrigin = Deno.env.get('APP_ORIGIN')
const approvedAppOrigin = Deno.env.get('REGISTRATION_APPROVED_APP_ORIGIN')
const emailHmacSecret = Deno.env.get('REGISTRATION_EMAIL_HMAC_SECRET')
const mailEndpoint = Deno.env.get('REGISTRATION_MAIL_ENDPOINT')
const mailToken = Deno.env.get('REGISTRATION_MAIL_TOKEN')
const approvedMailEndpoint = Deno.env.get('REGISTRATION_APPROVED_MAIL_ENDPOINT')
const approvedSupabaseOrigin = Deno.env.get('REGISTRATION_APPROVED_SUPABASE_ORIGIN')
const localMode = Deno.env.get('REGISTRATION_LOCAL_MODE') === 'true'
const timeoutMs = Number(Deno.env.get('REGISTRATION_PROVIDER_TIMEOUT_MS') ?? 10_000)

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  const allowedOrigin = origin && appOrigin && origin === appOrigin ? origin : null
  if (request.method === 'OPTIONS')
    return new Response(null, { status: allowedOrigin ? 204 : 403, headers: cors(allowedOrigin) })
  let endpoints: { appOrigin: string; mailEndpoint: string; supabaseOrigin: string } | null = null
  try {
    if (
      appOrigin &&
      approvedAppOrigin &&
      mailEndpoint &&
      approvedMailEndpoint &&
      url &&
      approvedSupabaseOrigin
    )
      endpoints = validateRegistrationEndpoints({
        appOrigin,
        approvedAppOrigin,
        mailEndpoint,
        approvedMailEndpoint,
        supabaseUrl: url,
        approvedSupabaseOrigin,
        localMode,
      })
  } catch {
    endpoints = null
  }
  const configured = Boolean(
    url &&
      serviceKey &&
      appOrigin &&
      emailHmacSecret &&
      emailHmacSecret.length >= 32 &&
      endpoints &&
      mailToken,
  )
  const admin = configured
    ? createClient(url, serviceKey, {
        db: { schema: 'app_public' },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    if (!admin) throw new Error('unavailable')
    const result = await admin.rpc(name, args)
    if (result.error) throw result.error
    return result.data as T
  }
  const response = await handleAccountRegistration(request, {
    async reserve(input) {
      if (!configured) throw new Error('unavailable')
      return rpc('begin_account_registration', {
        p_email_hmac: await hmac(input.email, emailHmacSecret),
        p_age_18_attestation: input.ageAttested,
        p_idempotency_key: input.requestId,
      })
    },
    async begin(operationId, admissionId, requestId, kind) {
      return rpc('begin_account_registration_operation', {
        p_operation_id: operationId,
        p_admission_id: admissionId,
        p_idempotency_key: requestId,
        p_kind: kind,
      })
    },
    async generate(input) {
      if (!serviceKey || !url || !endpoints) throw new Error('unavailable')
      const response = await withDeadline(timeoutMs, (signal) =>
        fetch(`${endpoints.supabaseOrigin}/auth/v1/admin/generate_link`, {
          method: 'POST',
          signal,
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'signup',
            email: input.email,
            password: input.password,
            data: { antique_trail_admission_id: input.admissionId },
            redirect_to: `${endpoints.appOrigin}/auth/callback`,
          }),
        }),
      )
      if (!response.ok)
        return response.status >= 400 && response.status < 500
          ? { outcome: 'confirmed_not_generated' }
          : { outcome: 'unknown' }
      const generated = (await response.json()) as {
        properties?: { hashed_token?: unknown }
        user?: { id?: unknown }
      }
      const hashedToken = generated.properties?.hashed_token
      const providerUserId = generated.user?.id
      if (typeof hashedToken !== 'string' || typeof providerUserId !== 'string')
        return { outcome: 'unknown' }
      // The provider action_link is deliberately discarded. Only the approved app callback is delivered.
      const appCallbackUrl = `${endpoints.appOrigin}/auth/callback#token_hash=${encodeURIComponent(hashedToken)}&type=verify`
      return { outcome: 'confirmed_generated', appCallbackUrl, providerUserId }
    },
    async settleGenerate(input) {
      return rpc('settle_account_registration_generate', {
        p_operation_id: input.operationId,
        p_admission_id: input.admissionId,
        p_idempotency_key: input.requestId,
        p_outcome: input.outcome,
        p_provider_user_id: input.providerUserId ?? null,
      })
    },
    async deliver(input) {
      if (!endpoints || !mailToken) throw new Error('unavailable')
      const response = await withDeadline(timeoutMs, (signal) =>
        fetch(endpoints.mailEndpoint, {
          method: 'POST',
          signal,
          headers: {
            Authorization: `Bearer ${mailToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `${input.requestId}:send-verification`,
          },
          body: JSON.stringify({ recipient: input.email, verificationUrl: input.appCallbackUrl }),
        }),
      )
      if (!response.ok)
        return response.status >= 400 && response.status < 500
          ? 'confirmed_not_delivered'
          : 'unknown'
      const result = (await response.json().catch(() => null)) as { delivered?: unknown } | null
      return result?.delivered === true ? 'confirmed_delivered' : 'unknown'
    },
    async settleDelivery(input) {
      return rpc('settle_account_registration_delivery', {
        p_operation_id: input.operationId,
        p_admission_id: input.admissionId,
        p_idempotency_key: input.requestId,
        p_outcome: input.outcome,
      })
    },
    async reconcile(input) {
      if (input.kind === 'generate_link') {
        const exact = await rpc<{
          state: 'found' | 'absent' | 'duplicate'
          providerUserId?: string
        }>('registration_exact_provider_for_admission', { p_admission_id: input.admissionId })
        const result = await rpc<{ state: string }>('reconcile_account_registration_generate', {
          p_operation_id: input.operationId,
          p_admission_id: input.admissionId,
          p_idempotency_key: input.requestId,
          p_provider_state: exact.state,
          p_provider_user_id: exact.providerUserId ?? null,
        })
        return {
          state: result.state === 'reconciliation_required' ? 'reconciliation_required' : 'blocked',
        }
      }
      if (!endpoints || !mailToken) throw new Error('unavailable')
      let outcome: 'confirmed_delivered' | 'confirmed_not_delivered' | 'unknown' = 'unknown'
      try {
        const statusUrl = new URL('/status', endpoints.mailEndpoint).href
        const response = await withDeadline(timeoutMs, (signal) =>
          fetch(statusUrl, {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${mailToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ idempotencyKey: `${input.requestId}:send-verification` }),
          }),
        )
        if (response.ok) {
          const body = (await response.json()) as { outcome?: unknown }
          if (body.outcome === 'confirmed_delivered' || body.outcome === 'confirmed_not_delivered')
            outcome = body.outcome
        }
      } catch {
        outcome = 'unknown'
      }
      return rpc('reconcile_account_registration_delivery', {
        p_operation_id: input.operationId,
        p_admission_id: input.admissionId,
        p_idempotency_key: input.requestId,
        p_outcome: outcome,
      })
    },
  })
  const headers = new Headers(response.headers)
  Object.entries(cors(allowedOrigin)).forEach(([name, value]) => headers.set(name, value))
  return new Response(response.body, { status: response.status, headers })
})

function cors(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
async function hmac(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const value = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(email.normalize('NFKC').trim().toLocaleLowerCase('en-US')),
    ),
  )
  return `\\x${[...value].map((item) => item.toString(16).padStart(2, '0')).join('')}`
}
