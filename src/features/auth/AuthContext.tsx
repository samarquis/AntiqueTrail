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
        await resolvedRegistry.registerCurrentSession(next)
        resolvedStore.setSession(next)
        setSession(next)
      },
      async signOut() {
        const current = resolvedStore.getSession()
        if (current) {
          try {
            await onLocalSignOut?.(current)
          } finally {
            try {
              await resolvedRegistry.revoke(current, 'user_sign_out')
            } finally {
              resolvedStore.clearSession()
              setSession(null)
            }
          }
          // Provider logout is best-effort after the application has become locally signed out.
          try {
            await provider.signOut(current)
          } catch {
            // The revoked application session and local purge remain authoritative.
          }
          return
        }
        resolvedStore.clearSession()
        setSession(null)
      },
    }),
    [onLocalSignOut, provider, resolvedRegistry, resolvedStore, session],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
