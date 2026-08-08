import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CancelDeletionPage,
  DeleteAccountPage,
  ExportPage,
  PrivacyPage,
} from './lifecycleComponents'
import type { AccountLifecycleClient } from './lifecycle'
import { AuthProvider } from './AuthContext'
import { InMemoryAuthStore, InMemorySessionRegistry, toAuthSession } from './authClient'
import type { AuthProviderAdapter } from './types'

function client(overrides: Partial<AccountLifecycleClient> = {}): AccountLifecycleClient {
  return {
    getStatus: vi.fn(async () => ({ state: 'active' as const })),
    requestExport: vi.fn(async () => ({
      id: 'export-1',
      state: 'queued' as const,
      createdAt: '2026-01-01',
    })),
    getExportStatus: vi.fn(async () => ({
      id: 'export-1',
      state: 'ready' as const,
      createdAt: '2026-01-01',
    })),
    downloadExport: vi.fn(async () => new Blob(['{}'], { type: 'application/json' })),
    requestDeletion: vi.fn(async () => ({
      state: 'deletion_scheduled' as const,
      deletionDueAt: '2026-01-08',
    })),
    cancelDeletion: vi.fn(async () => ({ state: 'active' as const })),
    ...overrides,
  }
}

function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

const authenticatedProvider: AuthProviderAdapter = {
  signIn: vi.fn(async () => ({
    kind: 'authenticated' as const,
    session: {
      userId: 'user-1',
      accessToken: 'private-token',
      expiresAt: Date.now() + 60_000,
      passwordAuthenticatedAt: new Date().toISOString(),
      mfaEnrolled: false,
    },
  })),
  sendRecovery: vi.fn(async () => undefined),
  verifyMfa: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
}

function renderSecure(page: ReactNode) {
  const store = new InMemoryAuthStore()
  store.setSession(
    toAuthSession({
      userId: 'user-1',
      accessToken: 'active-token',
      expiresAt: Date.now() + 60_000,
      email: 'owner@example.com',
      emailVerified: true,
    }),
  )
  return render(
    <MemoryRouter>
      <AuthProvider provider={authenticatedProvider} authStore={store}>
        {page}
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('account lifecycle screens', () => {
  afterEach(() => cleanup())
  it('shows inactivity warning without exposing private lifecycle details', async () => {
    const lifecycleClient = client({
      getStatus: vi.fn(async () => ({
        state: 'active' as const,
        inactivityWarning: { daysRemaining: 90 },
      })),
    })
    renderPage(<PrivacyPage client={lifecycleClient} />)
    expect(await screen.findByText(/account inactivity reminder/i)).toBeInTheDocument()
    expect(screen.getByText(/90 days/i)).toBeInTheDocument()
  })

  it('requests an export and exposes only its bounded state', async () => {
    const user = userEvent.setup()
    const getExportStatus = vi.fn(async () => ({
      id: 'export-1',
      state: 'building' as const,
      createdAt: '2026-01-01',
    }))
    renderPage(<ExportPage client={client({ getExportStatus })} />)
    await user.click(screen.getByRole('button', { name: /request export/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/export status: queued/i)
    await user.click(screen.getByRole('button', { name: /refresh status/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/export status: building/i)
    expect(getExportStatus).toHaveBeenCalledWith('export-1')
    expect(screen.queryByText(/token|bearer|signed_url/i)).not.toBeInTheDocument()
  })

  it('uses the same generic lifecycle error when export fails', async () => {
    const user = userEvent.setup()
    const lifecycleClient = client({
      requestExport: vi.fn(async () => {
        throw new Error('provider account exists')
      }),
    })
    renderPage(<ExportPage client={lifecycleClient} />)
    await user.click(screen.getByRole('button', { name: /request export/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't complete that account request/i)
    expect(alert).toHaveFocus()
    expect(screen.queryByText(/provider account exists/i)).not.toBeInTheDocument()
  })

  it('downloads a ready archive without rendering a bearer or signed URL', async () => {
    const user = userEvent.setup()
    const downloadExport = vi.fn(async () => new Blob(['PK'], { type: 'application/zip' }))
    const lifecycleClient = client({
      requestExport: vi.fn(async () => ({
        id: 'export-1',
        state: 'ready' as const,
        createdAt: '2026-01-01',
        expiresAt: '2026-01-08',
        generatedAt: '2026-01-01T12:00:00Z',
        fileSizeBytes: 4096,
        checksumSha256: 'ab'.repeat(32),
      })),
      downloadExport,
    })
    const createObjectURL = vi.fn(() => 'blob:private')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderPage(<ExportPage client={lifecycleClient} />)
    await user.click(screen.getByRole('button', { name: /request export/i }))
    expect(await screen.findByText(/4,096 bytes/i)).toBeInTheDocument()
    expect(screen.getByText('ab'.repeat(32))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /download zip/i }))
    expect(downloadExport).toHaveBeenCalledWith('export-1')
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:private')
    expect(document.body).not.toHaveTextContent(/bearer|signed[_ -]?url|token=/i)
    click.mockRestore()
  })

  it('offers bounded retry/support and replacement actions for failed and expired jobs', async () => {
    const user = userEvent.setup()
    const failed = client({
      requestExport: vi.fn(async () => ({
        id: 'failed-1',
        state: 'failed' as const,
        createdAt: '2026-01-01',
      })),
    })
    const view = renderPage(<ExportPage client={failed} />)
    await user.click(screen.getByRole('button', { name: /request export/i }))
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact support/i })).toHaveAttribute(
      'href',
      '/account/privacy?help=export',
    )
    view.unmount()
    renderPage(
      <ExportPage
        client={client({
          requestExport: vi.fn(async () => ({
            id: 'expired-1',
            state: 'expired' as const,
            createdAt: '2026-01-01',
          })),
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /request export/i }))
    expect(await screen.findByRole('button', { name: /create new export/i })).toBeInTheDocument()
  })

  it('requires explicit confirmation before scheduling deletion', async () => {
    const user = userEvent.setup()
    const requestDeletion = vi.fn(async () => ({ state: 'deletion_scheduled' as const }))
    renderPage(<DeleteAccountPage client={client({ requestDeletion })} />)
    const button = screen.getByRole('button', { name: /schedule deletion/i })
    expect(button).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(button)
    expect(await screen.findByRole('status')).toHaveTextContent(/request was received/i)
    expect(requestDeletion).toHaveBeenCalledOnce()
  })

  it('requires provider password reauthentication before creating an export', async () => {
    const user = userEvent.setup()
    const requestExport = vi.fn(async () => ({
      id: 'export-1',
      state: 'queued' as const,
      createdAt: '2026-01-01',
    }))
    renderSecure(<ExportPage client={client({ requestExport })} provider={authenticatedProvider} />)
    expect(screen.queryByRole('button', { name: /request export/i })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/email/i), 'owner@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'private-password')
    await user.click(screen.getByRole('button', { name: /confirm password/i }))
    const requestButton = await screen.findByRole('button', { name: /request export/i })
    expect(requestButton).toHaveFocus()
    await user.click(requestButton)
    expect(authenticatedProvider.signIn).toHaveBeenCalledWith(
      'owner@example.com',
      'private-password',
    )
    expect(requestExport).toHaveBeenCalledOnce()
  })

  it('requires an already-enrolled MFA factor and supports its recovery-code path', async () => {
    const user = userEvent.setup()
    const initialSession = toAuthSession({
      userId: 'user-1',
      accessToken: 'active-token',
      expiresAt: Date.now() + 60_000,
    })
    const authStore = new InMemoryAuthStore()
    const registry = new InMemorySessionRegistry()
    authStore.setSession(initialSession)
    await registry.registerCurrentSession(initialSession)
    const mfaProvider: AuthProviderAdapter = {
      ...authenticatedProvider,
      signIn: vi.fn(async () => ({
        kind: 'mfa_required' as const,
        challengeId: 'challenge-1',
        session: {
          userId: 'user-1',
          accessToken: 'password-token',
          expiresAt: Date.now() + 60_000,
          mfaRequired: true,
          mfaEnrolled: true,
        },
      })),
      verifyMfa: vi.fn(async () => ({
        userId: 'user-1',
        accessToken: 'aal2-token',
        expiresAt: Date.now() + 60_000,
        passwordAuthenticatedAt: new Date().toISOString(),
        mfaEnrolled: true,
        mfaVerifiedAt: new Date().toISOString(),
      })),
    }
    render(
      <MemoryRouter>
        <AuthProvider provider={mfaProvider} authStore={authStore} registry={registry}>
          <DeleteAccountPage client={client()} provider={mfaProvider} />
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/email/i), 'owner@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'private-password')
    await user.click(screen.getByRole('button', { name: /confirm password/i }))
    expect(await screen.findByText(/already has mfa/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/authentication or recovery code/i)).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /back to password/i }))
    expect(screen.getByRole('button', { name: /confirm password/i })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: /confirm password/i }))
    expect(screen.getAllByText(/recovery code/i)).toHaveLength(2)
    await user.type(screen.getByLabelText(/authentication or recovery code/i), '12345678')
    await user.click(screen.getByRole('button', { name: /verify and continue/i }))
    expect(await screen.findByText(/what deletion affects/i)).toBeInTheDocument()
    expect(
      screen.getByText(/cancellation restores ordinary account access only/i),
    ).toBeInTheDocument()
    expect(mfaProvider.verifyMfa).toHaveBeenCalledWith('challenge-1', '12345678')
  })

  it('previews deletion effects and shows the exact scheduled date returned by the server', async () => {
    const user = userEvent.setup()
    const requestDeletion = vi.fn(async () => ({
      state: 'deletion_scheduled' as const,
      deletionDueAt: '2026-01-08T12:30:00Z',
    }))
    renderPage(<DeleteAccountPage client={client({ requestDeletion })} />)
    expect(screen.getByText(/reviews are hidden immediately/i)).toBeInTheDocument()
    expect(screen.getByText(/backups age out/i)).toBeInTheDocument()
    expect(screen.getByText(/primary deletion runs on day 8/i)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /schedule deletion/i }))
    expect(
      await screen.findByRole('heading', { name: /account deletion is scheduled/i }),
    ).toHaveFocus()
    expect(await screen.findByText(/scheduled for exactly/i)).toHaveTextContent(
      new Date('2026-01-08T12:30:00Z').toLocaleString(),
    )
  })

  it('shows cancellation-only completion without reopening privileged access', async () => {
    const user = userEvent.setup()
    renderPage(<CancelDeletionPage client={client()} />)
    await user.click(screen.getByRole('button', { name: /cancel deletion/i }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/cancelled/i)
    expect(status).toHaveFocus()
    expect(screen.getByText(/privileged grants remain revoked/i)).toBeInTheDocument()
  })

  it('rejects privacy password reauthentication from a different account', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => undefined)
    const mismatch: AuthProviderAdapter = {
      ...authenticatedProvider,
      signIn: vi.fn(async () => ({
        kind: 'authenticated' as const,
        session: { userId: 'user-2', accessToken: 'other-token', expiresAt: Date.now() + 60_000 },
      })),
      signOut,
    }
    renderSecure(<ExportPage client={client()} provider={mismatch} />)
    await user.type(screen.getByLabelText(/email/i), 'other@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'private-password')
    await user.click(screen.getByRole('button', { name: /confirm password/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't sign you in/i)
    expect(screen.queryByRole('button', { name: /request export/i })).not.toBeInTheDocument()
    expect(signOut).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-2' }))
  })

  it('provides a working local sign-out action while deletion is scheduled', async () => {
    const user = userEvent.setup()
    const store = new InMemoryAuthStore()
    store.setSession(
      toAuthSession({
        userId: 'user-1',
        accessToken: 'active-token',
        expiresAt: Date.now() + 60_000,
      }),
    )
    const signOut = vi.fn(async () => undefined)
    const provider = { ...authenticatedProvider, signOut }
    render(
      <MemoryRouter>
        <AuthProvider authStore={store} provider={provider}>
          <PrivacyPage
            client={client({
              getStatus: vi.fn(async () => ({
                state: 'deletion_scheduled' as const,
                deletionDueAt: '2026-08-12T12:00:00Z',
              })),
            })}
          />
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /^sign out$/i }))
    expect(store.getSession()).toBeNull()
    expect(signOut).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }))
  })

  it('rejects an MFA result bound to a different account', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => undefined)
    const mismatch: AuthProviderAdapter = {
      ...authenticatedProvider,
      signIn: vi.fn(async () => ({
        kind: 'mfa_required' as const,
        challengeId: 'challenge-other',
        session: {
          userId: 'user-1',
          accessToken: 'password-token',
          expiresAt: Date.now() + 60_000,
        },
      })),
      verifyMfa: vi.fn(async () => ({
        userId: 'user-2',
        accessToken: 'other-aal2',
        expiresAt: Date.now() + 60_000,
      })),
      signOut,
    }
    renderSecure(<DeleteAccountPage client={client()} provider={mismatch} />)
    await user.type(screen.getByLabelText(/email/i), 'owner@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'private-password')
    await user.click(screen.getByRole('button', { name: /confirm password/i }))
    await user.type(await screen.findByLabelText(/authentication or recovery code/i), '123456')
    await user.click(screen.getByRole('button', { name: /verify and continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't verify/i)
    expect(screen.queryByText(/what deletion affects/i)).not.toBeInTheDocument()
    expect(signOut).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-2' }))
  })
})
