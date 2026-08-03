import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { GENERIC_MFA_ERROR, GENERIC_RECOVERY_MESSAGE } from './authClient'
import { MfaPage, RecoveryPage, RequireSession, SignInPage } from './components'
import type { AuthProviderAdapter } from './types'

function renderAuth(element: ReactNode, provider: AuthProviderAdapter) {
  return render(
    <MemoryRouter>
      <AuthProvider provider={provider}>{element}</AuthProvider>
    </MemoryRouter>,
  )
}

const unavailableProvider: AuthProviderAdapter = {
  signIn: vi.fn(async () => ({ kind: 'error' as const })),
  sendRecovery: vi.fn(async () => undefined),
  verifyMfa: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
}

describe('auth states', () => {
  it('uses generic recovery copy regardless of account existence', async () => {
    const user = userEvent.setup()
    renderAuth(<RecoveryPage provider={unavailableProvider} />, unavailableProvider)
    await user.type(screen.getByLabelText(/email/i), 'unknown@example.test')
    await user.click(screen.getByRole('button', { name: /send recovery/i }))
    expect(screen.getByRole('status')).toHaveTextContent(GENERIC_RECOVERY_MESSAGE)
  })

  it('uses generic MFA failure copy', async () => {
    const user = userEvent.setup()
    renderAuth(<MfaPage provider={unavailableProvider} />, unavailableProvider)
    await user.type(screen.getByLabelText(/authentication code/i), '000000')
    await user.click(screen.getByRole('button', { name: /verify code/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC_MFA_ERROR)
  })

  it('preserves anonymous catalog by redirecting only guarded account routes', () => {
    render(
      <MemoryRouter initialEntries={['/account/privacy']}>
        <AuthProvider provider={unavailableProvider}>
          <Routes>
            <Route
              path="/account/privacy"
              element={
                <RequireSession>
                  <p>private</p>
                </RequireSession>
              }
            />
            <Route path="/auth/sign-in" element={<p>sign-in</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('sign-in')).toBeInTheDocument()
    expect(screen.queryByText('private')).not.toBeInTheDocument()
  })

  it('shows sign-in fields without exposing provider errors', () => {
    renderAuth(<SignInPage provider={unavailableProvider} />, unavailableProvider)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('autocomplete', 'current-password')
  })
})
