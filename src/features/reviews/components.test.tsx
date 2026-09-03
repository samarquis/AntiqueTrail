import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DISABLED_REVIEW_CAPABILITY,
  calculateReviewAggregate,
  canDecideAppeal,
  canDecideModeration,
  canSubmitAppeal,
  conflictLabel,
  isReviewCapabilityEnabled,
  moderationButtonLabel,
  restrictionForUpheldCount,
  reviewEligibilityReason,
  unavailableReviewClient,
  validateReviewDraft,
} from './reviewClient'
import { ModerationQueuePage, PublicReviewsPage } from './components'
import type {
  ModerationAction,
  ModerationCase,
  PublicReview,
  ReviewClient,
  ReviewEligibility,
  StoreReviewsSnapshot,
} from './types'

const eligibility: ReviewEligibility = {
  verifiedEmail: true,
  ageAttested: true,
  completedVisit: true,
  manualVisitAttested: false,
  activeReviewExists: false,
  ownStoreConflict: false,
  accountDeletionScheduled: false,
  rateLimited: false,
}

function review(overrides: Partial<PublicReview> = {}): PublicReview {
  return {
    id: 'review-1',
    storeId: 'store-1',
    rating: 5,
    text: 'Lovely selection.',
    displayName: 'Curious Shopper',
    visitMonth: 8,
    visitYear: 2026,
    conflict: 'none',
    state: 'published',
    edited: false,
    ...overrides,
  }
}

function client(overrides: Partial<ReviewClient> = {}): ReviewClient {
  const snapshot: StoreReviewsSnapshot = {
    aggregate: { average: 5, count: 1 },
    reviews: [review()],
    ownReview: null,
  }
  return {
    getCapability: vi.fn(async () => ({
      stage: 'regional_public_mvp' as const,
      enabled: true,
      source: 'server' as const,
    })),
    getEligibility: vi.fn(async () => eligibility),
    getStoreReviews: vi.fn(async () => snapshot),
    publishReview: vi.fn(async (draft) =>
      review({
        rating: draft.rating ?? 1,
        text: draft.text,
        displayName: draft.displayName,
        visitMonth: draft.visitMonth ?? 1,
        visitYear: draft.visitYear ?? 2026,
      }),
    ),
    editReview: vi.fn(async (_id, draft) => review({ rating: draft.rating ?? 1 })),
    requestDeleteReview: vi.fn(async (reviewId) => ({
      reviewId,
      state: 'pending_undo' as const,
      undoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      purgeDueAt: new Date().toISOString(),
    })),
    undoDeleteReview: vi.fn(async (id) => review({ id, state: 'restored' })),
    reportReview: vi.fn(async () => ({ accepted: true as const })),
    submitAppeal: vi.fn(async () => ({
      id: 'appeal-1',
      reviewId: 'review-1',
      submittedBy: 'author' as const,
      state: 'submitted' as const,
      originalDecision: 'remove' as const,
      reason: 'Context',
      deadlineAt: '2026-09-01',
      decidedByDifferentReviewer: false,
    })),
    listModerationCases: vi.fn(async () => []),
    decideModerationCase: vi.fn(async (id) => ({
      id,
      version: 2,
      reviewId: 'review-1',
      storeId: 'store-1',
      state: 'removed' as const,
      reasonCode: 'spam' as const,
      evidence: [],
      openedAt: '2026-08-01',
      updatedAt: '2026-08-01',
    })),
    submitRestrictionAppeal: vi.fn(async () => ({
      id: 'restriction-appeal',
      feature: 'public_reviews' as const,
      state: 'submitted' as const,
      deadlineAt: '2026-09-01',
      decidedByDifferentReviewer: false,
    })),
    decideRestrictionAppeal: vi.fn(async () => ({
      id: 'restriction-appeal',
      feature: 'public_reviews' as const,
      state: 'restored' as const,
      deadlineAt: '2026-09-01',
      decidedByDifferentReviewer: true,
    })),
    expireFeatureRestriction: vi.fn(async () => ({
      feature: 'public_reviews' as const,
      level: 'thirty_days' as const,
      startsAt: '2026-08-01',
      active: false,
      notice: 'Expired',
    })),
    ...overrides,
  }
}

describe('provider-neutral public review boundary', () => {
  afterEach(() => cleanup())

  it('keeps review capability server-owned and disabled before regional promotion', async () => {
    expect(isReviewCapabilityEnabled(DISABLED_REVIEW_CAPABILITY)).toBe(false)
    expect(reviewEligibilityReason(DISABLED_REVIEW_CAPABILITY, eligibility)).toBe('stage_disabled')
    await expect(unavailableReviewClient.getCapability()).resolves.toEqual(
      DISABLED_REVIEW_CAPABILITY,
    )
  })

  it('validates eligibility, conflict disclosure, and review-safe arithmetic', () => {
    expect(
      validateReviewDraft({
        storeId: 'store-1',
        rating: null,
        text: '',
        displayName: '',
        visitMonth: null,
        visitYear: null,
        conflict: 'none',
        manualVisitAttested: false,
      }).length,
    ).toBeGreaterThan(0)
    expect(conflictLabel('ownership')).toMatch(/not included in average/i)
    expect(
      calculateReviewAggregate([
        review(),
        review({ id: 'review-2', rating: 1 }),
        review({ id: 'review-3', rating: 5, conflict: 'ownership' }),
        review({ id: 'review-4', state: 'removed' }),
      ]),
    ).toEqual({ average: 3, count: 2 })
  })

  it('enforces case-scoped MFA/recent-auth and thresholded restrictions', () => {
    expect(
      canDecideModeration({ mfaVerified: false, recentAuthAt: new Date().toISOString() }),
    ).toBe(false)
    expect(
      canDecideModeration({
        mfaVerified: true,
        recentAuthAt: new Date(Date.now() - 11 * 60_000).toISOString(),
      }),
    ).toBe(false)
    expect(restrictionForUpheldCount(1, 1, false).level).toBe('notice_only')
    expect(restrictionForUpheldCount(2, 2, false).level).toBe('thirty_days')
    expect(restrictionForUpheldCount(3, 3, false).level).toBe('ninety_days')
    expect(restrictionForUpheldCount(4, 4, true).level).toBe('one_eighty_days')
  })

  it('requires one appeal, a deadline, and a different reviewer decision', () => {
    expect(canSubmitAppeal('2026-12-01', false, new Date('2026-08-01'))).toBe(true)
    expect(canSubmitAppeal('2026-07-01', false, new Date('2026-08-01'))).toBe(false)
    expect(canSubmitAppeal('2026-12-01', true, new Date('2026-08-01'))).toBe(false)
    expect(canDecideAppeal(false, 'reason')).toBe(false)
    expect(canDecideAppeal(true, 'reason')).toBe(true)
  })

  it('does not render a composer while capability is disabled', async () => {
    render(
      <MemoryRouter>
        <PublicReviewsPage storeId="store-1" client={unavailableReviewClient} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/not available in this release/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview review/i })).not.toBeInTheDocument()
  })

  it('keeps published reviews readable when anonymous eligibility is unavailable', async () => {
    const reviewClient = client({
      getEligibility: vi.fn(async () => Promise.reject(new Error('authentication required'))),
    })
    render(
      <MemoryRouter>
        <PublicReviewsPage storeId="store-1" client={reviewClient} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Lovely selection.')).toBeVisible()
    expect(screen.getByRole('link', { name: /sign in to write a review/i })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('preserves composer fields through preview and publishes only after explicit confirmation', async () => {
    const user = userEvent.setup()
    const reviewClient = client()
    render(
      <MemoryRouter>
        <PublicReviewsPage storeId="store-1" client={reviewClient} />
      </MemoryRouter>,
    )
    await screen.findByRole('button', { name: /1 star/i })
    await user.click(screen.getByRole('button', { name: /5 stars/i }))
    await user.type(screen.getByLabelText(/review text/i), 'Great finds')
    await user.type(screen.getByLabelText(/public display name/i), 'Oak Fan')
    await user.type(screen.getByLabelText(/visit month/i), '8')
    await user.type(screen.getByLabelText(/visit year/i), '2026')
    await user.click(screen.getByRole('button', { name: /preview review/i }))
    expect(screen.getByText(/great finds/i)).toBeInTheDocument()
    expect(reviewClient.publishReview).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /publish review/i }))
    expect(reviewClient.publishReview).toHaveBeenCalledOnce()
  })

  it('keeps moderation actions scoped and avoids reporter identity in the UI', async () => {
    const reviewClient = client({
      listModerationCases: vi.fn(async () => [
        {
          id: 'case-1',
          version: 1,
          reviewId: 'review-1',
          storeId: 'store-1',
          state: 'open' as const,
          reasonCode: 'spam' as const,
          evidence: [{ kind: 'report_reason' as const, value: 'Spam' }],
          openedAt: '2026-08-01',
          updatedAt: '2026-08-01',
          reporterPseudonym: 'reporter-secret',
        },
      ]),
    })
    render(
      <MemoryRouter>
        <ModerationQueuePage client={reviewClient} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /case case-1/i })).toBeInTheDocument()
    expect(screen.queryByText(/reporter-secret/i)).not.toBeInTheDocument()
  })
})

describe('ModerationQueuePage single-CTA decision flow', () => {
  afterEach(() => cleanup())

  const caseClient = (overrides: Partial<ReviewClient> = {}): ReviewClient =>
    client({
      listModerationCases: vi.fn(async () => [
        {
          id: 'case-1',
          version: 1,
          reviewId: 'review-1',
          storeId: 'store-1',
          state: 'open' as const,
          reasonCode: 'spam' as const,
          evidence: [{ kind: 'report_reason' as const, value: 'Spam' }],
          openedAt: '2026-08-01',
          updatedAt: '2026-08-01',
        },
      ]),
      ...overrides,
    })

  it('keeps all four dispositions neutral and consequence-labeled until a reason is present', async () => {
    render(
      <MemoryRouter>
        <ModerationQueuePage client={caseClient()} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /case case-1/i })).toBeInTheDocument()
    const actions = ['hold', 'remove', 'restore', 'dismiss_report'] satisfies ModerationAction[]
    for (const action of actions) {
      const name = moderationButtonLabel(action)
      const button = screen.getByRole('button', {
        name: new RegExp(`^${name} `),
      })
      expect(button).toBeDisabled()
      expect(button.className).toContain('button--secondary')
      expect(button.className).toContain('moderation-choice')
      expect(button).toHaveAccessibleName(new RegExp(name))
    }
    expect(screen.queryByRole('button', { name: /^Confirm / })).not.toBeInTheDocument()
    await userEvent.setup().type(screen.getByLabelText('Decision reason'), 'confirmed spam')
    expect(screen.getByRole('button', { name: /^Remove / })).toBeEnabled()
  })

  it('shows a case-scoped preview and a single filled Confirm CTA once a neutral choice is made', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ModerationQueuePage client={caseClient()} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /case case-1/i })
    await user.type(screen.getByLabelText('Decision reason'), 'confirmed spam')
    await user.click(screen.getByRole('button', { name: /^Remove / }))
    const confirm = screen.getByLabelText('Confirm moderation decision')
    expect(confirm).toContainHTML('public moderation state')
    expect(confirm).toContainHTML('Case transition')
    expect(confirm).toContainHTML('Public aggregate effect')
    expect(confirm).toContainHTML('Author notice')
    expect(confirm).toContainHTML('Reason and audit')
    expect(confirm).toContainHTML('Reversibility')
    const filled = screen.getAllByRole('button', { name: /^Confirm / })
    expect(filled).toHaveLength(1)
    expect(filled[0].className).toContain('button')
    expect(filled[0].className).toContain('button--danger')
    expect(filled[0]).toHaveAccessibleName('Confirm Remove')
    expect(screen.getByRole('button', { name: /Change decision/ })).toBeEnabled()
  })

  it('helps the moderator reconsider a neutral disposition without losing the typed reason', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ModerationQueuePage client={caseClient()} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /case case-1/i })
    const reasonInput = screen.getByLabelText('Decision reason')
    await user.type(reasonInput, 'confirmed spam')
    await user.click(screen.getByRole('button', { name: /^Hold / }))
    expect(screen.getByRole('button', { name: 'Confirm Hold' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Change decision/ }))
    expect(screen.queryByRole('button', { name: /^Confirm / })).not.toBeInTheDocument()
    expect(reasonInput).toHaveValue('confirmed spam')
    expect(reasonInput).toHaveFocus()
  })

  it('confirms the chosen non-destructive action through the single filled CTA', async () => {
    const user = userEvent.setup()
    const reviewClient = caseClient({
      decideModerationCase: vi.fn(async (id) => ({
        id,
        version: 2,
        reviewId: 'review-1',
        storeId: 'store-1',
        state: 'held' as const,
        reasonCode: 'spam' as const,
        evidence: [],
        openedAt: '2026-08-01',
        updatedAt: '2026-08-01',
      })),
    })
    render(
      <MemoryRouter>
        <ModerationQueuePage client={reviewClient} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /case case-1/i })
    await user.type(screen.getByLabelText('Decision reason'), 'approved on review')
    await user.click(screen.getByRole('button', { name: /^Hold / }))
    await user.click(screen.getByRole('button', { name: 'Confirm Hold' }))
    expect(await screen.findByLabelText('Resolved moderation outcome')).toHaveTextContent(
      'now held',
    )
    expect(reviewClient.decideModerationCase).toHaveBeenCalledWith('case-1', {
      action: 'hold',
      reason: 'approved on review',
      expectedVersion: 1,
      idempotencyKey: expect.any(String),
      mfaVerified: true,
      recentAuthAt: expect.any(String),
    })
  })

  it('announces the exact Dismiss Report outcome without claiming an aggregate or author notice', async () => {
    const user = userEvent.setup()
    const reviewClient = caseClient({
      decideModerationCase: vi.fn(async (id) => ({
        id,
        version: 2,
        reviewId: 'review-1',
        storeId: 'store-1',
        state: 'dismissed' as const,
        reasonCode: 'spam' as const,
        evidence: [],
        openedAt: '2026-08-01',
        updatedAt: '2026-08-01',
      })),
    })
    render(
      <MemoryRouter>
        <ModerationQueuePage client={reviewClient} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /case case-1/i })
    await user.type(screen.getByLabelText('Decision reason'), 'report not supported')
    await user.click(screen.getByRole('button', { name: /^Dismiss Report / }))
    const confirm = screen.getByRole('button', { name: 'Confirm Dismiss Report' })
    expect(confirm.className).toContain('moderation-confirm__action--dismiss_report')
    await user.click(confirm)
    const outcome = await screen.findByLabelText('Resolved moderation outcome')
    expect(outcome).toHaveTextContent('No author notice is sent.')
    expect(outcome).toHaveTextContent('No change to the review or the store average.')
    expect(outcome).not.toHaveTextContent('Author notice is queued')
  })

  it('keeps the panel and reason and focuses a summary when the decision fails, with no auto-advance', async () => {
    const user = userEvent.setup()
    const reviewClient = caseClient({
      decideModerationCase: vi.fn(async () => Promise.reject(new Error('server unavailable'))),
    })
    render(
      <MemoryRouter>
        <ModerationQueuePage client={reviewClient} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /case case-1/i })
    const reasonInput = screen.getByLabelText('Decision reason')
    await user.type(reasonInput, 'confirmed spam')
    await user.click(screen.getByRole('button', { name: /^Remove / }))
    await user.click(screen.getByRole('button', { name: 'Confirm Remove' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your reason is kept')
    expect(alert).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Confirm Remove' })).toBeVisible()
    expect(reasonInput).toHaveValue('confirmed spam')
    expect(screen.queryByLabelText('Resolved moderation outcome')).not.toBeInTheDocument()
  })

  it('submits a privileged moderation decision only once while it is pending', async () => {
    const user = userEvent.setup()
    let finish!: (value: ModerationCase) => void
    const pending = new Promise<ModerationCase>((resolve) => {
      finish = resolve
    })
    const decideModerationCase = vi.fn(async () => pending)
    render(
      <MemoryRouter>
        <ModerationQueuePage client={caseClient({ decideModerationCase })} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /case case-1/i })
    await user.type(screen.getByLabelText('Decision reason'), 'confirmed spam')
    await user.click(screen.getByRole('button', { name: /^Remove / }))
    const confirm = screen.getByRole('button', { name: 'Confirm Remove' })
    await user.dblClick(confirm)
    expect(decideModerationCase).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Confirming Remove…' })).toBeDisabled()
    finish({
      id: 'case-1',
      version: 2,
      reviewId: 'review-1',
      storeId: 'store-1',
      state: 'removed',
      reasonCode: 'spam',
      evidence: [],
      openedAt: '2026-08-01',
      updatedAt: '2026-08-01',
    })
    await pending
    expect(await screen.findByLabelText('Resolved moderation outcome')).toBeVisible()
  })

  it('updates only the matched case and keeps Back to Queue / Review Next with no auto-advance', async () => {
    const user = userEvent.setup()
    const reviewClient = client({
      listModerationCases: vi.fn(async () => [
        {
          id: 'case-1',
          version: 1,
          reviewId: 'review-1',
          storeId: 'store-1',
          state: 'open' as const,
          reasonCode: 'spam' as const,
          evidence: [],
          openedAt: '2026-08-01',
          updatedAt: '2026-08-01',
        },
        {
          id: 'case-2',
          version: 1,
          reviewId: 'review-2',
          storeId: 'store-2',
          state: 'open' as const,
          reasonCode: 'irrelevant' as const,
          evidence: [],
          openedAt: '2026-08-01',
          updatedAt: '2026-08-01',
        },
      ]),
    })
    render(
      <MemoryRouter>
        <ModerationQueuePage client={reviewClient} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /case case-1/i })
    const case1 = screen.getByText('Case case-1').closest('article')!
    const reasonInput = within(case1).getByLabelText('Decision reason')
    await user.type(reasonInput, 'confirmed spam')
    await user.click(within(case1).getByRole('button', { name: /^Remove / }))
    await user.click(within(case1).getByRole('button', { name: 'Confirm Remove' }))
    const outcome = await screen.findByLabelText('Resolved moderation outcome')
    expect(outcome).toHaveTextContent('Review case-1 is now removed')
    expect(screen.getByText(/State: removed/)).toBeInTheDocument()
    expect(screen.getByText(/State: open/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to Queue' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Review Next' })).toBeVisible()
    expect(reviewClient.decideModerationCase).toHaveBeenCalledTimes(1)
  })
})
