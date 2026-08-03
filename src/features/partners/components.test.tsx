import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PartnerClaimPage,
  PartnerDraftPage,
  PartnerJoinPage,
  PartnerStatusPage,
  PartnerVerifyPage,
} from './components'
import { EMAIL_GATE_MESSAGE, readInvitationToken, scrubInvitationUrl } from './partnerClient'
import type { PartnerClient } from './types'

function client(overrides: Partial<PartnerClient> = {}): PartnerClient {
  return {
    exchangeInvitation: vi.fn(async () => ({ state: 'active' as const })),
    acceptConsent: vi.fn(async () => ({
      invitation: 'registration_pending' as const,
      pendingIdentity: 'provisional' as const,
      onboarding: 'draft' as const,
    })),
    bindIdentity: vi.fn(async () => {
      throw new Error(EMAIL_GATE_MESSAGE)
    }),
    getStatus: vi.fn(async () => ({
      invitation: 'consumed' as const,
      pendingIdentity: 'bound' as const,
      onboarding: 'submitted' as const,
    })),
    saveDraft: vi.fn(async () => ({
      invitation: 'consumed' as const,
      pendingIdentity: 'bound' as const,
      onboarding: 'draft' as const,
    })),
    submitDraft: vi.fn(async () => ({
      invitation: 'consumed' as const,
      pendingIdentity: 'bound' as const,
      onboarding: 'submitted' as const,
    })),
    withdraw: vi.fn(async () => ({
      invitation: 'consumed' as const,
      pendingIdentity: 'bound' as const,
      onboarding: 'withdrawn' as const,
    })),
    submitClaim: vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'submitted' as const,
      riskTier: 'standard' as const,
      verifiedSignalCount: 0,
      requiredSignalCount: 2 as const,
    })),
    getClaimStatus: vi.fn(async () => null),
    submitAuthoritySignal: vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
      riskTier: 'standard' as const,
      verifiedSignalCount: 0,
      requiredSignalCount: 2 as const,
    })),
    withdrawClaim: vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'withdrawn' as const,
      riskTier: 'standard' as const,
      verifiedSignalCount: 0,
      requiredSignalCount: 2 as const,
    })),
    requestAuthorityRecheck: vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
      riskTier: 'standard' as const,
      verifiedSignalCount: 0,
      requiredSignalCount: 2 as const,
    })),
    ...overrides,
  }
}
function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

describe('partner onboarding boundary', () => {
  afterEach(() => cleanup())
  it('accepts only bounded opaque invitation fragments and scrubs the URL', () => {
    expect(readInvitationToken('#token=short')).toBeNull()
    expect(readInvitationToken('#token=opaque-123456789')).toBe('opaque-123456789')
    const replaceState = vi.fn()
    scrubInvitationUrl({ replaceState })
    expect(replaceState).toHaveBeenCalledWith({}, '', '/partner/join')
  })
  it('does not render or retain the invitation token after join exchange', async () => {
    window.history.replaceState({}, '', '/partner/join#token=opaque-123456789')
    const exchangeInvitation = vi.fn(async () => ({ state: 'active' as const }))
    renderPage(<PartnerJoinPage client={client({ exchangeInvitation })} />)
    expect(await screen.findByRole('heading', { name: /review invitation/i })).toBeInTheDocument()
    expect(exchangeInvitation).toHaveBeenCalledWith('opaque-123456789')
    expect(window.location.hash).toBe('')
    expect(screen.queryByText('opaque-123456789')).not.toBeInTheDocument()
  })
  it('requires typed identity and each separate consent acknowledgement', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/partner/join#token=opaque-123456789')
    const acceptConsent = vi.fn(async () => ({
      invitation: 'registration_pending' as const,
      pendingIdentity: 'provisional' as const,
      onboarding: 'draft' as const,
    }))
    renderPage(<PartnerJoinPage client={client({ acceptConsent })} />)
    await screen.findByRole('heading', { name: /review invitation/i })
    await user.type(screen.getByLabelText(/your name/i), 'Sam Marquis')
    await user.type(screen.getByLabelText(/title or role/i), 'Owner')
    await user.type(screen.getByLabelText(/^store name$/i), 'Oak Antiques')
    await user.type(screen.getByLabelText(/owner-controlled email/i), ' OWNER@Example.COM ')
    for (const label of [
      /does not grant store authority/i,
      /participating voluntarily/i,
      /sharing only the requested store draft data/i,
      /unpaid and does not promise payment/i,
      /withdraw this onboarding request/i,
    ])
      await user.click(screen.getByLabelText(label))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(acceptConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ email: 'owner@example.com' }),
        acknowledgements: {
          authority: true,
          voluntary: true,
          permittedData: true,
          noPayment: true,
          withdrawal: true,
        },
      }),
    )
  })
  it('keeps E-01 provider work clearly gated', async () => {
    const user = userEvent.setup()
    renderPage(<PartnerVerifyPage client={client()} />)
    await user.click(screen.getByRole('button', { name: /check verification/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(EMAIL_GATE_MESSAGE)
  })
  it('preserves draft fields and exposes own reason-neutral status', async () => {
    const user = userEvent.setup()
    renderPage(<PartnerDraftPage client={client()} />)
    await user.type(screen.getByLabelText(/store name/i), 'Oak Antiques')
    await user.type(screen.getByLabelText(/address/i), '123 Main Street')
    await user.click(screen.getByRole('button', { name: /save draft/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/draft/i)
    await user.click(screen.getByRole('button', { name: /submit draft for review/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/submitted/i)
    cleanup()
    renderPage(<PartnerStatusPage client={client()} />)
    expect(await screen.findByText(/onboarding: submitted/i)).toBeInTheDocument()
  })

  it('submits a minimized store claim without implying endorsement or access', async () => {
    const user = userEvent.setup()
    const submitClaim = vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'submitted' as const,
      riskTier: 'standard' as const,
      verifiedSignalCount: 0,
      requiredSignalCount: 2 as const,
    }))
    renderPage(<PartnerClaimPage client={client({ submitClaim })} />)

    await user.type(screen.getByLabelText(/store reference/i), ' synthetic-store-1 ')
    await user.type(screen.getByLabelText(/relationship to the store/i), ' Owner ')
    await user.type(
      screen.getByLabelText(/authority statement/i),
      'I am authorized to maintain this store listing.',
    )
    await user.click(screen.getByRole('button', { name: /submit claim/i }))

    expect(submitClaim).toHaveBeenCalledWith({
      storeReference: 'synthetic-store-1',
      relationship: 'Owner',
      authorityStatement: 'I am authorized to maintain this store listing.',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/submitted/i)
    expect(screen.getByText(/does not grant access or imply endorsement/i)).toBeInTheDocument()
  })

  it('submits independent authority signals without rendering evidence details', async () => {
    const user = userEvent.setup()
    const getClaimStatus = vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
      riskTier: 'elevated' as const,
      verifiedSignalCount: 1,
      requiredSignalCount: 2 as const,
    }))
    const submitAuthoritySignal = vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
      riskTier: 'elevated' as const,
      verifiedSignalCount: 1,
      requiredSignalCount: 2 as const,
    }))
    renderPage(<PartnerClaimPage client={client({ getClaimStatus, submitAuthoritySignal })} />)

    expect(await screen.findByText(/1 of 2 authority signals verified/i)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/authority signal channel/i), 'callback')
    await user.type(screen.getByLabelText(/evidence reference/i), 'case-ref-17')
    await user.click(screen.getByRole('button', { name: /submit authority signal/i }))

    expect(submitAuthoritySignal).toHaveBeenCalledWith({
      claimId: 'claim-1',
      channelClass: 'callback',
      evidenceReference: 'case-ref-17',
    })
    expect(screen.queryByText('case-ref-17')).not.toBeInTheDocument()
  })

  it('shows reason-neutral conflict and recheck actions without another claimant identity', async () => {
    const user = userEvent.setup()
    const requestAuthorityRecheck = vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
      riskTier: 'high' as const,
      verifiedSignalCount: 0,
      requiredSignalCount: 2 as const,
    }))
    renderPage(
      <PartnerClaimPage
        client={client({
          requestAuthorityRecheck,
          getClaimStatus: vi.fn(async () => ({
            claimId: 'claim-1',
            state: 'conflict' as const,
            riskTier: 'high' as const,
            verifiedSignalCount: 2,
            requiredSignalCount: 2 as const,
            recheckDueAt: '2026-09-01T00:00:00.000Z',
            conflict: { state: 'open' as const },
          })),
        })}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/needs administrator review/i)
    expect(
      screen.queryByText(/another claimant|other claimant|owner@example/i),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /request authority recheck/i }))
    expect(requestAuthorityRecheck).toHaveBeenCalledWith('claim-1')
  })
})
