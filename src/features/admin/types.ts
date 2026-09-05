export type AdminCaseState =
  | 'open'
  | 'claimed'
  | 'queued'
  | 'assigned'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'closed'
export type ReviewTargetType = 'store' | 'claim' | 'media' | 'support'
export type AuditField = 'identity' | 'contact' | 'hours' | 'categories' | 'media'

export interface AdminSession {
  userId: string
  role: 'Administrator' | 'Representative' | 'Shopper'
  mfaEnrolled: boolean
  mfaVerified: boolean
  recentAuthAt: number
  sessionActive: boolean
}
export interface ReviewCase {
  id: string
  assignedTo?: string
  targetId: string
  targetType: ReviewTargetType
  state: AdminCaseState
  submitterId?: string
  lockVersion: number
  version: number
}
export interface CaseScope {
  caseId: string
  targetId: string
  targetType: ReviewTargetType
  field: AuditField
}
export interface StoreGrant {
  subjectUserId: string
  storeId: string
  state: 'active' | 'revoked' | 'expired'
  authorityEvidence: boolean
  verifiedEmail: boolean
  mfaVerified: boolean
}
export interface MergePreview {
  canonicalStoreId: string
  duplicateStoreId: string
  references: number
  collisions: number
  authorityReparented: false
  version: number
}

export type AdminCaseType =
  | 'partner_onboarding'
  | 'store_change'
  | 'image_review'
  | 'support'
  | 'listing_claim'
  | 'duplicate_merge'
  | 'access_safety'
export type AdminDecision = 'approve' | 'return' | 'reject'
export type AdminReviewQueueCategory =
  | 'onboarding'
  | 'store_changes'
  | 'images'
  | 'support'
  | 'listing_claims'
  | 'other'

export interface AdminReviewCaseSummary {
  id: string
  caseType: AdminCaseType
  queueCategory: AdminReviewQueueCategory
  assignedCount: number
  targetKind: string
  storeLabel: string
  state: AdminCaseState
  version: number
  createdAt: string
}

export interface AdminAuditEntry {
  action: string
  outcome: string
  occurredAt: string
}

export interface AdminReviewCaseDetail extends AdminReviewCaseSummary {
  auditAccess?: string
  immutableSubmission: true
  context: Record<string, string | number | boolean | null>
  allowedActions: AdminDecision[]
  audit: AdminAuditEntry[]
}

export interface AdminDecisionResult {
  id: string
  state: AdminCaseState
  version: number
  onboardingOutcome?: {
    pilotStoreRecordCreated: true
    storeLabel: string
    representativeScope: string
    unrelatedAuthorityChanged: false
  }
}

export interface AdminPrivilegedActivity {
  action: string
  outcome: string
  occurredAt: string
}

export interface AdminStoreScope {
  auditAccess?: string
  grantId: string
  subjectUserId: string
  subjectLabel: string
  storeId: string
  storeLabel: string
  state: 'active' | 'revoked' | 'expired' | 'reconsent_required'
  version: number
  verifiedEmail: boolean
  mfaVerified: boolean
  grantedAt: string
  revokedAt: string | null
  recentActivity: AdminPrivilegedActivity[]
}

export interface AdminScopeResult {
  grantId: string
  state: AdminStoreScope['state']
  version: number
}
export interface AdminScopePreview {
  previewId: string
  subjectUserId: string
  storeId: string
  grantId: string
  grantVersion: number
  previewHash: string
  expiresAt: string
}

export interface AdminMergeReference {
  ordinal: number
  kind: string
  collisionKind: string
  plannedResolution: string
}

export interface AdminMergePlan {
  proposalId: string
  canonicalStoreId: string
  duplicateStoreId: string
  canonicalLabel: string
  duplicateLabel: string
  safeReferences: number
  quarantinedConflicts: number
  authorityReparented: false
  references: AdminMergeReference[]
  state: 'previewed' | 'executed' | 'rolled_back'
  version: number
}
