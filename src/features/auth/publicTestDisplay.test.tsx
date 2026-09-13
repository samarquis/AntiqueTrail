import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { RegisterPage, RequireSession, SignInPage } from './components'
import { CatalogPrivateActions } from '../shopper/components'
import { unavailableShopperClient } from '../shopper/shopperClient'
import type { AuthProviderAdapter } from './types'

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
