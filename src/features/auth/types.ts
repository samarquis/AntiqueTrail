export type AccountRole = 'Shopper' | 'Representative' | 'Administrator'

export interface AuthSession {
  userId: string
  /** Display-only identity metadata supplied by the verified provider session. */
  email?: string
  emailVerified?: boolean
  /** Access tokens are intentionally held only in the in-memory auth store. */
  accessToken: string
  expiresAt: number
  role: AccountRole
  mfaRequired: boolean
  mfaVerified: boolean
  passwordAuthenticatedAt?: string
  mfaEnrolled?: boolean
  mfaVerifiedAt?: string
  accountState?: 'active' | 'deletion_scheduled'
  deletionDueAt?: string
}

export interface ProviderSession {
  userId: string
  email?: string
  emailVerified?: boolean
  accessToken: string
  expiresAt: number
  role?: AccountRole
  mfaRequired?: boolean
  passwordAuthenticatedAt?: string
  mfaEnrolled?: boolean
  mfaVerifiedAt?: string
}

export type ProviderSignInResult =
  | { kind: 'authenticated'; session: ProviderSession }
  | { kind: 'mfa_required'; challengeId: string; session: ProviderSession }
  | { kind: 'error' }

export interface RegistrationRequest {
  email: string
  password: string
  ageAttested: boolean
  /** Stable for retries of one unchanged browser attempt. */
  requestId: string
}

export type ProviderRegistrationResult =
  | { kind: 'pending_verification' }
  | { kind: 'blocked' }
  | { kind: 'error' }

export type ProviderCallbackResult =
  | { kind: 'authenticated'; session: ProviderSession }
  | { kind: 'verified' }
  | { kind: 'blocked' }
  | { kind: 'error' }

export interface AuthProviderAdapter {
  signIn(email: string, password: string): Promise<ProviderSignInResult>
  sendRecovery(email: string): Promise<void>
  verifyMfa(challengeId: string, code: string): Promise<ProviderSession | null>
  signOut(session: AuthSession): Promise<void>
  register?(request: RegistrationRequest): Promise<ProviderRegistrationResult>
  verifyCallback?(kind: 'verify' | 'recovery', tokenHash: string): Promise<ProviderCallbackResult>
}

export interface SessionRegistryClient {
  registerCurrentSession(session: AuthSession): Promise<void>
  isActive(session: AuthSession): Promise<boolean>
  revoke(session: AuthSession, reason?: string): Promise<void>
}

export interface AuthStore {
  getSession(): AuthSession | null
  setSession(session: AuthSession): void
  clearSession(): void
}
