import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { handleAccountRegistration } from '../_shared/account-registration.ts'
import { validateRegistrationEndpoints, withDeadline } from '../_shared/registration-config.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() ?? ''
const appOrigin = Deno.env.get('APP_ORIGIN')
const approvedAppOrigin = Deno.env.get('REGISTRATION_APPROVED_APP_ORIGIN')
const emailHmacSecret = Deno.env.get('REGISTRATION_EMAIL_HMAC_SECRET')?.trim() ?? 'unused'
const approvedSupabaseOrigin = Deno.env.get('REGISTRATION_APPROVED_SUPABASE_ORIGIN')
const localMode = Deno.env.get('REGISTRATION_LOCAL_MODE') === 'true'
const timeoutMs = Number(Deno.env.get('REGISTRATION_PROVIDER_TIMEOUT_MS') ?? 10_000)
const publicTest = Deno.env.get('PUBLIC_TEST_MODE') === 'true' // hosted built-in email path; redeploy picks current secrets

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  const allowedOrigin = origin && appOrigin && origin === appOrigin ? origin : null
  if (request.method === 'OPTIONS')
    return new Response(null, { status: allowedOrigin ? 204 : 403, headers: cors(allowedOrigin) })
  if (request.method !== 'POST' || !allowedOrigin)
    return Response.json(
      { state: 'blocked' },
      {
        status: 403,
        headers: { ...cors(allowedOrigin), 'Cache-Control': 'no-store' },
      },
    )
  if (
    publicTest &&
    (url !== 'https://uaupykgpegbseboklubv.supabase.co' ||
      appOrigin !== 'https://antique-trail.vercel.app')
  )
    return Response.json(
      { state: 'error' },
      {
        status: 503,
        headers: { ...cors(allowedOrigin), 'Cache-Control': 'no-store' },
      },
    )
  let endpoints: { appOrigin: string; mailEndpoint: string; supabaseOrigin: string } | null = null
  try {
    if (
      appOrigin &&
      approvedAppOrigin &&
      url &&
      approvedSupabaseOrigin
    )
      endpoints = validateRegistrationEndpoints({
        appOrigin,
        approvedAppOrigin,
        mailEndpoint: 'https://supabase.invalid/send',
        approvedMailEndpoint: 'https://supabase.invalid/send',
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
      anonKey &&
      appOrigin &&
      emailHmacSecret &&
      emailHmacSecret.length >= 32 &&
      endpoints,
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
      if (!url || !endpoints) throw new Error('unavailable')
      const appCallbackUrl = `${endpoints.appOrigin}/auth/callback`
      const signupUrl = new URL('/auth/v1/signup', endpoints.supabaseOrigin)
      signupUrl.searchParams.set('redirect_to', appCallbackUrl)
      const response = await withDeadline(timeoutMs, (signal) =>
        fetch(signupUrl, {
          method: 'POST',
          signal,
          headers: {
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: input.email,
            password: input.password,
            data: { antique_trail_admission_id: input.admissionId },
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
        hashed_token?: unknown
        id?: unknown
      }
      const providerUserId =
        typeof generated.user?.id === 'string' ? generated.user.id : generated.id
      if (typeof providerUserId !== 'string')
        return { outcome: 'unknown' }
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
    async deliver() {
      return 'confirmed_delivered'
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
      const outcome = 'confirmed_delivered' as const
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
