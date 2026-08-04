export type AdminCaseState =
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
