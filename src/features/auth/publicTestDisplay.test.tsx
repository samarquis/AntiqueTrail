import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { RegisterPage, RequireSession, SignInPage } from './components'
import { CatalogPrivateActions } from '../shopper/components'
import { unavailableShopperClient } from '../shopper/shopperClient'
import type { AuthProviderAdapter } from './types'
import { InMemoryAuthStore } from './authClient'
import { Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.sessionStorage.clear()
})
function provider(): AuthProviderAdapter {
  return {
    signIn: vi.fn(async () => ({ kind: 'error' as const })),
    register: vi.fn(async () => ({ kind: 'error' as const })),
    signOut: vi.fn(async () => undefined),
    sendRecovery: vi.fn(async () => undefined),
    verifyMfa: vi.fn(async () => null),
  }
}
it.each(['sign-in', 'registration', 'private account'])(
  'pauses %s without collecting credentials or attempting authentication',
  (kind) => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    const auth = provider()
    const content =
      kind === 'sign-in' ? (
        <SignInPage provider={auth} />
      ) : kind === 'registration' ? (
        <RegisterPage provider={auth} />
      ) : (
        <RequireSession>
          <p>Private content</p>
        </RequireSession>
      )
    render(
      <MemoryRouter>
        <AuthProvider provider={auth}>{content}</AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Account setup paused' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to store list' })).toHaveAttribute(
      'href',
      '/stores',
    )
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByText('Private content')).not.toBeInTheDocument()
    expect(auth.signIn).not.toHaveBeenCalled()
    expect(auth.register).not.toHaveBeenCalled()
  },
)
it('replaces save/setup promises with the existing paused state and makes no private calls', () => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
  const getSaveState = vi.fn(),
    setSave = vi.fn()
  render(
    <MemoryRouter>
      <AuthProvider provider={provider()}>
        <CatalogPrivateActions
          storeId="fixture"
          slug="fixture"
          client={{ ...unavailableShopperClient, getSaveState, setSave }}
        />
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.getByText('Account setup paused')).toBeVisible()
  expect(screen.queryByRole('link', { name: /save|correction/i })).not.toBeInTheDocument()
  expect(getSaveState).not.toHaveBeenCalled()
  expect(setSave).not.toHaveBeenCalled()
})
it('keeps ordinary authentication entry when the display restriction is absent', () => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
  const auth = provider()
  render(
    <MemoryRouter>
      <AuthProvider provider={auth}>
        <SignInPage provider={auth} />
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(screen.getByLabelText('Email')).toBeVisible()
})

function existingAccount(state: 'active' | 'deletion_scheduled' = 'active', expired = false) {
  const store = new InMemoryAuthStore()
  store.setSession({
    userId: 'existing-shopper',
    accessToken: 'local-fixture',
    role: 'Shopper',
    mfaRequired: false,
    mfaVerified: true,
    accountState: state,
    expiresAt: Date.now() + (expired ? -60000 : 60000),
  })
  return store
}

it.each([
  '/account',
  '/account/privacy',
  '/account/export',
  '/account/delete',
  '/account/delete/cancel',
])(
  'preserves authenticated lifecycle entry %s while the catalog-only restriction is active',
  (path) => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider provider={provider()} authStore={existingAccount()}>
          <RequireSession
            requiredRole="Shopper"
            allowCancellationOnly={path === '/account/delete/cancel'}
          >
            <p>Existing lifecycle controls</p>
          </RequireSession>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('Existing lifecycle controls')).toBeVisible()
  },
)
it.each([
  '/saved',
  '/trips',
  '/account/history',
  '/account/privacy/blocked-senders',
  '/account/export/other',
])('keeps %s closed even for an existing authenticated account', (path) => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider provider={provider()} authStore={existingAccount()}>
        <RequireSession>
          <p>Forbidden private controls</p>
        </RequireSession>
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Account setup paused' })).toBeVisible()
  expect(screen.queryByText('Forbidden private controls')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
})
it('requires fresh provider authentication for signed-out lifecycle entry without offering registration', async () => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
  const auth = provider()
  render(
    <MemoryRouter initialEntries={['/account/export']}>
      <AuthProvider provider={auth}>
        <Routes>
          <Route
            path="/account/export"
            element={
              <RequireSession>
                <p>Private export</p>
              </RequireSession>
            }
          />
          <Route path="/auth/sign-in" element={<SignInPage provider={auth} />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(screen.queryByText('Private export')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'unadmitted@example.test')
  await user.type(screen.getByLabelText('Password'), 'not-an-account-password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(auth.signIn).toHaveBeenCalledOnce()
  expect(screen.queryByText('Private export')).not.toBeInTheDocument()
})
it('retains expiry checks instead of revealing lifecycle content', () => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
  render(
    <MemoryRouter initialEntries={['/account/export']}>
      <AuthProvider provider={provider()} authStore={existingAccount('active', true)}>
        <RequireSession>
          <p>Private export</p>
        </RequireSession>
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.queryByText('Private export')).not.toBeInTheDocument()
})
it.each([false, true])(
  'preserves cancellation-only restrictions (cancellation route: %s)',
  (cancellation) => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    render(
      <MemoryRouter initialEntries={[cancellation ? '/account/delete/cancel' : '/account/export']}>
        <AuthProvider provider={provider()} authStore={existingAccount('deletion_scheduled')}>
          <RequireSession allowCancellationOnly={cancellation}>
            <p>Lifecycle content</p>
          </RequireSession>
        </AuthProvider>
      </MemoryRouter>,
    )
    if (cancellation) expect(screen.getByText('Lifecycle content')).toBeVisible()
    else {
      expect(screen.queryByText('Lifecycle content')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Review cancellation' })).toBeVisible()
    }
  },
)
it('permits local sign-out from a paused private route', async () => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
  const auth = provider(),
    store = existingAccount()
  render(
    <MemoryRouter initialEntries={['/saved']}>
      <AuthProvider provider={auth} authStore={store}>
        <RequireSession>
          <p>Saved data</p>
        </RequireSession>
      </AuthProvider>
    </MemoryRouter>,
  )
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
  expect(store.getSession()).toBeNull()
  expect(auth.signOut).toHaveBeenCalledOnce()
  expect(screen.queryByText('Saved data')).not.toBeInTheDocument()
})

it('does not let a lifecycle route bypass the required role', () => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
  const store = existingAccount()
  store.setSession({ ...store.getSession()!, role: 'Representative' })
  render(
    <MemoryRouter initialEntries={['/account/export']}>
      <AuthProvider provider={provider()} authStore={store}>
        <RequireSession requiredRole="Shopper">
          <p>Private export</p>
        </RequireSession>
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.queryByText('Private export')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'This private area is unavailable' })).toBeVisible()
})

it('keeps lifecycle content hidden while authoritative status is unresolved and permits sign-out', async () => {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
  const store = existingAccount()
  render(
    <MemoryRouter initialEntries={['/account/export']}>
      <AuthProvider
        provider={provider()}
        authStore={store}
        lifecycle={{
          getStatus: () => new Promise(() => undefined),
          requestExport: vi.fn(),
          getExportStatus: vi.fn(),
          downloadExport: vi.fn(),
          requestDeletion: vi.fn(),
          cancelDeletion: vi.fn(),
        }}
      >
        <RequireSession>
          <p>Private export</p>
        </RequireSession>
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.queryByText('Private export')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Checking account access' })).toBeVisible()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
  expect(store.getSession()).toBeNull()
})
