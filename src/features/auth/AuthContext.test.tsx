import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

describe('auth local sign-out cleanup', () => {
  it('purges account-bound local data before clearing the session', async () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    const events: string[] = []
    const provider: AuthProviderAdapter = {
      signIn: vi.fn(async () => ({ kind: 'error' as const })),
      sendRecovery: vi.fn(async () => undefined),
      verifyMfa: vi.fn(async () => null),
      signOut: vi.fn(async () => events.push('provider')),
    }

    render(
      <AuthProvider
        provider={provider}
        authStore={store}
        onLocalSignOut={async (current) => events.push(`purge:${current.userId}`)}
      >
        <SignOutProbe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(events).toEqual(['provider', 'purge:user-1'])
    expect(store.getSession()).toBeNull()
  })
})
