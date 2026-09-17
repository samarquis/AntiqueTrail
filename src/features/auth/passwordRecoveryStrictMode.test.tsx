import { StrictMode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { AuthCallbackPage, RecoveryPage, RequireSession, SignInPage } from './components'
import { preflightAuthCallback } from './callbackPreflight'
import { unavailableAuthProvider } from './authClient'
import {
  clearStagedRecoveryToken,
  hasStagedRecoveryToken,
  stageRecoveryToken,
} from './passwordRecoveryClient'
import type { AuthProviderAdapter } from './types'

afterEach(() => {
  cleanup()
  clearStagedRecoveryToken()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('joins catalog-only sign-in, forgot, request, targetless callback, replacement and lifecycle sign-in', async () => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
  const sendRecovery = vi.fn(async () => undefined)
  const completePasswordRecovery = vi.fn<
    NonNullable<AuthProviderAdapter['completePasswordRecovery']>
  >(async () => ({ kind: 'completed' }))
  const signIn = vi.fn<AuthProviderAdapter['signIn']>(async () => ({
    kind: 'authenticated',
    session: {
      userId: 'existing-fixture',
      accessToken: 'fixture-only',
      expiresAt: Date.now() + 60000,
      role: 'Shopper',
    },
  }))
  const provider = { ...unavailableAuthProvider, sendRecovery, completePasswordRecovery, signIn }
  const router = createMemoryRouter(
    [
      { path: '/auth/sign-in', element: <SignInPage provider={provider} /> },
      { path: '/auth/recovery', element: <RecoveryPage provider={provider} /> },
      { path: '/auth/callback', element: <AuthCallbackPage provider={provider} /> },
      {
        path: '/account',
        element: (
          <RequireSession>
            <p>Existing account lifecycle</p>
          </RequireSession>
        ),
      },
    ],
    { initialEntries: ['/auth/sign-in?returnTo=%2Faccount'] },
  )
  const user = userEvent.setup()
  render(
    <AuthProvider provider={provider}>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  await user.click(screen.getByRole('link', { name: 'Forgot your password?' }))
  await user.type(screen.getByLabelText('Email'), 'existing@example.test')
  await user.click(screen.getByRole('button', { name: 'Send recovery email' }))
  expect(sendRecovery).toHaveBeenCalledWith('existing@example.test')
  // The real provider adapter takes only email; its callback does not carry the
  // sign-in page's returnTo. Exercise that actual transition, not a injected target.
  window.history.replaceState(
    {},
    '',
    '/auth/callback#token_hash=joined-synthetic-token&type=recovery',
  )
  preflightAuthCallback()
  await act(async () => {
    await router.navigate('/auth/callback')
  })
  expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeVisible()
  expect(window.location.href).not.toContain('joined-synthetic-token')
  await user.type(screen.getByLabelText('New password'), 'Synthetic password 123!')
  await user.type(screen.getByLabelText('Confirm new password'), 'Synthetic password 123!')
  await user.click(screen.getByRole('button', { name: 'Set new password' }))
  await user.click(await screen.findByRole('link', { name: 'Sign in' }))
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible()
  await user.type(screen.getByLabelText('Email'), 'existing@example.test')
  await user.type(screen.getByLabelText('Password'), 'Synthetic password 123!')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Existing account lifecycle')).toBeVisible()
  expect(completePasswordRecovery).toHaveBeenCalledOnce()
  expect(signIn).toHaveBeenCalledOnce()
  router.dispose()
}, 15000)

it.each(['https://example.test/private', '/auth/register'])(
  'keeps catalog-only recovery on the account lifecycle for return target %s',
  (target) => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    stageRecoveryToken('synthetic-return-target-token')
    const provider = unavailableAuthProvider
    const router = createMemoryRouter(
      [{ path: '/auth/recovery', element: <RecoveryPage provider={provider} /> }],
      { initialEntries: [`/auth/recovery?returnTo=${encodeURIComponent(target)}`] },
    )

    render(
      <AuthProvider provider={provider}>
        <RouterProvider router={router} />
      </AuthProvider>,
    )

    expect(screen.getByRole('link', { name: 'Cancel and sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in?returnTo=%2Faccount',
    )
    router.dispose()
  },
)

function replacement(provider: AuthProviderAdapter = unavailableAuthProvider) {
  return (
    <StrictMode>
      <MemoryRouter initialEntries={['/auth/recovery']}>
        <AuthProvider provider={provider}>
          <RecoveryPage provider={provider} />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>
  )
}
it('retains the in-memory recovery token through StrictMode effect replacement and parent rerender', async () => {
  stageRecoveryToken('synthetic-regression-only')
  const view = render(replacement())
  await Promise.resolve()
  expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  expect(hasStagedRecoveryToken()).toBe(true)
  view.rerender(replacement())
  expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
})
it('does not let the previous page cleanup erase a newer callback token', async () => {
  stageRecoveryToken('old-synthetic-token')
  const view = render(replacement())
  view.unmount()
  stageRecoveryToken('new-synthetic-token')
  await Promise.resolve()
  expect(hasStagedRecoveryToken()).toBe(true)
})
it('clears the staged token after an actual replacement-page unmount', async () => {
  stageRecoveryToken('synthetic-regression-only')
  const view = render(replacement())
  view.unmount()
  await Promise.resolve()
  expect(hasStagedRecoveryToken()).toBe(false)
})
it('consumes a successful replacement token once without durable storage or visible disclosure', async () => {
  const completePasswordRecovery = vi.fn<
    NonNullable<AuthProviderAdapter['completePasswordRecovery']>
  >(async () => ({ kind: 'completed' }))
  const provider = { ...unavailableAuthProvider, completePasswordRecovery }
  const user = userEvent.setup()
  const localWrite = vi.spyOn(Storage.prototype, 'setItem')
  stageRecoveryToken('single-use-synthetic-token')
  render(replacement(provider))
  await Promise.resolve()
  await user.type(screen.getByLabelText('New password'), 'Synthetic password 123!')
  await user.type(screen.getByLabelText('Confirm new password'), 'Synthetic password 123!')
  await user.click(screen.getByRole('button', { name: 'Set new password' }))
  expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible()
  expect(completePasswordRecovery).toHaveBeenCalledOnce()
  expect(completePasswordRecovery.mock.calls[0]?.[0]).toMatchObject({
    tokenHash: 'single-use-synthetic-token',
  })
  expect(hasStagedRecoveryToken()).toBe(false)
  expect(localWrite).not.toHaveBeenCalled()
  expect(document.body).not.toHaveTextContent('single-use-synthetic-token')
  expect(window.location.href).not.toContain('single-use-synthetic-token')
  localWrite.mockRestore()
})
