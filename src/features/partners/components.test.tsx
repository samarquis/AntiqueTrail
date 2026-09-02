import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PartnerClaimPage,
  PartnerDraftPage,
  PartnerActivatePage,
  PartnerJoinPage,
  PartnerStatusPage,
  PartnerVerifyPage,
} from './components'
import {
  EMAIL_GATE_MESSAGE,
  GENERIC_PARTNER_ERROR,
  loadPartnerResume,
  readInvitationToken,
  scrubInvitationUrl,
} from './partnerClient'
import type { PartnerClient } from './types'

function client(overrides: Partial<PartnerClient> = {}): PartnerClient {
  return {
    exchangeInvitation: vi.fn(async () => ({
      state: 'active' as const,
      resumeHandle: 'resume-handle-123456789',
    })),
    resumeInvitation: vi.fn(async () => ({ state: 'active' as const })),
    acceptConsent: vi.fn(async () => ({
      invitation: 'registration_pending' as const,
      pendingIdentity: 'provisional' as const,
      onboarding: 'draft' as const,
    })),
    getConsentStatus: vi.fn(async () => ({
      requiredVersion: 'synthetic-v3',
      acceptedVersion: 'synthetic-v3',
      reconsentRequired: false,
      materialTerms: [],
    })),
    acceptMaterialTerms: vi.fn(async () => ({
      requiredVersion: 'synthetic-v3',
      acceptedVersion: 'synthetic-v3',
      reconsentRequired: false,
      materialTerms: [],
    })),
    bindIdentity: vi.fn(async () => {
      throw new Error(EMAIL_GATE_MESSAGE)
    }),
    getStatus: vi.fn(async () => ({
      invitation: 'consumed' as const,
      pendingIdentity: 'bound' as const,
      onboarding: 'draft' as const,
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
    })),
    getClaimStatus: vi.fn(async () => null),
    submitAuthoritySignal: vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
    })),
    withdrawClaim: vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'withdrawn' as const,
    })),
    requestAuthorityRecheck: vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
    })),
    ...overrides,
  }
}
function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

describe('partner onboarding boundary', () => {
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })
  it('accepts only bounded opaque invitation fragments and scrubs the URL', () => {
    expect(readInvitationToken('#token=short')).toBeNull()
    expect(readInvitationToken('#token=opaque-123456789')).toBe('opaque-123456789')
    const replaceState = vi.fn()
    scrubInvitationUrl({ replaceState })
    expect(replaceState).toHaveBeenCalledWith({}, '', '/partner/join')
  })
  it('does not render or retain the invitation token after join exchange', async () => {
    window.history.replaceState({}, '', '/partner/join#token=opaque-123456789')
    const exchangeInvitation = vi.fn(async () => ({
      state: 'active' as const,
      resumeHandle: 'resume-handle-123456789',
    }))
    renderPage(<PartnerJoinPage client={client({ exchangeInvitation })} />)
    expect(await screen.findByRole('heading', { name: /review invitation/i })).toBeInTheDocument()
    expect(exchangeInvitation).toHaveBeenCalledWith('opaque-123456789')
    expect(window.location.hash).toBe('')
    expect(screen.queryByText('opaque-123456789')).not.toBeInTheDocument()
    expect(loadPartnerResume(window.sessionStorage)).toMatchObject({
      resumeHandle: 'resume-handle-123456789',
    })
    expect(JSON.stringify(window.sessionStorage)).not.toContain('opaque-123456789')
  })
  it('resumes safely after refresh with only the server-issued handle', async () => {
    window.sessionStorage.setItem(
      'antique-trail.partner-resume',
      JSON.stringify({
        resumeHandle: 'resume-handle-123456789',
        consentAttemptId: 'attempt-123456789',
      }),
    )
    window.history.replaceState({}, '', '/partner/join')
    const resumeInvitation = vi.fn(async () => ({ state: 'active' as const }))
    renderPage(<PartnerJoinPage client={client({ resumeInvitation })} />)
    expect(await screen.findByLabelText(/your name/i)).toBeInTheDocument()
    expect(resumeInvitation).toHaveBeenCalledWith('resume-handle-123456789')
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
    await user.type(await screen.findByLabelText(/your name/i), 'Sam Marquis')
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
        resumeHandle: 'resume-handle-123456789',
        idempotencyKey: expect.stringMatching(/^partner-consent-/),
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

  it('requires material-term reconsent before claim or activation actions', async () => {
    const user = userEvent.setup()
    const required = {
      requiredVersion: 'synthetic-v3',
      acceptedVersion: 'synthetic-v2',
      reconsentRequired: true,
      materialTerms: ['Store data permitted for the pilot', 'Participation remains voluntary'],
    }
    const accepted = { ...required, acceptedVersion: 'synthetic-v3', reconsentRequired: false }
    const acceptMaterialTerms = vi.fn(async () => accepted)
    const getConsentStatus = vi
      .fn<PartnerClient['getConsentStatus']>()
      .mockResolvedValueOnce(required)
      .mockResolvedValue(accepted)
    const consentClient = client({
      getConsentStatus,
      acceptMaterialTerms,
      getClaimStatus: vi.fn(async () => ({
        claimId: 'claim-1',
        state: 'verification_pending' as const,
      })),
    })
    renderPage(<PartnerClaimPage client={consentClient} />)
    expect(
      await screen.findByRole('heading', { name: /material terms changed/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^submit claim$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /withdraw claim/i })).toBeInTheDocument()
    for (const label of [/read the updated material terms/i, /continue voluntarily/i])
      await user.click(screen.getByLabelText(label))
    await user.click(screen.getByRole('button', { name: /accept updated terms/i }))
    expect(acceptMaterialTerms).toHaveBeenCalledWith({
      policyVersion: 'synthetic-v3',
      acknowledgements: { reviewed: true, voluntary: true },
      idempotencyKey: expect.stringMatching(/^partner-reconsent-/),
    })
    expect(await screen.findByRole('button', { name: /^submit claim$/i })).toBeInTheDocument()

    cleanup()
    renderPage(<PartnerActivatePage client={consentClient} />)
    expect(await screen.findByText(/material terms are current/i)).toBeInTheDocument()
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
    await user.type(await screen.findByLabelText(/store name/i), 'Oak Antiques')
    await user.type(screen.getByLabelText(/address/i), '123 Main Street')
    await user.click(screen.getByRole('button', { name: /save draft/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/draft/i)
    await user.click(screen.getByRole('button', { name: /submit draft for review/i }))
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some((status) => status.textContent?.includes('Draft status: submitted')),
      ).toBe(true),
    )
    cleanup()
    renderPage(
      <PartnerStatusPage
        client={client({
          getStatus: vi.fn(async () => ({
            invitation: 'consumed' as const,
            pendingIdentity: 'bound' as const,
            onboarding: 'submitted' as const,
          })),
        })}
      />,
    )
    expect(await screen.findByText(/onboarding: submitted/i)).toBeInTheDocument()
  })

  it('does not expose partner draft fields before authoritative access is granted', async () => {
    let resolveStatus: (status: Awaited<ReturnType<PartnerClient['getStatus']>>) => void
    const getStatus = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<PartnerClient['getStatus']>>>((resolve) => {
          resolveStatus = resolve
        }),
    )
    renderPage(<PartnerDraftPage client={client({ getStatus })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByLabelText(/store name/i)).not.toBeInTheDocument()

    resolveStatus!({
      invitation: 'consumed',
      pendingIdentity: 'bound',
      onboarding: 'draft',
    })
    expect(await screen.findByLabelText(/store name/i)).toBeInTheDocument()
  })

  it('fails closed when partner draft status is denied or unavailable', async () => {
    const denied = client({
      getStatus: vi.fn(async () => ({
        invitation: 'consumed' as const,
        pendingIdentity: 'provisional' as const,
        onboarding: 'draft' as const,
      })),
    })
    renderPage(<PartnerDraftPage client={denied} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_PARTNER_ERROR)
    expect(screen.queryByLabelText(/store name/i)).not.toBeInTheDocument()

    cleanup()
    renderPage(
      <PartnerDraftPage client={client({ getStatus: vi.fn(async () => Promise.reject()) })} />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_PARTNER_ERROR)
    expect(screen.queryByLabelText(/store name/i)).not.toBeInTheDocument()
  })

  it('submits a minimized store claim without implying endorsement or access', async () => {
    const user = userEvent.setup()
    const submitClaim = vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'submitted' as const,
    }))
    renderPage(
      <PartnerClaimPage
        client={client({ submitClaim })}
        selectedStoreId="10000000-0000-4000-8000-000000000001"
      />,
    )

    await screen.findByText(/selected listing is ready/i)
    await user.type(screen.getByLabelText(/relationship to the store/i), ' Owner ')
    await user.type(
      screen.getByLabelText(/authority statement/i),
      'I am authorized to maintain this store listing.',
    )
    await user.click(screen.getByRole('button', { name: /submit claim/i }))

    expect(submitClaim).toHaveBeenCalledWith({
      storeId: '10000000-0000-4000-8000-000000000001',
      relationship: 'Owner',
      authorityStatement: 'I am authorized to maintain this store listing.',
      idempotencyKey: expect.stringMatching(/^public-claim-/),
    })
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some((status) => status.textContent?.includes('Claim status: submitted')),
      ).toBe(true),
    )
    expect(screen.getByText(/does not grant access or imply endorsement/i)).toBeInTheDocument()
  })

  it('submits independent authority signals without rendering evidence details', async () => {
    const user = userEvent.setup()
    const getClaimStatus = vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
    }))
    const submitAuthoritySignal = vi.fn(async () => ({
      claimId: 'claim-1',
      state: 'verification_pending' as const,
    }))
    renderPage(<PartnerClaimPage client={client({ getClaimStatus, submitAuthoritySignal })} />)

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .some((status) => status.textContent?.includes('Claim status: verification_pending')),
      ).toBe(true),
    )
    expect(screen.queryByText(/authority signals verified/i)).not.toBeInTheDocument()
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
    }))
    renderPage(
      <PartnerClaimPage
        client={client({
          requestAuthorityRecheck,
          getClaimStatus: vi.fn(async () => ({
            claimId: 'claim-1',
            state: 'conflict' as const,
            recheckDueAt: '2026-09-01T00:00:00.000Z',
            conflict: { state: 'open' as const },
          })),
        })}
        selectedStoreId="10000000-0000-4000-8000-000000000001"
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
