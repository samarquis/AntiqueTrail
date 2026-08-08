import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { InMemoryAuthStore, InMemorySessionRegistry, unavailableAuthProvider } from './authClient'
import type { AuthProviderAdapter, AuthSession, AuthStore, SessionRegistryClient } from './types'
import type { AccountLifecycleClient } from './lifecycle'

interface AuthContextValue {
  session: AuthSession | null
  lifecycleReady: boolean
  signIn(session: AuthSession): Promise<void>
  signOut(): Promise<void>
  enterCancellationOnly(deletionDueAt?: string): void
  restoreActiveAccount(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
  authStore,
  registry,
  provider = unavailableAuthProvider,
  lifecycle,
  lifecycleHydrationTimeoutMs = 5_000,
  onLocalSignOut,
}: {
  children: ReactNode
  authStore?: AuthStore
  registry?: SessionRegistryClient
  provider?: AuthProviderAdapter
  lifecycle?: AccountLifecycleClient
  /** Test seam; production fails closed if authoritative status cannot resolve promptly. */
  lifecycleHydrationTimeoutMs?: number
  /** Purges account/install-bound local data (for example encrypted trip caches). */
  onLocalSignOut?: (session: AuthSession) => Promise<void> | void
}) {
  const authStoreRef = useRef<AuthStore>(authStore ?? new InMemoryAuthStore())
  const registryRef = useRef<SessionRegistryClient>(registry ?? new InMemorySessionRegistry())
  const resolvedStore = authStoreRef.current
  const resolvedRegistry = registryRef.current
  const [session, setSession] = useState<AuthSession | null>(() => resolvedStore.getSession())
  const [lifecycleReady, setLifecycleReady] = useState(
    () => !lifecycle || !resolvedStore.getSession(),
  )
  const hydratedSessionRef = useRef<string | null>(null)
  const lostSessionRef = useRef<string | null>(null)
  const replaceSession = useCallback(
    (next: AuthSession | null) => {
      if (next) resolvedStore.setSession(next)
      else resolvedStore.clearSession()
      setSession(next)
    },
    [resolvedStore],
  )

  const purgeAndRevoke = useCallback(
    async (current: AuthSession, reason: string) => {
      const [purge, revoke] = await Promise.allSettled([
        onLocalSignOut?.(current),
        resolvedRegistry.revoke(current, reason),
      ])
      if (purge.status === 'rejected') throw purge.reason
      if (revoke.status === 'rejected') throw revoke.reason
    },
    [onLocalSignOut, resolvedRegistry],
  )

  const loseSession = useCallback(
    (current: AuthSession, reason: string) => {
      const key = `${current.userId}:${current.accessToken}`
      if (lostSessionRef.current === key) return
      lostSessionRef.current = key
      // Hide private content synchronously; cleanup and server revocation follow fail-closed.
      replaceSession(null)
      void purgeAndRevoke(current, reason).catch(() => undefined)
    },
    [purgeAndRevoke, replaceSession],
  )

  useEffect(() => {
    if (!session) return
    lostSessionRef.current = null
    let cancelled = false
    let expiryTimer = 0
    const armExpiryTimer = () => {
      const remaining = session.expiresAt - Date.now()
      if (remaining <= 0) {
        loseSession(session, 'session_expired')
        return
      }
      // Browsers clamp larger delays to a signed 32-bit integer (and some fire them
      // immediately). Long provider sessions are rechecked in safe timer windows.
      expiryTimer = window.setTimeout(
        remaining > 2_147_483_647
          ? () => {
              if (!cancelled) armExpiryTimer()
            }
          : () => loseSession(session, 'session_expired'),
        Math.min(remaining, 2_147_483_647),
      )
    }
    armExpiryTimer()
    let validationTimer = 0
    const validate = async () => {
      try {
        const active = await resolvedRegistry.isActive(session)
        if (!cancelled && !active) loseSession(session, 'session_revoked')
      } catch {
        if (!cancelled) loseSession(session, 'session_validation_failed')
      } finally {
        if (!cancelled) validationTimer = window.setTimeout(() => void validate(), 1_000)
      }
    }
    validationTimer = window.setTimeout(() => void validate(), 1_000)
    return () => {
      cancelled = true
      window.clearTimeout(expiryTimer)
      window.clearTimeout(validationTimer)
    }
  }, [loseSession, resolvedRegistry, session])

  useEffect(() => {
    if (!session || !lifecycle) {
      setLifecycleReady(true)
      return
    }
    const key = `${session.userId}:${session.accessToken}`
    if (hydratedSessionRef.current === key) return
    hydratedSessionRef.current = key
    setLifecycleReady(false)
    let cancelled = false
    let settled = false
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        settled = true
        cancelled = true
        loseSession(session, 'lifecycle_hydration_timeout')
      }
    }, lifecycleHydrationTimeoutMs)
    lifecycle
      .getStatus()
      .then((snapshot) => {
        if (cancelled) return
        settled = true
        window.clearTimeout(timeout)
        if (snapshot.state === 'deleted') {
          loseSession(session, 'account_deleted')
          return
        }
        const deletionDueAt =
          snapshot.state === 'deletion_scheduled' ? snapshot.deletionDueAt : undefined
        if (session.accountState !== snapshot.state || session.deletionDueAt !== deletionDueAt) {
          const next = { ...session, accountState: snapshot.state }
          if (deletionDueAt) next.deletionDueAt = deletionDueAt
          else delete next.deletionDueAt
          replaceSession(next)
        }
        setLifecycleReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          settled = true
          window.clearTimeout(timeout)
          loseSession(session, 'lifecycle_hydration_failed')
        }
      })
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      // StrictMode intentionally tears down the first effect before its promise settles.
      // Let the replacement effect start a fresh authoritative read.
      if (!settled && hydratedSessionRef.current === key) hydratedSessionRef.current = null
    }
  }, [lifecycle, lifecycleHydrationTimeoutMs, loseSession, replaceSession, session])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      lifecycleReady,
      async signIn(next) {
        const current = resolvedStore.getSession()
        const sameAccount = current?.userId === next.userId
        if (current && current.userId !== next.userId) {
          replaceSession(null)
          try {
            await purgeAndRevoke(current, 'account_switch')
          } finally {
            try {
              await provider.signOut(current)
            } catch {
              // Application revocation remains authoritative.
            }
          }
        }
        await resolvedRegistry.registerCurrentSession(next)
        const replacement = sameAccount
          ? {
              ...next,
              ...(current?.accountState ? { accountState: current.accountState } : {}),
              ...(current?.deletionDueAt ? { deletionDueAt: current.deletionDueAt } : {}),
            }
          : next
        if (lifecycle && !sameAccount) {
          hydratedSessionRef.current = null
          setLifecycleReady(false)
        } else if (lifecycle) {
          // A password/MFA refresh for the already-hydrated account must not tear down
          // the private action that requested it.
          hydratedSessionRef.current = `${replacement.userId}:${replacement.accessToken}`
        }
        replaceSession(replacement)
      },
      async signOut() {
        const current = resolvedStore.getSession()
        if (current) {
          replaceSession(null)
          try {
            await onLocalSignOut?.(current)
          } finally {
            try {
              await resolvedRegistry.revoke(current, 'user_sign_out')
            } finally {
              // Local state was cleared before awaiting any external cleanup.
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
        replaceSession(null)
      },
      enterCancellationOnly(deletionDueAt) {
        const current = resolvedStore.getSession()
        if (!current) return
        replaceSession({ ...current, accountState: 'deletion_scheduled', deletionDueAt })
      },
      restoreActiveAccount() {
        const current = resolvedStore.getSession()
        if (!current) return
        const next = { ...current, accountState: 'active' as const }
        delete next.deletionDueAt
        replaceSession(next)
      },
    }),
    [
      onLocalSignOut,
      provider,
      purgeAndRevoke,
      replaceSession,
      resolvedRegistry,
      resolvedStore,
      session,
      lifecycle,
      lifecycleReady,
    ],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext)
}
