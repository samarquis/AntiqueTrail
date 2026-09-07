import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { InMemoryAuthStore, InMemorySessionRegistry } from './authClient'
import { PasswordReplacementPage } from './PasswordReplacementPage'
import {
  clearStagedRecoveryToken,
  PASSWORD_RECOVERY_ERROR,
  stageRecoveryToken,
} from './passwordRecoveryClient'
import type { AuthProviderAdapter } from './types'

const baseProvider: AuthProviderAdapter = {
  signIn: vi.fn(async () => ({ kind: 'error' as const })),
  sendRecovery: vi.fn(async () => undefined),
  verifyMfa: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
}

describe('PasswordReplacementPage', () => {
  beforeEach(() => clearStagedRecoveryToken())
  afterEach(() => {
    clearStagedRecoveryToken()
    cleanup()
  })

  it('validates bounds and matching passwords before submitting', async () => {
    const user = userEvent.setup()
    const completePasswordRecovery = vi.fn()
    stageRecoveryToken('recovery-secret')
    render(
      <MemoryRouter>
        <AuthProvider provider={baseProvider}>
          <PasswordReplacementPage
            provider={{ ...baseProvider, completePasswordRecovery }}
            returnTo="/stores"
          />
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.type(screen.getByLabelText('Confirm new password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use 12 through 128 characters.')
    expect(completePasswordRecovery).not.toHaveBeenCalled()
  })

  it('shows exact mismatch text and pending state, then signs out on completion', async () => {
    const user = userEvent.setup()
    let resolve: ((value: { kind: 'completed' }) => void) | undefined
    const completePasswordRecovery = vi.fn(
      () => new Promise<{ kind: 'completed' }>((done) => (resolve = done)),
    )
    const signOut = vi.fn(async () => undefined)
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'user-1',
      accessToken: 'access-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: false,
    })
    const registry = new InMemorySessionRegistry()
    await registry.registerCurrentSession(authStore.getSession()!)
    stageRecoveryToken('recovery-secret')
    render(
      <MemoryRouter initialEntries={['/auth/recovery?returnTo=%2Fstores']}>
        <AuthProvider
          authStore={authStore}
          provider={{ ...baseProvider, signOut }}
          registry={registry}
        >
          <PasswordReplacementPage
            provider={{ ...baseProvider, signOut, completePasswordRecovery }}
            returnTo="/stores"
          />
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText('New password'), 'new-password-123')
    await user.type(screen.getByLabelText('Confirm new password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.')
    expect(completePasswordRecovery).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password-123')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(screen.getByRole('button', { name: 'Updating password…' })).toBeDisabled()
    resolve?.({ kind: 'completed' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password updated. Sign in with your new password.',
    )
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('uses one generic failure and never displays the recovery token', async () => {
    const user = userEvent.setup()
    const completePasswordRecovery = vi.fn(async () => ({ kind: 'error' as const }))
    stageRecoveryToken('recovery-secret')
    render(
      <MemoryRouter>
        <AuthProvider provider={baseProvider}>
          <PasswordReplacementPage
            provider={{ ...baseProvider, completePasswordRecovery }}
            returnTo="/account/privacy"
          />
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText('New password'), 'new-password-123')
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password-123')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(PASSWORD_RECOVERY_ERROR)
    expect(document.body).not.toHaveTextContent('recovery-secret')
  })
})
