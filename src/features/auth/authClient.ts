import type {
  AuthProviderAdapter,
  AccountRole,
  AuthSession,
  AuthStore,
  ProviderSession,
  SessionRegistryClient,
} from './types'

export const GENERIC_SIGN_IN_ERROR = "We couldn't sign you in. Check your details and try again."
export const GENERIC_RECOVERY_MESSAGE =
  'If an account exists for that email, we will send recovery instructions.'
export const GENERIC_MFA_ERROR = "We couldn't verify that code. Try again."

/**
 * An intentionally tiny token boundary. It has no browser-storage fallback: a refresh
 * or tab close removes the access token, requiring a new provider sign-in.
 */
export class InMemoryAuthStore implements AuthStore {
  #session: AuthSession | null = null

  getSession(): AuthSession | null {
    return this.#session
  }

  setSession(session: AuthSession): void {
    this.#session = { ...session }
  }

  clearSession(): void {
    this.#session = null
  }
}

export class InMemorySessionRegistry implements SessionRegistryClient {
  #active = new Map<string, string>()

  async registerCurrentSession(session: AuthSession): Promise<void> {
    this.#active.set(session.userId, session.accessToken)
  }

  async isActive(session: AuthSession): Promise<boolean> {
    return (
      this.#active.get(session.userId) === session.accessToken && session.expiresAt > Date.now()
    )
  }

  async revoke(session: AuthSession): Promise<void> {
    if (this.#active.get(session.userId) === session.accessToken)
      this.#active.delete(session.userId)
  }
}

export function toAuthSession(
  provider: ProviderSession,
  defaults?: { role?: AccountRole; mfaVerified?: boolean },
): AuthSession {
  return {
    userId: provider.userId,
    accessToken: provider.accessToken,
    expiresAt: provider.expiresAt,
    role: provider.role ?? defaults?.role ?? 'Shopper',
    mfaRequired: provider.mfaRequired ?? false,
    mfaVerified: defaults?.mfaVerified ?? !provider.mfaRequired,
  }
}

export const unavailableAuthProvider: AuthProviderAdapter = {
  async signIn() {
    return { kind: 'error' }
  },
  async sendRecovery() {
    return undefined
  },
  async verifyMfa() {
    return null
  },
  async signOut() {
    return undefined
  },
}
