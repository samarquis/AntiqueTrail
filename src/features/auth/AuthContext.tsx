import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
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
  authStore = new InMemoryAuthStore(),
  registry = new InMemorySessionRegistry(),
  provider = unavailableAuthProvider,
}: {
  children: ReactNode
  authStore?: AuthStore
  registry?: SessionRegistryClient
  provider?: AuthProviderAdapter
}) {
  const [session, setSession] = useState<AuthSession | null>(() => authStore.getSession())
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      async signIn(next) {
        authStore.setSession(next)
        await registry.registerCurrentSession(next)
        setSession(next)
      },
      async signOut() {
        const current = authStore.getSession()
        if (current) {
          await provider.signOut(current)
          await registry.revoke(current, 'user_sign_out')
        }
        authStore.clearSession()
        setSession(null)
      },
    }),
    [authStore, provider, registry, session],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
