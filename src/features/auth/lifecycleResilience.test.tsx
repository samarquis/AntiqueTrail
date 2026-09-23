import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { InMemoryAuthStore } from './authClient'
import type { AccountLifecycleClient } from './lifecycle'
import type { AuthSession } from './types'

function Probe() {
  const { session, lifecycleReady } = useAuth()
  return <span>{session ? (lifecycleReady ? 'ready' : 'checking') : 'signed-out'}</span>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('retries a transient account status failure without discarding the session', async () => {
  vi.useFakeTimers()
  const store = new InMemoryAuthStore()
  const session: AuthSession = {
    userId: 'user-1',
    accessToken: 'token',
    expiresAt: Date.now() + 60_000,
    role: 'Shopper',
    mfaRequired: false,
    mfaVerified: true,
  }
  store.setSession(session)
  const getStatus = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary network failure'))
    .mockResolvedValue({ state: 'active' })
  const purge = vi.fn(async () => undefined)
  render(
    <AuthProvider
      authStore={store}
      registry={{
        registerCurrentSession: vi.fn(),
        isActive: vi.fn(async () => true),
        revoke: vi.fn(),
      }}
      lifecycle={{ getStatus } as unknown as AccountLifecycleClient}
      onLocalSignOut={purge}
    >
      <Probe />
    </AuthProvider>,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(screen.getByText('checking')).toBeInTheDocument()
  expect(store.getSession()?.userId).toBe('user-1')
  expect(purge).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(getStatus).toHaveBeenCalledTimes(2)
  expect(screen.getByText('ready')).toBeInTheDocument()
})
