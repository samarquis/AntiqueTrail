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

  it('shows cancellation-only completion without reopening privileged access', async () => {
    const user = userEvent.setup()
    renderPage(<CancelDeletionPage client={client()} />)
    await user.click(screen.getByRole('button', { name: /cancel deletion/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/cancelled/i)
    expect(screen.getByText(/privileged grants remain revoked/i)).toBeInTheDocument()
  })
})
