import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { GENERIC_MFA_ERROR, GENERIC_RECOVERY_MESSAGE, InMemoryAuthStore } from './authClient'
import {
  AccountPage,
  AuthCallbackPage,
  MfaPage,
  mfaNavigationState,
  RecoveryPage,
  RegisterPage,
  RequireSession,
  safeReturnTo,
  SignInPage,
  VerifyAccountPage,
} from './components'
import type { AuthProviderAdapter, AuthSession, AuthStore } from './types'
import { preflightAuthCallback } from './callbackPreflight'

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
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())
  it('rejects cross-origin post-login return targets', () => {
    expect(safeReturnTo('https://example.test')).toBe('/stores')
    expect(safeReturnTo('//example.test')).toBe('/stores')
    expect(safeReturnTo('/account/privacy')).toBe('/account/privacy')
    expect(safeReturnTo('/stores/oak?from=trail#hours')).toBe('/stores/oak?from=trail#hours')
    expect(safeReturnTo('/\\example.test/private')).toBe('/stores')
  })

  it('uses generic recovery copy regardless of account existence', async () => {
    const user = userEvent.setup()
    renderAuth(<RecoveryPage provider={unavailableProvider} />, unavailableProvider)
    await user.type(screen.getByLabelText(/email/i), 'unknown@example.test')
    await user.click(screen.getByRole('button', { name: /send recovery/i }))
    expect(screen.getByRole('status')).toHaveTextContent(GENERIC_RECOVERY_MESSAGE)
  })

  it('uses generic MFA failure copy', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={[{ pathname: '/auth/mfa', state: { challengeId: 'safe-id' } }]}>
        <AuthProvider provider={unavailableProvider}>
          <MfaPage provider={unavailableProvider} />
        </AuthProvider>
      </MemoryRouter>,
    )
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

  it('preserves just-in-time return context and performs no write before sign-in', () => {
    render(
      <MemoryRouter initialEntries={['/auth/sign-in?returnTo=%2Fstores%2Foak%2Fmemory']}>
        <AuthProvider provider={unavailableProvider}>
          <SignInPage provider={unavailableProvider} />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/return to the action/i)
    expect(screen.getByRole('link', { name: /cancel and return without saving/i })).toHaveAttribute(
      'href',
      '/stores/oak/memory',
    )
    expect(unavailableProvider.signIn).not.toHaveBeenCalled()
  })

  it('focuses a linked error summary and preserves safe sign-in input', async () => {
    const user = userEvent.setup()
    renderAuth(<SignInPage provider={unavailableProvider} />, unavailableProvider)
    await user.type(screen.getByLabelText(/email/i), 'shopper@example.test')
    await user.type(screen.getByLabelText(/password/i), 'safe password')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveFocus()
    const email = screen.getByLabelText(/email/i)
    const password = screen.getByLabelText(/password/i)
    expect(email).toHaveValue('shopper@example.test')
    expect(password).toHaveValue('safe password')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-describedby', 'auth-error-summary')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-describedby', 'auth-error-summary')
  })

  it('builds MFA navigation state without provider session secrets', () => {
    const state = mfaNavigationState('challenge-1', '/account/privacy')
    expect(state).toEqual({ challengeId: 'challenge-1', returnTo: '/account/privacy' })
    expect(JSON.stringify(state)).not.toMatch(/accessToken|providerSession|secret/i)
  })

  it('prefills recovery safely and validates malformed email before the provider call', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/auth/recovery?email=not-an-email']}>
        <AuthProvider provider={unavailableProvider}>
          <RecoveryPage provider={unavailableProvider} />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByLabelText(/email/i)).toHaveValue('not-an-email')
    await user.click(screen.getByRole('button', { name: /send recovery/i }))
    expect(await screen.findByRole('alert')).toHaveFocus()
    expect(unavailableProvider.sendRecovery).not.toHaveBeenCalled()
  })

  it('hides private content and offers recovery when the session expired', async () => {
    const expired: AuthSession = {
      userId: 'shopper-a',
      accessToken: 'never-render-this',
      expiresAt: Date.now() - 1,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: false,
    }
    const store: AuthStore = {
      getSession: vi.fn(() => expired),
      setSession: vi.fn(),
      clearSession: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/account/privacy']}>
        <AuthProvider authStore={store} provider={unavailableProvider}>
          <Routes>
            <Route
              path="/account/privacy"
              element={
                <RequireSession>
                  <p>private payload</p>
                </RequireSession>
              }
            />
            <Route path="/auth/sign-in" element={<p>Signed out safely. Recover your account.</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText(/private payload/i)).not.toBeInTheDocument()
    expect(await screen.findByText(/signed out safely/i)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('never-render-this')
  })

  it('separates routine account controls from deletion and confirms local sign-out', async () => {
    const user = userEvent.setup()
    renderAuth(<AccountPage />, unavailableProvider)
    expect(screen.getByRole('navigation', { name: /account controls/i })).toHaveTextContent(
      /export my data/i,
    )
    expect(screen.getByRole('heading', { name: /delete my account/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^sign out$/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/signed out on this device/i)
  })

  it('requires adult attestation and clears secrets when registration is blocked', async () => {
    const user = userEvent.setup()
    const register = vi.fn(async () => ({ kind: 'blocked' as const }))
    renderAuth(
      <RegisterPage provider={{ ...unavailableProvider, register }} />,
      unavailableProvider,
    )
    await user.type(screen.getByLabelText(/email/i), 'blocked@example.test')
    await user.type(screen.getByLabelText(/^password$/i), 'long-safe-password')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/18 or older/i)
    expect(register).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: /18 or older/i }))
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(
      await screen.findByRole('heading', { name: /account setup paused/i }),
    ).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('long-safe-password')
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('moves admitted registration to reason-neutral verification without saving the action', async () => {
    const user = userEvent.setup()
    const register = vi.fn(async () => ({ kind: 'pending_verification' as const }))
    render(
      <MemoryRouter initialEntries={['/auth/register?returnTo=%2Fstores%2Foak%2Fmemory']}>
        <AuthProvider provider={unavailableProvider}>
          <Routes>
            <Route
              path="/auth/register"
              element={<RegisterPage provider={{ ...unavailableProvider, register }} />}
            />
            <Route path="/auth/verify" element={<VerifyAccountPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/email/i), 'shopper@example.test')
    await user.type(screen.getByLabelText(/^password$/i), 'long-safe-password')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument()
    expect(screen.getByText(/no private action has been saved/i)).toBeInTheDocument()
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ ageAttested: true }))
  })

  it('reuses one request id when an unchanged registration attempt is retried', async () => {
    const user = userEvent.setup()
    const register = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'error' as const })
      .mockResolvedValueOnce({ kind: 'pending_verification' as const })
    render(
      <MemoryRouter initialEntries={['/auth/register']}>
        <AuthProvider provider={unavailableProvider}>
          <Routes>
            <Route
              path="/auth/register"
              element={<RegisterPage provider={{ ...unavailableProvider, register }} />}
            />
            <Route path="/auth/verify" element={<VerifyAccountPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/email/i), 'shopper@example.test')
    await user.type(screen.getByLabelText(/^password$/i), 'long-safe-password')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument()
    expect(register.mock.calls[0]?.[0].requestId).toBe(register.mock.calls[1]?.[0].requestId)
  })

  it('scrubs callback fragments before exchange and never renders the token', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback?returnTo=%2Fstores#token_hash=review-verify-a&type=verify',
    )
    preflightAuthCallback()
    const verifyCallback = vi.fn(async () => ({ kind: 'verified' as const }))
    render(
      <MemoryRouter initialEntries={['/auth/callback?returnTo=%2Fstores']}>
        <AuthProvider provider={unavailableProvider}>
          <Routes>
            <Route
              path="/auth/callback"
              element={<AuthCallbackPage provider={{ ...unavailableProvider, verifyCallback }} />}
            />
            <Route path="/auth/sign-in" element={<p>safe sign in</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(window.location.hash).toBe('')
    expect(document.body).not.toHaveTextContent('review-verify-a')
    expect(await screen.findByText(/safe sign in/i)).toBeInTheDocument()
    expect(verifyCallback).toHaveBeenCalledWith('verify', 'review-verify-a')
  })

  it('renders the terminal reason-neutral setup pause when callback admission is blocked', async () => {
    window.history.replaceState({}, '', '/auth/callback#token_hash=blocked-a&type=verify')
    preflightAuthCallback()
    render(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <AuthProvider provider={unavailableProvider}>
          <AuthCallbackPage
            provider={{
              ...unavailableProvider,
              verifyCallback: vi.fn(async () => ({ kind: 'blocked' as const })),
            }}
          />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Account setup paused' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact antique trail support/i })).toHaveAttribute(
      'href',
      '/help',
    )
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('exchanges an injected callback only once through StrictMode replacement effects', async () => {
    const verifyCallback = vi.fn(async () => ({ kind: 'verified' as const }))
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/auth/callback']}>
          <AuthProvider provider={unavailableProvider}>
            <Routes>
              <Route
                path="/auth/callback"
                element={
                  <AuthCallbackPage
                    provider={{ ...unavailableProvider, verifyCallback }}
                    callback={{ kind: 'verify', tokenHash: 'strict-secret' }}
                  />
                }
              />
              <Route path="/auth/sign-in" element={<p>strict safe sign in</p>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>,
    )
    expect(await screen.findByText('strict safe sign in')).toBeInTheDocument()
    expect(verifyCallback).toHaveBeenCalledOnce()
  })

  it('completes an OAuth return and lands on the preserved private target', async () => {
    const oauthCallback = vi.fn(async () => ({
      kind: 'authenticated' as const,
      session: {
        userId: 'oauth-shopper-a',
        email: 'shopper@example.test',
        emailVerified: true,
        accessToken: 'review-oauth-token',
        expiresAt: Date.now() + 60_000,
        role: 'Shopper' as const,
        mfaEnrolled: false,
        passwordAuthenticatedAt: '2026-08-21T00:00:00.000Z',
      },
    }))
    render(
      <MemoryRouter initialEntries={['/auth/callback?returnTo=%2Fsaved']}>
        <AuthProvider provider={unavailableProvider}>
          <Routes>
            <Route
              path="/auth/callback"
              element={
                <AuthCallbackPage
                  provider={{ ...unavailableProvider, oauthCallback }}
                  callback={{ kind: 'oauth', code: 'pkce-code-1' }}
                />
              }
            />
            <Route path="/saved" element={<p>private saved list</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/private saved list/i)).toBeInTheDocument()
    expect(oauthCallback).toHaveBeenCalledWith('pkce-code-1', null)
  })

  it('shows the invitation-required screen when an OAuth identity lacks admission', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <AuthProvider provider={unavailableProvider}>
          <Routes>
            <Route
              path="/auth/callback"
              element={
                <AuthCallbackPage
                  provider={{
                    ...unavailableProvider,
                    oauthCallback: vi.fn(async () => ({ kind: 'blocked' as const })),
                  }}
                  callback={{ kind: 'oauth', code: 'blocked-code' }}
                />
              }
            />
            <Route path="/auth/sign-in" element={<p>sign in</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Sign-in unavailable' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/isn't linked to an invited/i)
    expect(screen.getByRole('link', { name: /back to stores/i })).toHaveAttribute('href', '/stores')
    expect(screen.getByRole('link', { name: /contact antique trail support/i })).toHaveAttribute(
      'href',
      '/help',
    )
  })

  it('shows the generic failure when the provider cancels or errors the OAuth return', async () => {
    const oauthCallback = vi.fn(async () => ({ kind: 'error' as const }))
    render(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <AuthProvider provider={unavailableProvider}>
          <Routes>
            <Route
              path="/auth/callback"
              element={
                <AuthCallbackPage
                  provider={{ ...unavailableProvider, oauthCallback }}
                  callback={{ kind: 'oauth', oauthError: 'access_denied' }}
                />
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(oauthCallback).toHaveBeenCalledWith(null, 'access_denied')
    expect(
      await screen.findByRole('heading', { name: /verification unavailable/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start sign-in again/i })).toBeInTheDocument()
  })

  it('offers social sign-in only when the adapter supports it', async () => {
    const withoutSocial = renderAuth(
      <SignInPage provider={unavailableProvider} />,
      unavailableProvider,
    )
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument()
    withoutSocial.unmount()

    const user = userEvent.setup()
    const signInWithProvider = vi.fn(async () => undefined)
    renderAuth(<SignInPage provider={{ ...unavailableProvider, signInWithProvider }} />, {
      ...unavailableProvider,
      signInWithProvider,
    })
    await user.click(screen.getByRole('button', { name: /continue with facebook/i }))
    expect(signInWithProvider).toHaveBeenCalledWith('facebook', '/stores')
  })

  it('gates cancellation-only and role-mismatched private content', () => {
    const store: AuthStore = {
      getSession: () => ({
        userId: 'admin-1',
        accessToken: 'admin-token',
        expiresAt: Date.now() + 60_000,
        role: 'Administrator',
        mfaRequired: false,
        mfaVerified: true,
        accountState: 'deletion_scheduled',
      }),
      setSession: vi.fn(),
      clearSession: vi.fn(),
    }
    const view = render(
      <MemoryRouter>
        <AuthProvider authStore={store}>
          <RequireSession requiredRole="Shopper">
            <p>shopper secret</p>
          </RequireSession>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText(/shopper secret/i)).not.toBeInTheDocument()
    expect(screen.getByText(/only cancellation/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /account deletion is scheduled/i })).toHaveFocus()
    expect(screen.getByRole('button', { name: /^sign out$/i })).toBeInTheDocument()
    view.unmount()
    const representativeStore = {
      ...store,
      getSession: () => ({
        ...store.getSession()!,
        role: 'Representative' as const,
        accountState: 'active' as const,
      }),
    }
    render(
      <MemoryRouter>
        <AuthProvider authStore={representativeStore}>
          <RequireSession requiredRole="Shopper">
            <p>shopper secret</p>
          </RequireSession>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText(/shopper secret/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view public directory/i })).toBeInTheDocument()
  })

  it('hydrates authoritative deletion state before revealing a fresh private route', async () => {
    const store = new InMemoryAuthStore()
    store.setSession({
      userId: 'shopper-1',
      accessToken: 'shopper-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
      accountState: 'active',
    })
    render(
      <MemoryRouter initialEntries={['/saved']}>
        <AuthProvider
          authStore={store}
          lifecycle={{
            getStatus: vi.fn(async () => ({
              state: 'deletion_scheduled' as const,
              deletionDueAt: '2026-08-12T12:00:00Z',
            })),
            requestExport: vi.fn(),
            getExportStatus: vi.fn(),
            downloadExport: vi.fn(),
            requestDeletion: vi.fn(),
            cancelDeletion: vi.fn(),
          }}
        >
          <RequireSession requiredRole="Shopper">
            <p>saved private content</p>
          </RequireSession>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText('saved private content')).not.toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /account deletion is scheduled/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText('saved private content')).not.toBeInTheDocument()
  })

  it('reattaches authoritative hydration through StrictMode effect replacement', async () => {
    const store = new InMemoryAuthStore()
    store.setSession({
      userId: 'shopper-1',
      accessToken: 'strict-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/saved']}>
          <AuthProvider
            authStore={store}
            lifecycle={{
              getStatus: vi.fn(async () => ({ state: 'active' as const })),
              requestExport: vi.fn(),
              getExportStatus: vi.fn(),
              downloadExport: vi.fn(),
              requestDeletion: vi.fn(),
              cancelDeletion: vi.fn(),
            }}
          >
            <RequireSession requiredRole="Shopper">
              <p>strict private content</p>
            </RequireSession>
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>,
    )
    expect(await screen.findByText('strict private content')).toBeInTheDocument()
  })

  it('fails closed to sign-in when authoritative lifecycle hydration never resolves', async () => {
    const store = new InMemoryAuthStore()
    store.setSession({
      userId: 'shopper-1',
      accessToken: 'timeout-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })
    render(
      <MemoryRouter initialEntries={['/saved']}>
        <AuthProvider
          authStore={store}
          lifecycleHydrationTimeoutMs={10}
          lifecycle={{
            getStatus: vi.fn(() => new Promise<never>(() => undefined)),
            requestExport: vi.fn(),
            getExportStatus: vi.fn(),
            downloadExport: vi.fn(),
            requestDeletion: vi.fn(),
            cancelDeletion: vi.fn(),
          }}
        >
          <Routes>
            <Route
              path="/saved"
              element={
                <RequireSession requiredRole="Shopper">
                  <p>timed private content</p>
                </RequireSession>
              }
            />
            <Route path="/auth/sign-in" element={<p>sign in terminal</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('sign in terminal')).toBeInTheDocument()
    expect(screen.queryByText('timed private content')).not.toBeInTheDocument()
  })
})
