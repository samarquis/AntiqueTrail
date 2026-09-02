export type ReviewStage = 'internal_alpha' | 'private_beta' | 'readiness' | 'regional_public_mvp'

export interface ReviewCapability {
  stage: ReviewStage
  enabled: boolean
  source: 'server'
}

export type ReviewConflict =
  | 'none'
  | 'employment'
  | 'ownership'
  | 'family'
  | 'vendor'
  | 'compensated'
  | 'other_material'

export type ReviewState =
  | 'published'
  | 'pending_review'
  | 'removed'
  | 'rejected'
  | 'deleted'
  | 'restored'

export interface ReviewEligibility {
  verifiedEmail: boolean
  ageAttested: boolean
  completedVisit: boolean
  manualVisitAttested: boolean
  activeReviewExists: boolean
  ownStoreConflict: boolean
  accountDeletionScheduled: boolean
  rateLimited: boolean
}

export interface ReviewDraft {
  storeId: string
  rating: number | null
  text: string
  displayName: string
  visitMonth: number | null
  visitYear: number | null
  conflict: ReviewConflict
  manualVisitAttested: boolean
}

export interface PublicReview {
  id: string
  storeId: string
  rating: number
  text: string | null
  displayName: string
  visitMonth: number
  visitYear: number
  conflict: ReviewConflict
  state: Extract<ReviewState, 'published' | 'pending_review' | 'removed' | 'rejected' | 'restored'>
  edited: boolean
  publishedAt?: string
}

export interface ReviewAggregate {
  average: number
  count: number
}

export interface StoreReviewsSnapshot {
  aggregate: ReviewAggregate
  reviews: PublicReview[]
  ownReview: PublicReview | null
}

export type ReviewReportReason =
  | 'spam'
  | 'threats_harassment_hate'
  | 'personal_sensitive_information'
  | 'impersonation'
  | 'undisclosed_conflict'
  | 'compensated_manipulation'
  | 'irrelevant'
  | 'legal_safety'

export type ModerationAction = 'hold' | 'remove' | 'restore' | 'dismiss_report'
export type ModerationCaseState = 'open' | 'held' | 'removed' | 'restored' | 'dismissed'

export interface ModerationEvidence {
  kind: 'review_text' | 'report_reason' | 'prior_decision'
  value: string
}

export interface ModerationCase {
  id: string
  reviewId: string
  storeId: string
  state: ModerationCaseState
  reasonCode: ReviewReportReason | null
  evidence: ModerationEvidence[]
  openedAt: string
  updatedAt: string
  reporterPseudonym?: string
}

export interface ModerationDecisionInput {
  action: ModerationAction
  reason: string
  mfaVerified: boolean
  recentAuthAt: string | null
}

export interface ModerationConsequencePreview {
  transition: string
  aggregateEffect: string
  authorNotice: string
  reasonAndAudit: string
  reversibility: string
}

export type RestrictionLevel = 'notice_only' | 'thirty_days' | 'ninety_days' | 'one_eighty_days'

export interface FeatureRestriction {
  feature: 'public_reviews'
  storeId?: string
  level: RestrictionLevel
  startsAt: string
  expiresAt?: string
  notice: string
  active: boolean
}

export type AppealState = 'eligible' | 'submitted' | 'restored' | 'upheld' | 'expired'

export interface ReviewAppeal {
  id: string
  reviewId: string
  submittedBy: 'author' | 'store_representative'
  state: AppealState
  originalDecision: ModerationAction
  reason: string
  deadlineAt: string
  decidedByDifferentReviewer: boolean
  decisionReason?: string
}

export interface RestrictionAppeal {
  id: string
  feature: 'public_reviews'
  state: AppealState
  submittedAt?: string
  deadlineAt: string
  decidedByDifferentReviewer: boolean
  decisionReason?: string
}

export interface ReviewDeletion {
  reviewId: string
  state: 'pending_undo' | 'restored' | 'deleted'
  undoExpiresAt: string
  purgeDueAt: string
}

export interface ReviewClient {
  getCapability(): Promise<ReviewCapability>
  getEligibility(storeId: string): Promise<ReviewEligibility>
  getStoreReviews(storeId: string): Promise<StoreReviewsSnapshot>
  publishReview(draft: ReviewDraft): Promise<PublicReview>
  editReview(reviewId: string, draft: ReviewDraft): Promise<PublicReview>
  requestDeleteReview(reviewId: string): Promise<ReviewDeletion>
  undoDeleteReview(reviewId: string): Promise<PublicReview>
  reportReview(reviewId: string, reason: ReviewReportReason): Promise<{ accepted: true }>
  submitAppeal(input: { reviewId: string; reason: string }): Promise<ReviewAppeal>
  listModerationCases(): Promise<ModerationCase[]>
  decideModerationCase(caseId: string, input: ModerationDecisionInput): Promise<ModerationCase>
  submitRestrictionAppeal(input: {
    restrictionId: string
    reason: string
  }): Promise<RestrictionAppeal>
  decideRestrictionAppeal(
    appealId: string,
    input: { outcome: 'restore' | 'uphold'; reason: string; differentReviewer: boolean },
  ): Promise<RestrictionAppeal>
  expireFeatureRestriction(restrictionId: string): Promise<FeatureRestriction>
}
