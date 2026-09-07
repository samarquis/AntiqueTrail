import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import type { ProviderSession } from './types'

const first: ProviderSession = {
  userId: 'user-1',
  accessToken: 'token-1',
  expiresAt: Date.now() + 60_000,
}
const refreshed: ProviderSession = { ...first, accessToken: 'token-2' }

function Probe() {
  const { session } = useAuth()
  return <span>{session?.accessToken ?? 'signed-out'}</span>
}

describe('provider refresh regression', () => {
  it('updates the in-memory snapshot without signing out', async () => {
    let notify: ((session: ProviderSession | null) => void) | undefined
    const provider = {
      signIn: vi.fn(async () => ({ kind: 'error' as const })),
      sendRecovery: vi.fn(async () => undefined),
      verifyMfa: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      restoreSession: vi.fn(async () => first),
      onSessionChange: vi.fn((listener: (session: ProviderSession | null) => void) => {
        notify = listener
        return () => undefined
      }),
    }
    render(
      <AuthProvider provider={provider}>
        <Probe />
      </AuthProvider>,
    )
    expect(await screen.findByText('token-1')).toBeInTheDocument()
    await act(async () => notify?.(refreshed))
    expect(await screen.findByText('token-2')).toBeInTheDocument()
  })
})
