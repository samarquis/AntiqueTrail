export type SessionState = 'active' | 'cancellation_only' | 'revoked'
export type AccountState = 'pending_verification' | 'active' | 'deletion_scheduled' | 'deleted'
export type AuthRole = 'shopper' | 'administrator' | 'representative'

export interface AppSession {
  state: SessionState
  accountState: AccountState
  role: AuthRole
  sessionEpoch: number
  currentEpoch: number
  expiresAt?: number
  revokedAt?: number
}

/**
 * Credentials captured by the preflight. Email links carry a token hash; social
 * returns carry a PKCE code (or the provider's cancellation error).
 */
export type AuthCallback =
  | { kind: 'verify' | 'recovery'; tokenHash: string }
  | { kind: 'oauth'; code?: string; oauthError?: string }

export const GENERIC_AUTH_FAILURE =
  'We could not complete that request. Check your details or try again.'

/** Public routes stay usable anonymously; every private route fails closed. */
export function authorizeRoute(
  path: string,
  session?: AppSession,
): 'public' | 'authenticated' | 'forbidden' {
  if (/^\/stores(?:\/|$)/.test(path)) return 'public'
  if (/^\/auth\/(?:sign-in|recovery|callback|verify|register)(?:\/|$)/.test(path)) return 'public'
  if (!session || !isSessionActive(session)) return 'forbidden'
  if (/^\/admin(?:\/|$)/.test(path) && session.role !== 'administrator') return 'forbidden'
  if (
    /^\/partner(?:\/|$)/.test(path) &&
    session.role !== 'representative' &&
    session.role !== 'administrator'
  )
    return 'forbidden'
  return 'authenticated'
}

export function isSessionActive(session: AppSession, now = Date.now()): boolean {
  return (
    session.state === 'active' &&
    session.accountState === 'active' &&
    session.sessionEpoch === session.currentEpoch &&
    (session.expiresAt == null || session.expiresAt > now) &&
    session.revokedAt == null
  )
}

/** Callback fragments are parsed once; callers must immediately replace the URL and never persist the token. */
export function parseAuthCallback(hash: string): AuthCallback | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  if (!tokenHash || (type !== 'verify' && type !== 'recovery')) return null
  return { kind: type, tokenHash }
}

export function scrubCallbackUrl(kind: AuthCallback['kind'] = 'verify'): string {
  return kind === 'recovery' ? '/auth/recovery' : '/auth/verify'
}

export function genericAuthFailure(): { ok: false; message: string } {
  return { ok: false, message: GENERIC_AUTH_FAILURE }
}
