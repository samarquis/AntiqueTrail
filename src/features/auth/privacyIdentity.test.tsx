import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { InMemoryAuthStore, InMemorySessionRegistry } from './authClient'
import { PrivacyPage } from './lifecycleComponents'
import type { AccountLifecycleClient } from './lifecycle'
import type { AuthProviderAdapter, AuthSession } from './types'

const provider: AuthProviderAdapter = {
  signIn: vi.fn(async () => ({ kind: 'error' as const })),
  sendRecovery: vi.fn(async () => undefined),
  verifyMfa: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
}

const lifecycle: AccountLifecycleClient = {
  getStatus: vi.fn(async () => ({ state: 'active' as const })),
  requestExport: vi.fn(),
  getExportStatus: vi.fn(),
  downloadExport: vi.fn(),
  requestDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
}

function renderPrivacy(
  session: AuthSession,
  status: Awaited<ReturnType<AccountLifecycleClient['getStatus']>> = { state: 'active' },
) {
  const authStore = new InMemoryAuthStore()
  const registry = new InMemorySessionRegistry()
  authStore.setSession(session)
  void registry.registerCurrentSession(session)
  return render(
    <MemoryRouter>
      <AuthProvider provider={provider} authStore={authStore} registry={registry}>
        <PrivacyPage client={{ ...lifecycle, getStatus: vi.fn(async () => status) }} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const session = (emailVerified?: boolean): AuthSession => ({
  userId: 'shopper-a',
  email: 'shopper@example.com',
  ...(emailVerified === undefined ? {} : { emailVerified }),
  accessToken: 'memory-only',
  expiresAt: Date.now() + 60_000,
  role: 'Shopper',
  mfaRequired: false,
  mfaVerified: true,
})

describe('Privacy account identity', () => {
  afterEach(cleanup)

  it('shows the current email, verified status, and account navigation', async () => {
    renderPrivacy(session(true))
    expect(await screen.findByText('shopper@example.com')).toBeVisible()
    expect(screen.getByText('Email status:')).toHaveTextContent('Verified')
    expect(screen.getByRole('link', { name: 'Back to account' })).toHaveAttribute(
      'href',
      '/account',
    )
  })

  it('does not present missing verification data as verified', async () => {
    renderPrivacy(session())
    expect(await screen.findByText('Verification status unavailable')).toBeVisible()
    expect(screen.queryByText(/^Verified$/)).not.toBeInTheDocument()
  })

  it('keeps deletion-scheduled controls restricted', async () => {
    renderPrivacy(session(true), { state: 'deletion_scheduled', deletionDueAt: '2026-09-14' })
    expect(await screen.findByText(/account deletion is scheduled/i)).toBeVisible()
    expect(screen.getByRole('link', { name: /review cancellation/i })).toHaveAttribute(
      'href',
      '/account/delete/cancel',
    )
    expect(screen.queryByRole('link', { name: 'Back to account' })).not.toBeInTheDocument()
  })
})
