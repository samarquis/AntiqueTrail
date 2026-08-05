import { cleanup, render, screen } from '@testing-library/react'
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
  restrictionForUpheldCount,
  reviewEligibilityReason,
  unavailableReviewClient,
  validateReviewDraft,
} from './reviewClient'
import { ModerationQueuePage, PublicReviewsPage } from './components'
import type { PublicReview, ReviewClient, ReviewEligibility, StoreReviewsSnapshot } from './types'

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
