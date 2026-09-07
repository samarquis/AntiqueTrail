import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { InMemoryAuthStore } from './authClient'
import type { AuthProviderAdapter, AuthSession, ProviderSession } from './types'

const initial: AuthSession = {
  userId: 'shopper-1',
  accessToken: 'access-before-refresh',
  expiresAt: Date.now() + 60_000,
  role: 'Shopper',
  mfaRequired: false,
  mfaVerified: true,
}

function Probe() {
  const { session, signOut } = useAuth()
  return (
    <>
      <span>{session?.accessToken ?? 'signed-out'}</span>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  )
}

function refreshed(accessToken: string, userId = 'shopper-1'): ProviderSession {
  return {
    userId,
    accessToken,
    expiresAt: Date.now() + 60_000,
    role: 'Shopper',
    mfaRequired: false,
    mfaEnrolled: false,
  }
}

describe('provider refresh lifecycle', () => {
  afterEach(cleanup)

  it('updates the in-memory snapshot without signing out the account', async () => {
    let listener: ((event: 'TOKEN_REFRESHED', session: ProviderSession) => void) | undefined
    const store = new InMemoryAuthStore()
    store.setSession(initial)
    const registerCurrentSession = vi.fn(async () => undefined)
    const provider: AuthProviderAdapter = {
      signIn: vi.fn(async () => ({ kind: 'error' as const })),
      sendRecovery: vi.fn(async () => undefined),
      verifyMfa: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      onSessionChange: (next) => {
        listener = (event, session) => next(event, session)
        return { unsubscribe: () => undefined }
      },
    }
    render(
      <AuthProvider
        provider={provider}
        authStore={store}
        registry={{ registerCurrentSession, isActive: vi.fn(async () => true), revoke: vi.fn() }}
      >
        <Probe />
      </AuthProvider>,
    )

    await act(async () => listener?.('TOKEN_REFRESHED', refreshed('access-after-refresh')))
    await waitFor(() => expect(screen.getByText('access-after-refresh')).toBeInTheDocument())
    expect(screen.queryByText('signed-out')).not.toBeInTheDocument()
    expect(registerCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-after-refresh' }),
    )
  })

  it('does not let restoration resolve after logout and resurrect the account', async () => {
    let resolveRestore!: (session: ProviderSession) => void
    const store = new InMemoryAuthStore()
    const provider: AuthProviderAdapter = {
      signIn: vi.fn(async () => ({ kind: 'error' as const })),
      sendRecovery: vi.fn(async () => undefined),
      verifyMfa: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      restoreSession: () => new Promise((resolve) => (resolveRestore = resolve)),
    }
    render(
      <AuthProvider
        provider={provider}
        authStore={store}
        registry={{
          registerCurrentSession: vi.fn(),
          isActive: vi.fn(async () => true),
          revoke: vi.fn(),
        }}
      >
        <Probe />
      </AuthProvider>,
    )

    await act(async () => {
      await screen.getByRole('button', { name: 'Sign out' }).click()
      resolveRestore(refreshed('late-access-token'))
    })
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(store.getSession()).toBeNull()
  })
})
