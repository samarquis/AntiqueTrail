import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
      /participating voluntarily/i,
      /unpaid/i,
      /invitation-only/i,
      /grants no access/i,
    ])
      await user.click(screen.getByLabelText(label))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(acceptConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ email: 'owner@example.com' }),
        acknowledgements: {
          voluntary: true,
          unpaid: true,
          invitationOnly: true,
          grantsNothing: true,
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
})
