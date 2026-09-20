import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../features/auth'

const restored = {
  userId: 'user-1',
  accessToken: 'memory-token',
  expiresAt: Date.now() + 60_000,
}

function Probe() {
  const { session } = useAuth()
  return <span>{session?.userId ?? 'signed-out'}</span>
}

afterEach(cleanup)

describe('session restore regression', () => {
  it('does not expose children until a restored identity is registered', async () => {
    const provider = {
      oauthProviders: { google: false, facebook: false },
      signIn: vi.fn(async () => ({ kind: 'error' as const })),
      sendRecovery: vi.fn(async () => undefined),
      verifyMfa: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      restoreSession: vi.fn(async () => restored),
    }
    const registry = {
      registerCurrentSession: vi.fn(async () => undefined),
      isActive: vi.fn(async () => true),
      revoke: vi.fn(async () => undefined),
    }
    render(
      <AuthProvider provider={provider} registry={registry}>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your session')
    expect(await screen.findByText('user-1')).toBeInTheDocument()
    expect(registry.registerCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', accessToken: 'memory-token' }),
    )
  })

  it('shares one pending provider restoration across the StrictMode effect replay', async () => {
    let resolveRestore!: (session: typeof restored) => void
    const pendingRestore = new Promise<typeof restored>((resolve) => {
      resolveRestore = resolve
    })
    const provider = {
      oauthProviders: { google: false, facebook: false },
      signIn: vi.fn(async () => ({ kind: 'error' as const })),
      sendRecovery: vi.fn(async () => undefined),
      verifyMfa: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      restoreSession: vi.fn(() => pendingRestore),
    }
    const registry = {
      registerCurrentSession: vi.fn(async () => undefined),
      isActive: vi.fn(async () => true),
      revoke: vi.fn(async () => undefined),
    }
    render(
      <StrictMode>
        <AuthProvider provider={provider} registry={registry}>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    )

    expect(provider.restoreSession).toHaveBeenCalledTimes(1)
    await act(async () => resolveRestore(restored))
    expect(await screen.findByText('user-1')).toBeInTheDocument()
    expect(registry.registerCurrentSession).toHaveBeenCalledTimes(1)
  })
})
