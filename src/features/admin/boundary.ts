import type {
  AdminSession,
  AuditField,
  CaseScope,
  MergePreview,
  ReviewCase,
  StoreGrant,
} from './types'
import type { AuthSession } from '../auth'

export const GENERIC_ADMIN_FAILURE = 'This item is not available.'
export const RECENT_AUTH_WINDOW_MS = 10 * 60_000

/** Derives the UI guard only from the in-memory provider session. RPCs recheck it server-side. */
export function adminSessionFromAuth(
  session: AuthSession | null,
  now = Date.now(),
): AdminSession | null {
  if (!session) return null
  const recentAuthAt = Date.parse(session.passwordAuthenticatedAt ?? '')
  const mfaEnrolled = session.mfaEnrolled !== false
  const mfaVerifiedAt = Date.parse(session.mfaVerifiedAt ?? '')
  return {
    userId: session.userId,
    role: session.role,
    mfaEnrolled,
    mfaVerified:
      !mfaEnrolled ||
      (session.mfaVerified === true &&
        Number.isFinite(mfaVerifiedAt) &&
        mfaVerifiedAt <= now + 60_000),
    recentAuthAt: Number.isFinite(recentAuthAt) ? recentAuthAt : 0,
    sessionActive: session.expiresAt > now,
  }
}

export function canUseAdminBoundary(session: AdminSession | null, now = Date.now()): boolean {
  return Boolean(
    session?.sessionActive &&
      session.role === 'Administrator' &&
      (!session.mfaEnrolled || session.mfaVerified) &&
      session.recentAuthAt > now - RECENT_AUTH_WINDOW_MS &&
      session.recentAuthAt <= now + 60_000,
  )
}

export function canOpenCase(
  session: AdminSession | null,
  reviewCase: ReviewCase,
  now = Date.now(),
): boolean {
  return (
    canUseAdminBoundary(session, now) &&
    reviewCase.assignedTo === session?.userId &&
    !['closed', 'approved', 'rejected'].includes(reviewCase.state)
  )
}

const allowedFields: Record<ReviewCase['targetType'], AuditField[]> = {
  store: ['identity', 'contact', 'hours', 'categories', 'media'],
  claim: ['identity', 'contact'],
  media: ['media'],
  support: ['identity'],
}
export function canReadCaseField(
  session: AdminSession | null,
  reviewCase: ReviewCase,
  scope: CaseScope,
  now = Date.now(),
): boolean {
  return Boolean(
    canOpenCase(session, reviewCase, now) &&
      scope.caseId === reviewCase.id &&
      scope.targetId === reviewCase.targetId &&
      scope.targetType === reviewCase.targetType &&
      allowedFields[reviewCase.targetType].includes(scope.field),
  )
}

export function canDecideCase(
  session: AdminSession | null,
  reviewCase: ReviewCase,
  reason: string,
  now = Date.now(),
): boolean {
  return Boolean(
    canOpenCase(session, reviewCase, now) &&
      reviewCase.submitterId !== session?.userId &&
      reason.trim().length > 0,
  )
}

export function canMutatePrivileged(
  auditHealthy: boolean,
  outboxHealthy: boolean,
  rootAnchorHealthy: boolean,
): boolean {
  return auditHealthy && outboxHealthy && rootAnchorHealthy
}

export function canRevokeScope(
  session: AdminSession | null,
  grant: StoreGrant,
  storeId: string,
  now = Date.now(),
): boolean {
  return Boolean(
    canUseAdminBoundary(session, now) && grant.storeId === storeId && grant.state === 'active',
  )
}

export function canRegrantScope(
  session: AdminSession | null,
  grant: StoreGrant,
  storeId: string,
  now = Date.now(),
): boolean {
  return Boolean(
    canUseAdminBoundary(session, now) &&
      grant.storeId === storeId &&
      grant.state === 'revoked' &&
      grant.authorityEvidence &&
      grant.verifiedEmail &&
      grant.mfaVerified,
  )
}

export function previewDuplicateMerge(
  session: AdminSession | null,
  canonicalStoreId: string,
  duplicateStoreId: string,
  references: number,
  collisions: number,
  version: number,
  now = Date.now(),
): MergePreview | null {
  if (
    !canUseAdminBoundary(session, now) ||
    !canonicalStoreId ||
    !duplicateStoreId ||
    canonicalStoreId === duplicateStoreId
  )
    return null
  return {
    canonicalStoreId,
    duplicateStoreId,
    references,
    collisions,
    authorityReparented: false,
    version,
  }
}

export function mergeRollbackReactivatesAuthority(): false {
  return false
}
