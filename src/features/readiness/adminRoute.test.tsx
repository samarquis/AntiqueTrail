import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadinessAdminPage } from './adminRoute'
import type { ReadinessAdminClient, ReadinessAdminWorkspace } from './adminTypes'

afterEach(cleanup)

const workspace: ReadinessAdminWorkspace = {
  cohort: { cohortId: 'cohort-1', areaSlug: 'topeka-ks', state: 'active', version: 1 },
  invitations: [],
  subjects: [],
  run: null,
  capabilities: {
    listingsPrivate: true,
    noindex: true,
    anonymousRealStoreAccess: false,
    publicReviews: false,
    publicPromotion: false,
  },
}

function client(overrides: Partial<ReadinessAdminClient> = {}): ReadinessAdminClient {
  return {
    getWorkspace: vi.fn(async () => workspace),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    markStarted: vi.fn(),
    excludeSubject: vi.fn(),
    beginRun: vi.fn(),
    calculateGate: vi.fn(),
    freezeReceipt: vi.fn(),
    requestSigningCapability: vi.fn(),
    decideReceipt: vi.fn(),
    ...overrides,
  }
}

function renderPage(readiness: ReadinessAdminClient) {
  return render(
    <MemoryRouter>
      <ReadinessAdminPage client={readiness} />
    </MemoryRouter>,
  )
}

describe('ReadinessAdminPage', () => {
  it('renders a bounded empty cohort and starts a server-owned run', async () => {
    const readiness = client({ beginRun: vi.fn(async () => ({})) })
    renderPage(readiness)

    expect(
      await screen.findByRole('heading', { name: /regional readiness operations/i }),
    ).toBeVisible()
    expect(screen.getByText(/no accepted synthetic subjects yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /start evidence run/i }))

    await waitFor(() =>
      expect(readiness.beginRun).toHaveBeenCalledWith(
        'cohort-1',
        expect.any(String),
        expect.any(String),
      ),
    )
  })

  it('shows a one-time synthetic invitation result without accepting raw email', async () => {
    const readiness = client({
      createInvitation: vi.fn(async () => ({
        invitationId: 'invitation-1',
        state: 'pending' as const,
        expiresAt: '2026-09-08T00:00:00Z',
        token: 'synthetic-token',
        replayed: false,
      })),
    })
    renderPage(readiness)

    await screen.findByRole('heading', { name: /regional readiness operations/i })
    fireEvent.change(screen.getByLabelText(/verified synthetic email hmac/i), {
      target: { value: 'a'.repeat(64) },
    })
    fireEvent.click(screen.getByRole('button', { name: /create synthetic invitation/i }))

    expect(await screen.findByText('synthetic-token')).toBeInTheDocument()
    expect(readiness.createInvitation).toHaveBeenCalledWith(
      'cohort-1',
      'a'.repeat(64),
      expect.any(String),
    )
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument()
  })

  it('fails closed with retry and no controls when the server denies the scope', async () => {
    const readiness = client({
      getWorkspace: vi.fn(async () => Promise.reject(new Error('secret'))),
    })
    renderPage(readiness)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no cohort or evidence decision was changed/i,
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /freeze evidence/i })).not.toBeInTheDocument()
  })
})
