import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { InMemoryAuthStore } from './authClient'
import type { AccountLifecycleClient } from './lifecycle'
import type { AuthSession } from './types'

function Probe() {
  const { session, lifecycleReady } = useAuth()
  return <span>{session ? lifecycleReady ? 'private-ready' : 'private-locked' : 'signed-out'}</span>
}

afterEach(() => { cleanup(); vi.useRealTimers() })

it('keeps private content locked and session material intact through a prolonged status outage', async () => {
  vi.useFakeTimers()
  const store = new InMemoryAuthStore()
  const session: AuthSession = {
    userId: 'user-1', accessToken: 'token', expiresAt: Date.now() + 60_000,
    role: 'Shopper', mfaRequired: false, mfaVerified: true,
  }
  store.setSession(session)
  const getStatus = vi.fn(async () => { throw new Error('service unavailable') })
  const clearSessionMaterial = vi.fn(async () => undefined)
  render(<AuthProvider authStore={store}
    registry={{ registerCurrentSession: vi.fn(), isActive: vi.fn(async () => true), revoke: vi.fn() }}
    provider={{ signIn: vi.fn(), sendRecovery: vi.fn(), verifyMfa: vi.fn(), signOut: vi.fn(), clearSessionMaterial }}
    lifecycle={{ getStatus } as unknown as AccountLifecycleClient}
    lifecycleHydrationTimeoutMs={5_000}><Probe /></AuthProvider>)
  await act(async () => { await vi.advanceTimersByTimeAsync(6_000) })
  expect(screen.getByText('private-locked')).toBeInTheDocument()
  expect(store.getSession()?.userId).toBe('user-1')
  expect(clearSessionMaterial).not.toHaveBeenCalled()
  expect(getStatus).toHaveBeenCalledTimes(7)
})
