import type {
  FeatureRestriction,
  PublicReview,
  ReviewCapability,
  ReviewClient,
  ReviewConflict,
  ReviewDraft,
  ReviewEligibility,
  ReviewReportReason,
  ReviewStage,
} from './types'
import type { ReviewClient as DurableReviewClient } from './types'

export const GENERIC_REVIEW_ERROR = "We couldn't complete this review action. Please try again."
export const REVIEW_STAGE_DISABLED_MESSAGE = 'Public reviews are not available in this release.'
export const REVIEW_RULES_MESSAGE =
  'Share an honest visit. Be accurate, respectful, and disclose material conflicts.'

type ReviewRpcName =
  | 'reviews_get_capability'
  | 'reviews_get_eligibility'
  | 'reviews_get_store'
  | 'reviews_create'
  | 'reviews_edit'
  | 'reviews_request_delete'
  | 'reviews_undo_delete'
  | 'reviews_report'
  | 'reviews_submit_appeal'
  | 'reviews_list_moderation_cases'
  | 'reviews_moderate'
  | 'reviews_submit_restriction_appeal'
  | 'reviews_decide_restriction_appeal'
  | 'reviews_expire_restriction'

export interface ReviewRpcTransport {
  rpc(
    name: ReviewRpcName,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown }>
}

export class ReviewApiError extends Error {
  constructor() {
    super(GENERIC_REVIEW_ERROR)
    this.name = 'ReviewApiError'
  }
}

function reviewDraftArgs(draft: ReviewDraft): Readonly<Record<string, unknown>> {
  return {
    p_store_id: draft.storeId,
    p_rating: draft.rating,
    p_text: draft.text,
    p_display_name: draft.displayName,
    p_visit_month: draft.visitMonth,
    p_visit_year: draft.visitYear,
    p_conflict_kind: draft.conflict,
    p_manual_visit_attested: draft.manualVisitAttested,
  }
}

export function createReviewClient(transport: ReviewRpcTransport): DurableReviewClient {
  async function call<T>(
    name: ReviewRpcName,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<T> {
    try {
      const result = await transport.rpc(name, args)
      if (result.error || result.data === null || result.data === undefined)
        throw new ReviewApiError()
      return result.data as T
    } catch (error) {
      if (error instanceof ReviewApiError) throw error
      throw new ReviewApiError()
    }
  }

  return {
    getCapability: () => call('reviews_get_capability'),
    getEligibility: (storeId) => call('reviews_get_eligibility', { p_store_id: storeId }),
    getStoreReviews: (storeId) => call('reviews_get_store', { p_store_id: storeId }),
    publishReview: (draft) => call('reviews_create', reviewDraftArgs(draft)),
    editReview: (reviewId, draft) =>
      call('reviews_edit', { p_review_id: reviewId, ...reviewDraftArgs(draft) }),
    requestDeleteReview: (reviewId) => call('reviews_request_delete', { p_review_id: reviewId }),
    undoDeleteReview: (reviewId) => call('reviews_undo_delete', { p_review_id: reviewId }),
    reportReview: (reviewId, reason: ReviewReportReason) =>
      call('reviews_report', { p_review_id: reviewId, p_reason_code: reason }),
    submitAppeal: ({ reviewId, reason }) =>
      call('reviews_submit_appeal', { p_review_id: reviewId, p_reason: reason }),
    listModerationCases: () => call('reviews_list_moderation_cases'),
    decideModerationCase: (caseId, input) =>
      call('reviews_moderate', {
        p_case_id: caseId,
        p_action: input.action,
        p_reason: input.reason,
      }),
    submitRestrictionAppeal: ({ restrictionId, reason }) =>
      call('reviews_submit_restriction_appeal', {
        p_restriction_id: restrictionId,
        p_reason: reason,
      }),
    decideRestrictionAppeal: (appealId, input) =>
      call('reviews_decide_restriction_appeal', {
        p_appeal_id: appealId,
        p_outcome: input.outcome,
        p_reason: input.reason,
      }),
    expireFeatureRestriction: (restrictionId) =>
      call('reviews_expire_restriction', { p_restriction_id: restrictionId }),
  }
}
export const DISABLED_REVIEW_CAPABILITY: ReviewCapability = {
  stage: 'private_beta',
  enabled: false,
  source: 'server',
}

/** The default boundary never publishes or calls a provider before Package 10B promotion. */
export const unavailableReviewClient: ReviewClient = {
  async getCapability() {
    return DISABLED_REVIEW_CAPABILITY
  },
  async getEligibility() {
    return unavailable()
  },
  async getStoreReviews() {
    return unavailable()
  },
  async publishReview() {
    return unavailable()
  },
  async editReview() {
    return unavailable()
  },
  async requestDeleteReview() {
    return unavailable()
  },
  async undoDeleteReview() {
    return unavailable()
  },
  async reportReview() {
    return unavailable()
  },
  async submitAppeal() {
    return unavailable()
  },
  async listModerationCases() {
    return unavailable()
  },
  async decideModerationCase() {
    return unavailable()
  },
  async submitRestrictionAppeal() {
    return unavailable()
  },
  async decideRestrictionAppeal() {
    return unavailable()
  },
  async expireFeatureRestriction() {
    return unavailable()
  },
}

function unavailable<T>(): Promise<T> {
  return Promise.reject(new Error(GENERIC_REVIEW_ERROR))
}

export function isReviewCapabilityEnabled(capability: ReviewCapability): boolean {
  return (
    capability.source === 'server' &&
    capability.enabled &&
    capability.stage === 'regional_public_mvp'
  )
}

export function stageAllowsReviews(stage: ReviewStage): boolean {
  return stage === 'regional_public_mvp'
}

export type ReviewEligibilityReason =
  | 'stage_disabled'
  | 'verified_email_required'
  | 'age_attestation_required'
  | 'visit_attestation_required'
  | 'active_review_exists'
  | 'store_conflict'
  | 'account_deletion_scheduled'
  | 'rate_limited'

export function reviewEligibilityReason(
  capability: ReviewCapability,
  eligibility: ReviewEligibility,
): ReviewEligibilityReason | null {
  if (!isReviewCapabilityEnabled(capability)) return 'stage_disabled'
  if (!eligibility.verifiedEmail) return 'verified_email_required'
  if (!eligibility.ageAttested) return 'age_attestation_required'
  if (eligibility.activeReviewExists) return 'active_review_exists'
  if (eligibility.ownStoreConflict) return 'store_conflict'
  if (eligibility.accountDeletionScheduled) return 'account_deletion_scheduled'
  if (eligibility.rateLimited) return 'rate_limited'
  if (!eligibility.completedVisit && !eligibility.manualVisitAttested)
    return 'visit_attestation_required'
  return null
}

export function validateReviewDraft(draft: ReviewDraft): string[] {
  const errors: string[] = []
  if (!draft.rating || !Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5)
    errors.push('Choose a rating from 1 to 5.')
  if (!draft.storeId.trim()) errors.push('A store is required.')
  if (!draft.displayName.trim()) errors.push('Choose a public display name.')
  if (draft.displayName.length > 80) errors.push('Display name is too long.')
  if (draft.text.length > 2000) errors.push('Review text is too long.')
  if (!draft.visitMonth || draft.visitMonth < 1 || draft.visitMonth > 12)
    errors.push('Choose the month of your visit.')
  if (!draft.visitYear || draft.visitYear < 2000 || draft.visitYear > 2100)
    errors.push('Choose the year of your visit.')
  if (!draft.conflict) errors.push('Disclose whether a material conflict applies.')
  return errors
}

export function conflictLabel(conflict: ReviewConflict): string | null {
  if (conflict === 'none') return null
  return 'Connection disclosed — not included in average.'
}

export function calculateReviewAggregate(reviews: PublicReview[]): {
  average: number
  count: number
} {
  const included = reviews.filter(
    (review) =>
      (review.state === 'published' || review.state === 'restored') && review.conflict === 'none',
  )
  if (!included.length) return { average: 0, count: 0 }
  const total = included.reduce((sum, review) => sum + review.rating, 0)
  return { average: Math.round((total / included.length) * 10) / 10, count: included.length }
}

export function publicReviewCard(
  review: PublicReview,
): Pick<
  PublicReview,
  | 'id'
  | 'rating'
  | 'text'
  | 'displayName'
  | 'visitMonth'
  | 'visitYear'
  | 'conflict'
  | 'edited'
  | 'state'
> {
  return {
    id: review.id,
    rating: review.rating,
    text: review.text,
    displayName: review.displayName,
    visitMonth: review.visitMonth,
    visitYear: review.visitYear,
    conflict: review.conflict,
    edited: review.edited,
    state: review.state,
  }
}

export function restrictionForUpheldCount(
  upheldLast180Days: number,
  upheldLast365Days: number,
  independentReviewerSigned: boolean,
  now = new Date(),
): FeatureRestriction {
  let level: FeatureRestriction['level'] = 'notice_only'
  let days: number | undefined
  if (upheldLast180Days >= 2) {
    level = 'thirty_days'
    days = 30
  }
  if (upheldLast365Days >= 3) {
    level = 'ninety_days'
    days = 90
  }
  if (upheldLast365Days >= 4 && independentReviewerSigned) {
    level = 'one_eighty_days'
    days = 180
  }
  const startsAt = now.toISOString()
  return {
    feature: 'public_reviews',
    level,
    startsAt,
    expiresAt: days
      ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
    notice:
      level === 'notice_only'
        ? 'A review policy notice was recorded. Existing account controls remain available.'
        : `Public review posting is restricted for ${days} days for this store scope.`,
    active: true,
  }
}

export function canDecideModeration(input: {
  mfaVerified: boolean
  recentAuthAt: string | null
  differentReviewer?: boolean
  now?: Date
}): boolean {
  if (!input.mfaVerified || !input.recentAuthAt) return false
  const recent = new Date(input.recentAuthAt)
  if (Number.isNaN(recent.getTime())) return false
  const now = input.now ?? new Date()
  return now.getTime() - recent.getTime() <= 10 * 60 * 1000
}

export function canSubmitAppeal(
  deadlineAt: string,
  alreadySubmitted: boolean,
  now = new Date(),
): boolean {
  if (alreadySubmitted) return false
  const deadline = new Date(deadlineAt)
  return !Number.isNaN(deadline.getTime()) && now.getTime() <= deadline.getTime()
}

export function canDecideAppeal(differentReviewer: boolean, reason: string): boolean {
  return differentReviewer && reason.trim().length > 0
}

export function canUndoReviewDeletion(
  deletion: { state: 'pending_undo' | 'restored' | 'deleted'; undoExpiresAt: string },
  now = new Date(),
): boolean {
  if (deletion.state !== 'pending_undo') return false
  const expiry = new Date(deletion.undoExpiresAt)
  return !Number.isNaN(expiry.getTime()) && now.getTime() <= expiry.getTime()
}

export function formatConflict(conflict: ReviewConflict): string {
  return conflictLabel(conflict) ?? 'No material conflict disclosed.'
}
