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
      storeId: '00000000-0000-4000-8000-000000000009',
      state: 'verification_pending' as const,
      ownerIntent: false,
      version: 3,
      exactStoreScope: 'synthetic-store',
      verifiedSignals: [{ channelClass: 'callback', signalType: 'authority' }],
      pendingSignals: [
        {
          signalId: '22222222-2222-4222-8222-222222222222',
          channelClass: 'published_business_contact',
          signalType: 'domain_response',
        },
      ],
    })),
    decide: vi.fn(async (input) => ({
      claimId: input.claimId,
      state: input.operation === 'approve' ? ('approved' as const) : ('changes_requested' as const),
      ownerIntent: false,
      version: input.expectedVersion + 1,
      exactStoreScope: 'synthetic-store',
    })),
    issueSyntheticInvitation: vi.fn(async () => ({
      invitationId: 'invitation-1',
      token: 'one-time-secret',
      expiresAt: '2026-08-04T12:30:00Z',
    })),
    verifySignal: vi.fn(async (input) => ({
      claimId: input.claimId,
      state: 'verification_pending' as const,
      ownerIntent: false,
      version: input.expectedVersion + 1,
      exactStoreScope: 'synthetic-store',
      verifiedSignals: [
        { channelClass: 'published_business_contact', signalType: 'domain_response' },
      ],
      pendingSignals: [],
    })),
    listStoreTeam: vi.fn(async () => ({
      members: [
        {
          grantId: 'grant-editor',
          role: 'listing_editor' as const,
          displayName: 'Jordan Editor',
          version: 2,
        },
      ],
    })),
    revokeStoreTeamAccess: vi.fn(async () => undefined),
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
    await user.type(screen.getByLabelText(/^decision key$/i), 'approve-claim-v3')
    expect(
      screen.queryByRole('option', {
        name: /Approve Store Owner for this exact synthetic store/i,
      }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /apply decision/i }))
    expect(boundary.decide).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /confirm approve decision/i }))

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

  it('confirms Owner approval with the UUID while showing the human-readable store scope', async () => {
    const user = userEvent.setup()
    const boundary = client({
      ownerApprovalAvailable: true,
      getCase: vi.fn(async () => ({
        claimId: '11111111-1111-4111-8111-111111111111',
        storeId: '00000000-0000-4000-8000-000000000009',
        state: 'verification_pending' as const,
        ownerIntent: true,
        version: 3,
        exactStoreScope: 'synthetic-store',
      })),
    })
    render(
      <MemoryRouter>
        <PartnerAdminPage client={boundary} />
      </MemoryRouter>,
    )

    const claimId = '11111111-1111-4111-8111-111111111111'
    const storeId = '00000000-0000-4000-8000-000000000009'
    await user.type(screen.getByLabelText(/exact claim id/i), claimId)
    await user.click(screen.getByRole('button', { name: /open exact claim/i }))
    await screen.findByText(/verification pending/i)

    const decision = screen.getByLabelText(/^decision$/i) as HTMLSelectElement
    expect(Array.from(decision.options, (option) => option.value)).not.toContain('approve')
    expect(Array.from(decision.options, (option) => option.value)).not.toContain('transfer')
    expect(
      screen.getByRole('option', {
        name: /Approve Store Owner for this exact synthetic store/i,
      }),
    ).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^decision$/i), 'approve_owner')
    await user.type(screen.getByLabelText(/^decision key$/i), 'owner-approval-v3')
    await user.click(screen.getByRole('button', { name: /apply decision/i }))
    expect(
      screen.getByText(/Confirm Store Owner approval for exact store synthetic-store/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /confirm approve owner decision/i }))

    expect(boundary.decide).toHaveBeenCalledWith({
      operation: 'approve_owner',
      claimId,
      expectedVersion: 3,
      idempotencyKey: 'owner-approval-v3',
      reasonCode: 'owner_boundary_confirmed',
      transferFromClaimId: undefined,
      confirmedStoreId: storeId,
    })
  })

  it('hides generic approve and transfer when the claim intent is unclassified', async () => {
    const user = userEvent.setup()
    const boundary = client({
      getCase: vi.fn(async () => ({
        claimId: '11111111-1111-4111-8111-111111111111',
        storeId: '00000000-0000-4000-8000-000000000009',
        state: 'verification_pending' as const,
        version: 3,
        exactStoreScope: 'synthetic-store',
      })),
    })
    render(
      <MemoryRouter>
        <PartnerAdminPage client={boundary} />
      </MemoryRouter>,
    )

    await user.type(
      screen.getByLabelText(/exact claim id/i),
      '11111111-1111-4111-8111-111111111111',
    )
    await user.click(screen.getByRole('button', { name: /open exact claim/i }))
    await screen.findByText(/verification pending/i)

    const decision = screen.getByLabelText(/^decision$/i) as HTMLSelectElement
    expect(Array.from(decision.options, (option) => option.value)).not.toContain('approve')
    expect(Array.from(decision.options, (option) => option.value)).not.toContain('transfer')
  })

  it.each([undefined, 'synthetic-store'])(
    'does not offer Owner approval without a UUID store ID (%s)',
    async (storeId) => {
      const boundary = client({
        ownerApprovalAvailable: true,
        getCase: vi.fn(async () => ({
          claimId: '11111111-1111-4111-8111-111111111111',
          ...(storeId === undefined ? {} : { storeId }),
          state: 'verification_pending' as const,
          ownerIntent: true,
          version: 3,
          exactStoreScope: 'synthetic-store',
        })),
      })
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <PartnerAdminPage client={boundary} />
        </MemoryRouter>,
      )
      await user.type(
        screen.getByLabelText(/exact claim id/i),
        '11111111-1111-4111-8111-111111111111',
      )
      await user.click(screen.getByRole('button', { name: /open exact claim/i }))
      await screen.findByText(/verification pending/i)

      expect(
        screen.queryByRole('option', {
          name: /Approve Store Owner for this exact synthetic store/i,
        }),
      ).not.toBeInTheDocument()
    },
  )

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

  it('verifies a submitted signal without rendering or sending raw evidence', async () => {
    const user = userEvent.setup()
    const boundary = client()
    render(
      <MemoryRouter>
        <PartnerAdminPage client={boundary} />
      </MemoryRouter>,
    )
    await user.type(
      screen.getByLabelText(/exact claim id/i),
      '11111111-1111-4111-8111-111111111111',
    )
    await user.click(screen.getByRole('button', { name: /open exact claim/i }))
    expect(
      await screen.findByRole('heading', { name: /submitted authority signals/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/evidence ref|evidence hmac/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/signal decision reason/i), 'authority_confirmed')
    await user.type(screen.getByLabelText(/signal decision key/i), 'verify-signal-v3')
    await user.click(
      screen.getByRole('button', { name: /verify published business contact signal/i }),
    )
    expect(boundary.verifySignal).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/confirm authority signal decision/i)).toHaveTextContent(
      /adds the pending signal/i,
    )
    await user.click(screen.getByRole('button', { name: /confirm verify signal/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/signal verified and added/i)

    expect(boundary.verifySignal).toHaveBeenCalledWith({
      operation: 'verify',
      claimId: '11111111-1111-4111-8111-111111111111',
      signalId: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 3,
      idempotencyKey: 'verify-signal-v3',
      reasonCode: 'authority_confirmed',
    })
  })

  it('requires confirmation before rejecting an authority signal', async () => {
    const user = userEvent.setup()
    const boundary = client()
    render(
      <MemoryRouter>
        <PartnerAdminPage client={boundary} />
      </MemoryRouter>,
    )
    await user.type(
      screen.getByLabelText(/exact claim id/i),
      '11111111-1111-4111-8111-111111111111',
    )
    await user.click(screen.getByRole('button', { name: /open exact claim/i }))
    await user.type(screen.getByLabelText(/signal decision reason/i), 'insufficient_authority')
    await user.type(screen.getByLabelText(/signal decision key/i), 'reject-signal-v3')
    await user.click(
      screen.getByRole('button', { name: /reject published business contact signal/i }),
    )
    expect(boundary.verifySignal).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /confirm reject signal/i }))
    expect(boundary.verifySignal).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'reject' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      /pending signal resolved and removed/i,
    )
  })

  it('lets Site Admin revoke exact-store team access after explicit confirmation', async () => {
    const user = userEvent.setup()
    const boundary = client()
    render(
      <MemoryRouter>
        <PartnerAdminPage client={boundary} />
      </MemoryRouter>,
    )

    await user.type(
      screen.getByLabelText(/exact claim id/i),
      '11111111-1111-4111-8111-111111111111',
    )
    await user.click(screen.getByRole('button', { name: /open exact claim/i }))
    expect(await screen.findByText('Jordan Editor — Listing Editor')).toBeInTheDocument()
    expect(boundary.listStoreTeam).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000009')

    await user.click(screen.getByRole('button', { name: 'Remove team access for Jordan Editor' }))
    expect(boundary.revokeStoreTeamAccess).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm remove Jordan Editor' })).toBeDisabled()
    await user.type(
      screen.getByLabelText(/reason for removal/i),
      'Access removed after authorization mismatch',
    )
    await user.click(screen.getByRole('button', { name: 'Confirm remove Jordan Editor' }))
    expect(boundary.revokeStoreTeamAccess).toHaveBeenCalledWith({
      storeId: '00000000-0000-4000-8000-000000000009',
      grantId: 'grant-editor',
      expectedVersion: 2,
      idempotencyKey: expect.any(String),
      reason: 'Access removed after authorization mismatch',
    })
  })
})
