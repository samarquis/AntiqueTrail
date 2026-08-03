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
    renderPage(<ExportPage client={client()} />)
    await user.click(screen.getByRole('button', { name: /request export/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/export status: queued/i)
    expect(screen.queryByText(/token|bearer|signed_url/i)).not.toBeInTheDocument()
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
