import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminClient } from './adminClient'
import { AccessSafetyPage, ReviewQueuePage } from './components'
import type { AdminReviewCaseDetail, AdminReviewCaseSummary } from './types'

afterEach(cleanup)

function client(overrides: Partial<AdminClient> = {}): AdminClient {
  return {
    listCases: async () => [
      {
        id: 'case-1',
        caseType: 'store_change',
        queueCategory: 'store_changes',
        assignedCount: 1,
        targetKind: 'store_controlled_change',
        storeLabel: 'Prairie Clockworks',
        state: 'claimed',
        version: 3,
        createdAt: '2026-08-05T12:00:00Z',
      },
    ],
    getCase: async () => ({
      id: 'case-1',
      caseType: 'store_change',
      queueCategory: 'store_changes',
      assignedCount: 1,
      targetKind: 'store_controlled_change',
      storeLabel: 'Prairie Clockworks',
      state: 'claimed',
      version: 3,
      createdAt: '2026-08-05T12:00:00Z',
      immutableSubmission: true,
      context: { field: 'name', requestedValue: 'Prairie Clockworks Antiques' },
      allowedActions: ['approve', 'return', 'reject'],
      audit: [],
    }),
    decideCase: async () => ({ id: 'case-1', state: 'approved', version: 4 }),
    listStoreGrants: async () => [
      {
        grantId: 'grant-1',
        subjectUserId: 'rep-1',
        subjectLabel: 'Store representative',
        storeId: 'store-1',
        storeLabel: 'Prairie Clockworks',
        state: 'active',
        version: 1,
        verifiedEmail: true,
        mfaVerified: true,
        grantedAt: '2026-07-01T12:00:00Z',
        revokedAt: null,
        recentActivity: [],
      },
    ],
    previewStoreScopeChange: async () => ({
      previewId: 'preview-1',
      subjectUserId: 'rep-1',
      storeId: 'store-1',
      grantId: 'grant-1',
      grantVersion: 2,
      previewHash: 'abc',
      expiresAt: '2026-08-05T12:10:00Z',
    }),
    changeStoreScope: async () => ({ grantId: 'grant-1', state: 'revoked', version: 2 }),
    previewDuplicateMerge: async () => {
      throw new Error('not used')
    },
    executeDuplicateMerge: async () => {
      throw new Error('not used')
    },
    rollbackDuplicateMerge: async () => {
      throw new Error('not used')
    },
    ...overrides,
  }
}

describe('Administrator workspace', () => {
  it('composes one and multiple authoritative assigned categories into bounded review cards', async () => {
    const onboardingCase: AdminReviewCaseSummary = {
      id: 'case-onboarding-1',
      caseType: 'partner_onboarding',
      queueCategory: 'onboarding',
      assignedCount: 1,
      targetKind: 'pilot_store_draft',
      storeLabel: 'Juniper House Antiques',
      state: 'assigned',
      version: 2,
      createdAt: '2026-08-05T12:00:00Z',
    }
    render(
      <MemoryRouter>
        <ReviewQueuePage
          client={client({
            listCases: async () => [onboardingCase, ...(await client().listCases())],
          })}
        />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText('2 assigned review cases in New stores, Store changes.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Assigned review cases')).toHaveClass('review-queue__cases')
    expect(screen.getByRole('button', { name: 'New stores (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Store changes (1)' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Review Juniper House Antiques' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Prairie Clockworks' })).toBeInTheDocument()
  })

  it('keeps loading, empty, and retry states in the same queue workspace', async () => {
    const pendingCases = new Promise<AdminReviewCaseSummary[]>(() => undefined)
    const { unmount } = render(
      <MemoryRouter>
        <ReviewQueuePage client={client({ listCases: async () => pendingCases })} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Loading review cases…')
    expect(screen.getByText('Your assigned review workspace is loading.')).toBeInTheDocument()
    unmount()

    const listCases = vi
      .fn<AdminClient['listCases']>()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce([])
    render(
      <MemoryRouter>
        <ReviewQueuePage client={client({ listCases })} />
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Retry review queue' }))
    expect(await screen.findByText('No assigned review cases right now.')).toBeInTheDocument()
    expect(
      screen.getByText('There is nothing to decide until another assigned case arrives.'),
    ).toBeInTheDocument()
  })

  it('updates the authoritative category count after one case resolves', async () => {
    const firstCase = { ...(await client().listCases())[0], assignedCount: 2 }
    const secondCase: AdminReviewCaseSummary = {
      ...firstCase,
      id: 'case-2',
      storeLabel: 'Cedar & Brass',
    }
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ReviewQueuePage
          client={client({
            listCases: async () => [firstCase, secondCase],
            decideCase: async () => ({ id: firstCase.id, state: 'approved', version: 4 }),
          })}
        />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Review Prairie Clockworks' }))
    await user.type(screen.getByLabelText('Decision reason'), 'Verified')
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await user.click(screen.getByRole('button', { name: 'Confirm approve' }))
    await user.click(screen.getByRole('button', { name: 'Back to Queue' }))
    expect(screen.getByText('1 assigned review case in Store changes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Store changes (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review Cedar & Brass' })).toBeInTheDocument()
  })

  it('shows exact immutable case context and decides one case without a bulk action', async () => {
    const decideCase = vi.fn(async () => ({ id: 'case-1', state: 'approved' as const, version: 4 }))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ReviewQueuePage client={client({ decideCase })} />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /review prairie clockworks/i }))
    expect(await screen.findByText('Prairie Clockworks Antiques')).toBeInTheDocument()
    expect(screen.getByText(/submitted fields are read-only/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve all/i })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/decision reason/i), 'Owner authority verified')
    await user.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(decideCase).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /confirm approve/i }))
    expect(decideCase).toHaveBeenCalledWith(
      'case-1',
      'approve',
      'Owner authority verified',
      3,
      expect.stringMatching(/^admin-case-1-3-/),
    )
    expect(screen.getByRole('heading', { name: /review queue/i })).toHaveFocus()
  })

  it('routes an assigned Pilot Store Draft through the New stores category and names its exact approval outcome', async () => {
    const onboardingCase: AdminReviewCaseDetail = {
      id: 'case-onboarding-1',
      caseType: 'partner_onboarding',
      queueCategory: 'onboarding',
      assignedCount: 1,
      targetKind: 'pilot_store_draft',
      storeLabel: 'Juniper House Antiques',
      state: 'assigned',
      version: 2,
      createdAt: '2026-08-05T12:00:00Z',
      immutableSubmission: true,
      context: {
        name: 'Juniper House Antiques',
        address: '410 West Synthetic Avenue, Topeka, KS',
        consentStatus: 'current',
        authorityStatus: 'verified',
        identityStatus: 'verified',
      },
      allowedActions: ['approve', 'return', 'reject'],
      audit: [],
    }
    const decideCase = vi.fn(async () => ({
      id: onboardingCase.id,
      state: 'approved' as const,
      version: 3,
      onboardingOutcome: {
        pilotStoreRecordCreated: true as const,
        storeLabel: onboardingCase.storeLabel,
        representativeScope: 'Juniper House Antiques only',
        unrelatedAuthorityChanged: false as const,
      },
    }))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ReviewQueuePage
          client={client({
            listCases: async () => [onboardingCase],
            getCase: async () => onboardingCase,
            decideCase,
          })}
        />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'New stores (1)' }))
    await user.click(screen.getByRole('button', { name: /review juniper house antiques/i }))
    expect(screen.getByLabelText('Pilot Store Draft decision summary')).toHaveTextContent(
      'Consent: current. Authority: verified. Identity: verified.',
    )
    expect(screen.queryByText(/exactPreviewHash/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/decision reason/i), 'Consent and authority verified')
    await user.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(screen.getByLabelText('Confirm case decision')).toHaveTextContent(
      'grant Store Representative scope only for that store',
    )
    await user.click(screen.getByRole('button', { name: /^confirm approve$/i }))
    expect(decideCase).toHaveBeenCalledWith(
      'case-onboarding-1',
      'approve',
      'Consent and authority verified',
      2,
      expect.stringMatching(/^admin-case-onboarding-1-2-/),
    )
    expect(screen.getByLabelText('Resolved case outcome')).toHaveTextContent(
      'Pilot Store Record created for Juniper House Antiques',
    )
  })

  it.each([
    ['return', 'changes_requested', 'Return for changes', 'Confirm return for changes'],
    ['reject', 'rejected', 'Reject', 'Confirm reject'],
  ] as const)(
    'keeps a %s onboarding decision non-public and without a role grant',
    async (action, state, actionLabel, confirmLabel) => {
      const onboardingCase: AdminReviewCaseDetail = {
        id: `case-onboarding-${action}`,
        caseType: 'partner_onboarding',
        queueCategory: 'onboarding',
        assignedCount: 1,
        targetKind: 'pilot_store_draft',
        storeLabel: 'Juniper House Antiques',
        state: 'assigned',
        version: 2,
        createdAt: '2026-08-05T12:00:00Z',
        immutableSubmission: true,
        context: {
          name: 'Juniper House Antiques',
          consentStatus: 'current',
          authorityStatus: 'verified',
          identityStatus: 'verified',
        },
        allowedActions: ['approve', 'return', 'reject'],
        audit: [],
      }
      const decideCase = vi.fn(async () => ({ id: onboardingCase.id, state, version: 3 }))
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <ReviewQueuePage
            client={client({
              listCases: async () => [onboardingCase],
              getCase: async () => onboardingCase,
              decideCase,
            })}
          />
        </MemoryRouter>,
      )

      await user.click(await screen.findByRole('button', { name: 'New stores (1)' }))
      await user.click(screen.getByRole('button', { name: /review juniper house antiques/i }))
      await user.type(screen.getByLabelText(/decision reason/i), 'Needs correction')
      await user.click(screen.getByRole('button', { name: actionLabel }))
      expect(screen.getByLabelText('Confirm case decision')).toHaveTextContent(
        'will not publish or grant a role',
      )
      await user.click(screen.getByRole('button', { name: confirmLabel }))
      expect(decideCase).toHaveBeenCalledWith(
        onboardingCase.id,
        action,
        'Needs correction',
        2,
        expect.stringMatching(/^admin-case-onboarding-/),
      )
      expect(screen.queryByText(/Pilot Store Record created/i)).not.toBeInTheDocument()
    },
  )

  it('shows and revokes one exact representative store scope', async () => {
    const previewStoreScopeChange = vi.fn(client().previewStoreScopeChange)
    const changeStoreScope = vi.fn(async () => ({
      grantId: 'grant-1',
      state: 'revoked' as const,
      version: 2,
    }))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccessSafetyPage client={client({ previewStoreScopeChange, changeStoreScope })} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Prairie Clockworks')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /preview revoke prairie clockworks scope/i }),
    )
    expect(previewStoreScopeChange).toHaveBeenCalledWith('revoke', 'rep-1', 'store-1', 1)
    await user.type(screen.getByLabelText(/administrative reason/i), 'authority withdrawn')
    await user.click(
      screen.getByRole('button', { name: /confirm revoke prairie clockworks scope/i }),
    )
    expect(changeStoreScope).toHaveBeenCalledWith(
      'revoke',
      'rep-1',
      'store-1',
      1,
      'authority withdrawn',
      expect.stringMatching(/^admin-scope-grant-1-1-/),
      'preview-1',
    )
  })

  it('does not offer a Package 7 bypass for an initial representative grant', async () => {
    render(
      <MemoryRouter>
        <AccessSafetyPage client={client()} />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/initial store representative access is created only/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /grant exact store scope/i }),
    ).not.toBeInTheDocument()
  })

  it('requires a server-issued exact preview before regrant', async () => {
    const previewStoreScopeChange = vi.fn(client().previewStoreScopeChange)
    const changeStoreScope = vi.fn(client().changeStoreScope)
    const revoked = {
      ...(await client().listStoreGrants())[0],
      state: 'revoked' as const,
      version: 2,
    }
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccessSafetyPage
          client={client({
            listStoreGrants: async () => [revoked],
            previewStoreScopeChange,
            changeStoreScope,
          })}
        />
      </MemoryRouter>,
    )
    await user.click(
      await screen.findByRole('button', { name: /preview regrant prairie clockworks scope/i }),
    )
    expect(previewStoreScopeChange).toHaveBeenCalledWith('regrant', 'rep-1', 'store-1', 2)
    expect(changeStoreScope).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText(/administrative reason/i), 'authority reverified')
    await user.click(
      screen.getByRole('button', { name: /confirm regrant prairie clockworks scope/i }),
    )
    expect(changeStoreScope).toHaveBeenCalledWith(
      'regrant',
      'rep-1',
      'store-1',
      2,
      'authority reverified',
      expect.any(String),
      'preview-1',
    )
  })

  it('previews one duplicate merge before execution and never offers authority reparenting', async () => {
    const previewDuplicateMerge = vi.fn(async () => ({
      proposalId: 'proposal-1',
      canonicalStoreId: 'store-1',
      duplicateStoreId: 'store-2',
      canonicalLabel: 'Prairie Clockworks',
      duplicateLabel: 'Prairie Clock Works',
      safeReferences: 4,
      quarantinedConflicts: 2,
      authorityReparented: false as const,
      references: [
        { ordinal: 1, kind: 'store_update', collisionKind: 'none', plannedResolution: 'reparent' },
      ],
      state: 'previewed' as const,
      version: 1,
    }))
    const executeDuplicateMerge = vi.fn(async () => ({
      ...(await previewDuplicateMerge()),
      state: 'executed' as const,
      version: 2,
    }))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccessSafetyPage client={client({ previewDuplicateMerge, executeDuplicateMerge })} />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/canonical store id/i), 'store-1')
    await user.type(screen.getByLabelText(/duplicate store id/i), 'store-2')
    await user.click(screen.getByRole('button', { name: /preview duplicate merge/i }))
    expect(await screen.findByText(/representative authority will not move/i)).toBeInTheDocument()
    expect(screen.getByText(/2 conflicts will remain quarantined/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /execute this merge/i }))
    expect(executeDuplicateMerge).toHaveBeenCalledWith(
      'proposal-1',
      1,
      expect.stringMatching(/^admin-merge-proposal-1-1-/),
    )
  })
})
