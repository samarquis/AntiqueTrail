import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PartnerAdminClient } from './partnerAdmin'
import { PartnerAdminPage } from './partnerAdminComponents'

function client(overrides: Partial<PartnerAdminClient> = {}): PartnerAdminClient {
  return {
    getCase: vi.fn(async () => ({
      claimId: '11111111-1111-4111-8111-111111111111',
      state: 'verification_pending' as const,
      version: 3,
      exactStoreScope: 'synthetic-store',
      verifiedSignals: [{ channelClass: 'callback', signalType: 'authority' }],
    })),
    decide: vi.fn(async (input) => ({
      claimId: input.claimId,
      state: input.operation === 'approve' ? ('approved' as const) : ('changes_requested' as const),
      version: input.expectedVersion + 1,
      exactStoreScope: 'synthetic-store',
    })),
    issueSyntheticInvitation: vi.fn(async () => ({
      invitationId: 'invitation-1',
      token: 'one-time-secret',
      expiresAt: '2026-08-04T12:30:00Z',
    })),
    ...overrides,
  }
}

describe('Partner Administrator screen', () => {
  afterEach(cleanup)

  it('issues a synthetic invitation without claiming email delivery', async () => {
    const user = userEvent.setup()
    const boundary = client()
    render(
      <MemoryRouter>
        <PartnerAdminPage client={boundary} />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/owner-controlled email/i), 'owner@example.com')
    await user.type(screen.getByLabelText(/issuance key/i), 'invite-owner-1')
    await user.click(screen.getByRole('button', { name: /create synthetic invitation/i }))

    expect(boundary.issueSyntheticInvitation).toHaveBeenCalledWith({
      email: 'owner@example.com',
      idempotencyKey: 'invite-owner-1',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/copy this invitation now/i)
    expect(screen.getByText('one-time-secret')).toBeInTheDocument()
    expect(screen.getByText(/email delivery remains disabled/i)).toBeInTheDocument()
  })

  it('loads one exact claim and submits a version-bound decision', async () => {
    const user = userEvent.setup()
    const boundary = client()
    render(
      <MemoryRouter>
        <PartnerAdminPage client={boundary} />
      </MemoryRouter>,
    )

    const claimId = '11111111-1111-4111-8111-111111111111'
    await user.type(screen.getByLabelText(/exact claim id/i), claimId)
    await user.click(screen.getByRole('button', { name: /open exact claim/i }))
    expect(await screen.findByText(/verification pending/i)).toBeInTheDocument()
    expect(screen.getByText(/synthetic-store/i)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^decision$/i), 'approve')
    await user.type(screen.getByLabelText(/reason code/i), 'verified_authority')
    await user.type(screen.getByLabelText(/decision key/i), 'approve-claim-v3')
    await user.click(screen.getByRole('button', { name: /apply decision/i }))

    expect(boundary.decide).toHaveBeenCalledWith({
      operation: 'approve',
      claimId,
      expectedVersion: 3,
      idempotencyKey: 'approve-claim-v3',
      reasonCode: 'verified_authority',
      transferFromClaimId: undefined,
    })
    expect(await screen.findByText(/^approved$/i)).toBeInTheDocument()
  })

  it('shows a generic failure without leaking provider or authorization details', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PartnerAdminPage
          client={client({ getCase: vi.fn(async () => Promise.reject(new Error('row secret'))) })}
        />
      </MemoryRouter>,
    )
    await user.type(
      screen.getByLabelText(/exact claim id/i),
      '11111111-1111-4111-8111-111111111111',
    )
    await user.click(screen.getByRole('button', { name: /open exact claim/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/item is not available/i)
    expect(screen.queryByText(/row secret/i)).not.toBeInTheDocument()
  })
})
