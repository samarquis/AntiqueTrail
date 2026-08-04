import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { InMemoryAuthStore } from './authClient'
import type { AuthProviderAdapter, AuthSession } from './types'

const session: AuthSession = {
  userId: 'user-1',
  accessToken: 'token',
  expiresAt: Date.now() + 60_000,
  role: 'Shopper',
  mfaRequired: false,
  mfaVerified: true,
}

function SignOutProbe() {
  const { session: current, signOut } = useAuth()
  return (
    <>
      <span>{current ? 'signed-in' : 'signed-out'}</span>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  )
}

function SignInProbe() {
  const { session: current, signIn } = useAuth()
  return (
    <>
      <span>{current ? 'signed-in' : 'signed-out'}</span>
      <button type="button" onClick={() => void signIn(session).catch(() => undefined)}>
        Sign in
      </button>
    </>
  )
}

describe('auth local sign-out cleanup', () => {
  afterEach(cleanup)
  it('purges and revokes locally before provider sign-out', async () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    const events: string[] = []
    const provider: AuthProviderAdapter = {
      signIn: vi.fn(async () => ({ kind: 'error' as const })),
      sendRecovery: vi.fn(async () => undefined),
      verifyMfa: vi.fn(async () => null),
      signOut: vi.fn(async () => {
        events.push('provider')
      }),
    }

    render(
      <AuthProvider
        provider={provider}
        authStore={store}
        registry={{
          registerCurrentSession: vi.fn(),
          isActive: vi.fn(async () => true),
          revoke: vi.fn(async () => {
            events.push('revoke')
          }),
        }}
        onLocalSignOut={async (current) => {
          events.push(`purge:${current.userId}`)
        }}
      >
        <SignOutProbe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(events).toEqual(['purge:user-1', 'revoke', 'provider'])
    expect(store.getSession()).toBeNull()
  })

  it('stays signed out and purges local data when provider sign-out fails', async () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    const purge = vi.fn(async () => undefined)
    const revoke = vi.fn(async () => undefined)
    render(
      <AuthProvider
        authStore={store}
        registry={{ registerCurrentSession: vi.fn(), isActive: vi.fn(), revoke }}
        provider={{
          signIn: vi.fn(async () => ({ kind: 'error' as const })),
          sendRecovery: vi.fn(),
          verifyMfa: vi.fn(async () => null),
          signOut: vi.fn(async () => {
            throw new Error('provider unavailable')
          }),
        }}
        onLocalSignOut={purge}
      >
        <SignOutProbe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(purge).toHaveBeenCalledWith(session)
    expect(revoke).toHaveBeenCalledWith(session, 'user_sign_out')
    expect(store.getSession()).toBeNull()
  })

  it('does not expose a local session when server registration fails', async () => {
    const store = new InMemoryAuthStore()
    render(
      <AuthProvider
        authStore={store}
        registry={{
          registerCurrentSession: vi.fn(async () => {
            throw new Error('registry unavailable')
          }),
          isActive: vi.fn(async () => false),
          revoke: vi.fn(),
        }}
      >
        <SignInProbe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(store.getSession()).toBeNull()
  })
})
