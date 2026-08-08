import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { runRegistrationCleanup } from '../_shared/account-registration-cleanup.ts'
import { validateRegistrationEndpoints, withDeadline } from '../_shared/registration-config.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}
const url = Deno.env.get('SUPABASE_URL'),
  serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const timeoutMs = Number(Deno.env.get('REGISTRATION_PROVIDER_TIMEOUT_MS') ?? 10_000)

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  try {
    const schedulerSecret = Deno.env.get('REGISTRATION_CLEANUP_SCHEDULER_SECRET')
    if (
      !url ||
      !serviceKey ||
      !schedulerSecret ||
      schedulerSecret.length < 32 ||
      request.headers.get('x-antique-trail-scheduler') !== schedulerSecret
    )
      return Response.json({ state: 'unauthorized' }, { status: 401 })
    const endpoint = validateRegistrationEndpoints({
      appOrigin: Deno.env.get('APP_ORIGIN') ?? '',
      approvedAppOrigin: Deno.env.get('REGISTRATION_APPROVED_APP_ORIGIN') ?? '',
      mailEndpoint: Deno.env.get('REGISTRATION_MAIL_ENDPOINT') ?? '',
      approvedMailEndpoint: Deno.env.get('REGISTRATION_APPROVED_MAIL_ENDPOINT') ?? '',
      supabaseUrl: url,
      approvedSupabaseOrigin: Deno.env.get('REGISTRATION_APPROVED_SUPABASE_ORIGIN') ?? '',
      localMode: Deno.env.get('REGISTRATION_LOCAL_MODE') === 'true',
    })
    const admin = createClient(url, serviceKey, {
      db: { schema: 'app_public' },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const rpc = async <T>(name: string, args: Record<string, unknown> = {}) => {
      const result = await admin.rpc(name, args)
      if (result.error) throw result.error
      return result.data as T
    }
    const provider = async (providerUserId: string) =>
      withDeadline(timeoutMs, (signal) =>
        fetch(
          `${endpoint.supabaseOrigin}/auth/v1/admin/users/${encodeURIComponent(providerUserId)}`,
          {
            method: 'DELETE',
            signal,
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          },
        ),
      )
    const state = await runRegistrationCleanup({
      claim: () => rpc('claim_account_registration_cleanup'),
      begin: (cleanupTicketId, providerUserId) =>
        rpc('begin_account_registration_cleanup', {
          p_cleanup_ticket_id: cleanupTicketId,
          p_provider_user_id: providerUserId,
        }),
      async deleteExact(providerUserId) {
        try {
          const response = await provider(providerUserId)
          return response.ok || response.status === 404
            ? 'confirmed_deleted'
            : response.status < 500
              ? 'confirmed_not_deleted'
              : 'unknown'
        } catch {
          return 'unknown'
        }
      },
      settle: (cleanupTicketId, providerUserId, outcome) =>
        rpc('settle_account_registration_cleanup', {
          p_cleanup_ticket_id: cleanupTicketId,
          p_provider_user_id: providerUserId,
          p_outcome: outcome,
        }),
      reconcile: (cleanupTicketId, providerUserId) =>
        rpc('reconcile_account_registration_cleanup', {
          p_cleanup_ticket_id: cleanupTicketId,
          p_provider_user_id: providerUserId,
        }),
    })
    return Response.json(
      { state },
      { status: state === 'escalated' ? 409 : 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { state: 'error' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
})
