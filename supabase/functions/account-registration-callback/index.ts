import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { validateRegistrationEndpoints } from '../_shared/registration-config.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const appOrigin = Deno.env.get('APP_ORIGIN')

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  const allowedOrigin = origin && appOrigin && origin === appOrigin ? origin : null
  if (request.method === 'OPTIONS')
    return new Response(null, { status: allowedOrigin ? 204 : 403, headers: cors(allowedOrigin) })
  let payload: Record<string, unknown> = { state: 'error' }
  try {
    const body = (await request.json()) as { kind?: unknown; tokenHash?: unknown }
    if (!url || !anonKey || !serviceKey || typeof body.tokenHash !== 'string')
      throw new Error('unavailable')
    validateRegistrationEndpoints({
      appOrigin: appOrigin ?? '',
      approvedAppOrigin: Deno.env.get('REGISTRATION_APPROVED_APP_ORIGIN') ?? '',
      mailEndpoint: Deno.env.get('REGISTRATION_MAIL_ENDPOINT') ?? '',
      approvedMailEndpoint: Deno.env.get('REGISTRATION_APPROVED_MAIL_ENDPOINT') ?? '',
      supabaseUrl: url,
      approvedSupabaseOrigin: Deno.env.get('REGISTRATION_APPROVED_SUPABASE_ORIGIN') ?? '',
      localMode: Deno.env.get('REGISTRATION_LOCAL_MODE') === 'true',
    })
    if (body.kind !== 'verify' && body.kind !== 'recovery') throw new Error('unavailable')
    const verifier = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const result = await verifier.auth.verifyOtp({
      token_hash: body.tokenHash,
      type: body.kind === 'verify' ? 'email' : 'recovery',
    })
    if (result.error || !result.data.session || !result.data.user) throw new Error('unavailable')
    if (body.kind === 'verify') {
      const admin = createClient(url, serviceKey, { db: { schema: 'app_public' } })
      const enqueueCleanup = async (admissionId: string | null) => {
        const queued = await admin.rpc('enqueue_account_registration_cleanup', {
          p_admission_id: admissionId,
          p_provider_user_id: result.data.user!.id,
        })
        const cleanup = queued.data as {
          cleanupTicketId?: unknown
          providerUserId?: unknown
          state?: unknown
        } | null
        if (
          queued.error ||
          !cleanup ||
          typeof cleanup.cleanupTicketId !== 'string' ||
          cleanup.providerUserId !== result.data.user!.id ||
          !['pending', 'calling', 'reconciliation_required', 'escalated'].includes(
            String(cleanup.state),
          )
        )
          throw queued.error ?? new Error('cleanup ticket unavailable')
      }
      const admissionMetadata = result.data.user.user_metadata.antique_trail_admission_id
      const admissionId =
        typeof admissionMetadata === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          admissionMetadata,
        )
          ? admissionMetadata
          : null
      if (!admissionId) {
        await enqueueCleanup(null)
        payload = { state: 'blocked' }
      } else {
        const completion = await admin.rpc('complete_account_registration_callback', {
          p_admission_id: admissionId,
          p_provider_user_id: result.data.user.id,
        })
        if (completion.error || completion.data !== true) {
          await enqueueCleanup(admissionId)
          payload = { state: 'blocked' }
        } else payload = { state: 'authenticated', session: result.data.session }
      }
    } else payload = { state: 'authenticated', session: result.data.session }
  } catch {
    payload = { state: 'error' }
  }
  return Response.json(payload, {
    status: payload.state === 'error' ? 503 : 200,
    headers: { ...cors(allowedOrigin), 'Cache-Control': 'no-store' },
  })
})

function cors(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
