import { createClient, type Session } from 'npm:@supabase/supabase-js@2.49.1'
import {
  handlePasswordRecoveryCompletion,
  type PasswordRecoveryCompletionDependencies,
  type PasswordRecoveryDisposition,
  type VerifiedRecoveryCredential,
} from '../_shared/password-recovery-completion.ts'

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
  const response = await handlePasswordRecoveryCompletion(request, dependencies())
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(cors(allowedOrigin))) headers.set(name, value)
  return new Response(response.body, { status: response.status, headers })
})

function dependencies(): PasswordRecoveryCompletionDependencies {
  if (!url || !anonKey || !serviceKey) return unavailableDependencies()
  const verifier = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const admin = createClient(url, serviceKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return {
    async status(requestId): Promise<PasswordRecoveryDisposition> {
      const result = await admin.rpc('password_recovery_status', { p_request_id: requestId })
      if (result.error) throw result.error
      const state = result.data
      if (state === 'unknown' || state === 'invalidated' || state === 'completed' || state === 'uncertain')
        return state
      throw new Error('password_recovery_status_unavailable')
    },
    async verifyToken(tokenHash): Promise<VerifiedRecoveryCredential | null> {
      const result = await verifier.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      if (result.error || !result.data.session || !result.data.user) return null
      const sessionId = sessionIdFromAccessToken(result.data.session)
      if (!sessionId) return null
      return {
        userId: result.data.user.id,
        sessionId,
        accessToken: result.data.session.access_token,
      }
    },
    async invalidateApplicationSessions(input) {
      const result = await admin.rpc('begin_password_recovery', {
        p_request_id: input.requestId,
        p_user_id: input.userId,
        p_session_id: input.sessionId,
      })
      if (result.error || !result.data || typeof result.data !== 'object')
        throw result.error ?? new Error('password_recovery_begin_unavailable')
      const state = (result.data as { state?: unknown }).state
      if (state === 'ready' || state === 'completed' || state === 'retry_required') return state
      throw new Error('password_recovery_begin_unavailable')
    },
    async updatePassword(_credential, password) {
      const result = await verifier.auth.updateUser({ password })
      if (result.error) throw result.error
    },
    async revokeProviderSessions({ requestId }) {
      const result = await verifier.auth.signOut()
      if (result.error) throw result.error
      const settled = await admin.rpc('complete_provider_revocation', {
        p_idempotency_key: `${requestId}:provider-revoke`,
      })
      if (settled.error) throw settled.error
    },
    async complete(requestId) {
      const result = await admin.rpc('complete_password_recovery', { p_request_id: requestId })
      if (result.error || !result.data || typeof result.data !== 'object')
        throw result.error ?? new Error('password_recovery_complete_unavailable')
      const state = (result.data as { state?: unknown }).state
      return state === 'completed' ? 'completed' : 'retry_required'
    },
    async markUncertain(requestId) {
      await admin.rpc('mark_password_recovery_uncertain', { p_request_id: requestId })
    },
  }
}

function unavailableDependencies(): PasswordRecoveryCompletionDependencies {
  const unavailable = async (): Promise<never> => {
    throw new Error('password_recovery_unavailable')
  }
  return {
    status: unavailable,
    verifyToken: async () => null,
    invalidateApplicationSessions: unavailable,
    updatePassword: unavailable,
    revokeProviderSessions: unavailable,
    complete: unavailable,
    markUncertain: unavailable,
  }
}

function sessionIdFromAccessToken(session: Session): string | null {
  try {
    const payload = session.access_token.split('.')[1]
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/')
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as {
      session_id?: unknown
    }
    return typeof claims.session_id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        claims.session_id,
      )
      ? claims.session_id
      : null
  } catch {
    return null
  }
}

function cors(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
