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
  return render(
    <MemoryRouter>
      <AuthProvider provider={authenticatedProvider}>{page}</AuthProvider>
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn't complete that account request/i,
    )
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
    await user.click(await screen.findByRole('button', { name: /request export/i }))
    expect(authenticatedProvider.signIn).toHaveBeenCalledWith(
      'owner@example.com',
      'private-password',
    )
    expect(requestExport).toHaveBeenCalledOnce()
  })

  it('requires an already-enrolled MFA factor and supports its recovery-code path', async () => {
    const user = userEvent.setup()
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
        <AuthProvider provider={mfaProvider}>
          <DeleteAccountPage client={client()} provider={mfaProvider} />
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/email/i), 'owner@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'private-password')
    await user.click(screen.getByRole('button', { name: /confirm password/i }))
    expect(await screen.findByText(/already has mfa/i)).toBeInTheDocument()
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
    expect(await screen.findByText(/scheduled for exactly/i)).toHaveTextContent(
      new Date('2026-01-08T12:30:00Z').toLocaleString(),
    )
  })

  it('shows cancellation-only completion without reopening privileged access', async () => {
    const user = userEvent.setup()
    renderPage(<CancelDeletionPage client={client()} />)
    await user.click(screen.getByRole('button', { name: /cancel deletion/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/cancelled/i)
    expect(screen.getByText(/privileged grants remain revoked/i)).toBeInTheDocument()
  })
})
