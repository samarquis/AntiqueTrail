import { describe, expect, it, vi } from 'vitest'
import {
  GENERIC_REVIEW_ERROR,
  ReviewApiError,
  createReviewClient,
  moderationButtonLabel,
  moderationChoiceConsequence,
  moderationPreview,
  moderationResultState,
} from './reviewClient'

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
      expectedVersion: 3,
      idempotencyKey: 'moderate-case-1-v3',
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
        {
          p_case_id: 'case-1',
          p_action: 'remove',
          p_reason: 'Confirmed policy violation',
          p_expected_version: 3,
          p_idempotency_key: 'moderate-case-1-v3',
        },
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

describe('moderation consequence preview', () => {
  it('labels every disposition and maps each to a state that is not the filled-primary default', () => {
    expect(moderationButtonLabel('dismiss_report')).toBe('Dismiss Report')
    expect(moderationButtonLabel('remove')).toBe('Remove')
    expect(moderationButtonLabel('hold')).toBe('Hold')
    expect(moderationResultState('hold')).toBe('held')
    expect(moderationResultState('remove')).toBe('removed')
    expect(moderationResultState('restore')).toBe('restored')
    expect(moderationResultState('dismiss_report')).toBe('dismissed')
  })

  it('gives every disposition an icon-plus-text consequence cue distinct from the others', () => {
    const consequences = (['hold', 'remove', 'restore', 'dismiss_report'] as const).map((action) =>
      moderationChoiceConsequence(action),
    )
    expect(new Set(consequences).size).toBe(4)
    expect(consequences[0]).toMatch(/Hides the review/)
    expect(consequences[1]).toMatch(/Removes the review/)
    expect(consequences[2]).toMatch(/Republishes the review/)
    expect(consequences[3]).toMatch(/Closes this report/)
  })

  it('reports the current-to-resulting transition for a remove decision', () => {
    const preview = moderationPreview('remove', 'open')
    expect(preview.transition).toBe('open → removed')
    expect(preview.aggregateEffect).toContain('dropped from the store average')
    expect(preview.authorNotice).toBe('Author notice is queued.')
    expect(preview.reasonAndAudit).toContain('appended to the append-only audit')
    expect(preview.reversibility).toContain('30-day window')
  })

  it('keeps dismiss non-destructive and restore recomputation-scoped', () => {
    const dismiss = moderationPreview('dismiss_report', 'open')
    expect(dismiss.aggregateEffect).toContain('No change')
    expect(dismiss.authorNotice).toContain('No author notice')
    const restore = moderationPreview('restore', 'removed')
    expect(restore.transition).toBe('removed → restored')
    expect(restore.aggregateEffect).toContain('recomputed only if it still passes eligibility')
    expect(restore.authorNotice).toContain('republish notice')
  })
})
