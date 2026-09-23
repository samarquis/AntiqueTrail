import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { InMemoryAuthStore } from './authClient'
import type { AuthSession } from './types'

const session: AuthSession = {
  userId: 'user-1',
  accessToken: 'token',
  expiresAt: Date.now() + 60_000,
  role: 'Shopper',
  mfaRequired: false,
  mfaVerified: true,
}

function Probe() {
  const { session: current } = useAuth()
  return <span>{current ? 'signed-in' : 'signed-out'}</span>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('keeps session material through one transient validation error and recovers on retry', async () => {
  vi.useFakeTimers()
  const store = new InMemoryAuthStore()
  store.setSession({ ...session, expiresAt: Date.now() + 60_000 })
  const isActive = vi
    .fn()
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockResolvedValue(true)
  const purge = vi.fn(async () => undefined)
  const revoke = vi.fn(async () => undefined)
  const clearSessionMaterial = vi.fn(async () => undefined)
  render(
    <AuthProvider
      authStore={store}
      registry={{ registerCurrentSession: vi.fn(), isActive, revoke }}
      provider={{
        signIn: vi.fn(),
        sendRecovery: vi.fn(),
        verifyMfa: vi.fn(),
        signOut: vi.fn(),
        clearSessionMaterial,
      }}
      onLocalSignOut={purge}
    >
      <Probe />
    </AuthProvider>,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(store.getSession()?.userId).toBe('user-1')
  expect(purge).not.toHaveBeenCalled()
  expect(revoke).not.toHaveBeenCalled()
  expect(clearSessionMaterial).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(isActive).toHaveBeenCalledTimes(2)
  expect(screen.getByText('signed-in')).toBeInTheDocument()
})
