import { describe, expect, it, vi } from 'vitest'
import { GENERIC_REVIEW_ERROR, ReviewApiError, createReviewClient } from './reviewClient'

describe('durable review RPC client', () => {
  it('maps the public review lifecycle to exact bounded RPCs', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === 'reviews_get_capability'
          ? { stage: 'regional_public_mvp', enabled: true, source: 'server' }
          : { id: 'review-1' },
      error: null,
    }))
    const client = createReviewClient({ rpc })

    await client.getCapability()
    await client.publishReview({
      storeId: 'store-1',
      rating: 5,
      text: 'Worth the stop.',
      displayName: 'Trail Shopper',
      visitMonth: 8,
      visitYear: 2026,
      conflict: 'none',
      manualVisitAttested: true,
    })
    await client.requestDeleteReview('review-1')
    await client.undoDeleteReview('review-1')
    await client.reportReview('review-1', 'spam')

    expect(rpc.mock.calls).toEqual([
      ['reviews_get_capability', {}],
      [
        'reviews_create',
        {
          p_store_id: 'store-1',
          p_rating: 5,
          p_text: 'Worth the stop.',
          p_display_name: 'Trail Shopper',
          p_visit_month: 8,
          p_visit_year: 2026,
          p_conflict_kind: 'none',
          p_manual_visit_attested: true,
        },
      ],
      ['reviews_request_delete', { p_review_id: 'review-1' }],
      ['reviews_undo_delete', { p_review_id: 'review-1' }],
      ['reviews_report', { p_review_id: 'review-1', p_reason_code: 'spam' }],
    ])
  })

  it('maps moderation and appeal operations without trusting client authorization booleans', async () => {
    const rpc = vi.fn(async () => ({ data: { id: 'result-1' }, error: null }))
    const client = createReviewClient({ rpc })

    await client.decideModerationCase('case-1', {
      action: 'remove',
      reason: 'Confirmed policy violation',
      mfaVerified: true,
      recentAuthAt: new Date().toISOString(),
    })
    await client.decideRestrictionAppeal('appeal-1', {
      outcome: 'uphold',
      reason: 'Independent review complete',
      differentReviewer: true,
    })

    expect(rpc.mock.calls).toEqual([
      [
        'reviews_moderate',
        { p_case_id: 'case-1', p_action: 'remove', p_reason: 'Confirmed policy violation' },
      ],
      [
        'reviews_decide_restriction_appeal',
        {
          p_appeal_id: 'appeal-1',
          p_outcome: 'uphold',
          p_reason: 'Independent review complete',
        },
      ],
    ])
  })

  it('returns one reason-neutral failure for malformed or failed RPC responses', async () => {
    const client = createReviewClient({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'sensitive database detail' } })),
    })

    await expect(client.getEligibility('store-1')).rejects.toEqual(new ReviewApiError())
    await expect(client.getStoreReviews('store-1')).rejects.toThrow(GENERIC_REVIEW_ERROR)
  })
})
