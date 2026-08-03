import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { InMemoryAuthStore, InMemorySessionRegistry, unavailableAuthProvider } from './authClient'
import type { AuthProviderAdapter, AuthSession, AuthStore, SessionRegistryClient } from './types'

interface AuthContextValue {
  session: AuthSession | null
  signIn(session: AuthSession): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
  authStore,
  registry,
  provider = unavailableAuthProvider,
  onLocalSignOut,
}: {
  children: ReactNode
  authStore?: AuthStore
  registry?: SessionRegistryClient
  provider?: AuthProviderAdapter
  /** Purges account/install-bound local data (for example encrypted trip caches). */
  onLocalSignOut?: (session: AuthSession) => Promise<void> | void
}) {
  const authStoreRef = useRef<AuthStore>(authStore ?? new InMemoryAuthStore())
  const registryRef = useRef<SessionRegistryClient>(registry ?? new InMemorySessionRegistry())
  const resolvedStore = authStoreRef.current
  const resolvedRegistry = registryRef.current
  const [session, setSession] = useState<AuthSession | null>(() => resolvedStore.getSession())
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      async signIn(next) {
        resolvedStore.setSession(next)
        await resolvedRegistry.registerCurrentSession(next)
        setSession(next)
      },
      async signOut() {
        const current = resolvedStore.getSession()
        if (current) {
          await provider.signOut(current)
          await onLocalSignOut?.(current)
          await resolvedRegistry.revoke(current, 'user_sign_out')
        }
        resolvedStore.clearSession()
        setSession(null)
      },
    }),
    [onLocalSignOut, provider, resolvedRegistry, resolvedStore, session],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
