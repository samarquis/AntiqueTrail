import { act, render, screen, waitFor } from '@testing-library/react'
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
      <button type="button" onClick={() => void signOut().catch(() => undefined)}>
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

function SwitchProbe({ next }: { next: AuthSession }) {
  const { session: current, signIn } = useAuth()
  return (
    <>
      <span>{current?.userId ?? 'signed-out'}</span>
      <button type="button" onClick={() => void signIn(next).catch(() => undefined)}>
        Switch
      </button>
    </>
  )
}

function LifecycleProbe() {
  const { session: current, enterCancellationOnly, restoreActiveAccount } = useAuth()
  return (
    <>
      <span>{current?.accountState ?? 'active'}</span>
      <button type="button" onClick={() => enterCancellationOnly('2026-08-12')}>
        Schedule
      </button>
      <button type="button" onClick={restoreActiveAccount}>
        Restore
      </button>
    </>
  )
}

describe('auth local sign-out cleanup', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
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
      clearSessionMaterial: vi.fn(async () => {
        events.push('clear-refresh')
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
    expect(events).toEqual(['clear-refresh', 'purge:user-1', 'revoke', 'provider'])
    expect(store.getSession()).toBeNull()
  })

  it('withholds signed-out acknowledgement until cleanup and revocation settle', async () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const logout = vi.fn(async () => undefined)
    render(
      <AuthProvider
        authStore={store}
        registry={{
          registerCurrentSession: vi.fn(),
          isActive: vi.fn(async () => true),
          revoke: () => pending,
        }}
        provider={{ signIn: vi.fn(), sendRecovery: vi.fn(), verifyMfa: vi.fn(), signOut: logout }}
      >
        <SignOutProbe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(store.getSession()).toBeNull()
    expect(screen.queryByText('signed-out')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Signing out')
    await act(async () => release())
    expect(screen.getByText('signed-out')).toBeInTheDocument()
    expect(logout).toHaveBeenCalledWith(session)
  })

  it.each(['purge', 'revoke'])(
    'retains provider authentication for retry when %s fails',
    async (failure) => {
      const store = new InMemoryAuthStore()
      store.setSession(session)
      const logout = vi.fn(async () => undefined)
      const revoke = vi.fn(async () => {
        if (failure === 'revoke') throw new Error('revocation unavailable')
      })
      render(
        <AuthProvider
          authStore={store}
          onLocalSignOut={async () => {
            if (failure === 'purge') throw new Error('purge failed')
          }}
          registry={{ registerCurrentSession: vi.fn(), isActive: vi.fn(async () => true), revoke }}
          provider={{ signIn: vi.fn(), sendRecovery: vi.fn(), verifyMfa: vi.fn(), signOut: logout }}
        >
          <SignOutProbe />
        </AuthProvider>,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Retry sign out' })).toBeInTheDocument(),
      )
      expect(logout).not.toHaveBeenCalled()
      expect(revoke).toHaveBeenCalledWith(session, 'user_sign_out')
      expect(store.getSession()).toBeNull()
      expect(screen.queryByText('signed-out')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry sign out' })).toBeInTheDocument()
    },
  )

  it('keeps failed durable cleanup behind a retry boundary', async () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    const clear = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValue(undefined)
    render(
      <AuthProvider
        authStore={store}
        registry={{
          registerCurrentSession: vi.fn(),
          isActive: vi.fn(async () => true),
          revoke: vi.fn(),
        }}
        provider={{
          signIn: vi.fn(),
          sendRecovery: vi.fn(),
          verifyMfa: vi.fn(),
          signOut: vi.fn(),
          clearSessionMaterial: clear,
        }}
      >
        <SignOutProbe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.queryByText('signed-out')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry sign out' }))
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(clear).toHaveBeenCalledTimes(2)
  })

  it('can retry revocation with the provider credential after a transient error', async () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    let authenticated = true
    let attempts = 0
    const revoke = vi.fn(async () => {
      if (!authenticated) throw new Error('anonymous denied')
      if (++attempts === 1) throw new Error('network unavailable')
    })
    render(
      <AuthProvider
        authStore={store}
        registry={{ registerCurrentSession: vi.fn(), isActive: vi.fn(async () => true), revoke }}
        provider={{
          signIn: vi.fn(),
          sendRecovery: vi.fn(),
          verifyMfa: vi.fn(),
          signOut: async () => {
            authenticated = false
          },
        }}
      >
        <SignOutProbe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(authenticated).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Retry sign out' }))
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(authenticated).toBe(false)
    expect(attempts).toBe(2)
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

  it('purges and revokes the old account before registering an account switch', async () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    const events: string[] = []
    const next = { ...session, userId: 'user-2', accessToken: 'token-2' }
    render(
      <AuthProvider
        authStore={store}
        registry={{
          isActive: vi.fn(async () => true),
          revoke: vi.fn(async () => {
            events.push('revoke-old')
          }),
          registerCurrentSession: vi.fn(async () => {
            events.push('register-new')
          }),
        }}
        provider={{
          signIn: vi.fn(async () => ({ kind: 'error' as const })),
          sendRecovery: vi.fn(),
          verifyMfa: vi.fn(async () => null),
          signOut: vi.fn(async () => {
            events.push('provider-old')
          }),
        }}
        onLocalSignOut={async () => {
          events.push('purge-old')
        }}
      >
        <SwitchProbe next={next} />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Switch' }))
    await waitFor(() => expect(screen.getByText('user-2')).toBeInTheDocument())
    expect(events.slice(-1)).toEqual(['register-new'])
    expect(events).toEqual(expect.arrayContaining(['purge-old', 'revoke-old', 'provider-old']))
    expect(store.getSession()?.userId).toBe('user-2')
  })

  it('hides and purges an open session when live registry validation revokes it', async () => {
    vi.useFakeTimers()
    const store = new InMemoryAuthStore()
    store.setSession({ ...session, expiresAt: Date.now() + 60_000 })
    const purge = vi.fn(async () => undefined)
    const revoke = vi.fn(async () => undefined)
    render(
      <AuthProvider
        authStore={store}
        registry={{ registerCurrentSession: vi.fn(), isActive: vi.fn(async () => false), revoke }}
        onLocalSignOut={purge}
      >
        <SignOutProbe />
      </AuthProvider>,
    )
    expect(screen.getByText('signed-in')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(screen.getByText('signed-out')).toBeInTheDocument()
    expect(store.getSession()).toBeNull()
    expect(purge).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }))
    expect(revoke).toHaveBeenCalledWith(expect.anything(), 'session_revoked')
    vi.useRealTimers()
  })

  it('persists and restores cancellation-only account state in the auth store', async () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    render(
      <AuthProvider authStore={store}>
        <LifecycleProbe />
      </AuthProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByText('deletion_scheduled')).toBeInTheDocument()
    expect(store.getSession()).toMatchObject({
      accountState: 'deletion_scheduled',
      deletionDueAt: '2026-08-12',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(store.getSession()?.accountState).toBe('active')
  })

  it('cancels live validation without rescheduling after unmount', async () => {
    vi.useFakeTimers()
    const store = new InMemoryAuthStore()
    store.setSession({ ...session, expiresAt: Date.now() + 60_000 })
    const isActive = vi.fn(async () => true)
    const view = render(
      <AuthProvider
        authStore={store}
        registry={{ registerCurrentSession: vi.fn(), isActive, revoke: vi.fn() }}
      >
        <SignOutProbe />
      </AuthProvider>,
    )
    view.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(isActive).not.toHaveBeenCalled()
  })
})
