export type AccountRole = 'Shopper' | 'Representative' | 'Administrator'

export interface AuthSession {
  userId: string
  /** Access tokens are intentionally held only in the in-memory auth store. */
  accessToken: string
  expiresAt: number
  role: AccountRole
  mfaRequired: boolean
  mfaVerified: boolean
}

export interface ProviderSession {
  userId: string
  accessToken: string
  expiresAt: number
  role?: AccountRole
  mfaRequired?: boolean
}

export type ProviderSignInResult =
  | { kind: 'authenticated'; session: ProviderSession }
  | { kind: 'mfa_required'; challengeId: string; session: ProviderSession }
  | { kind: 'error' }

export interface AuthProviderAdapter {
  signIn(email: string, password: string): Promise<ProviderSignInResult>
  sendRecovery(email: string): Promise<void>
  verifyMfa(challengeId: string, code: string): Promise<ProviderSession | null>
  signOut(session: AuthSession): Promise<void>
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
