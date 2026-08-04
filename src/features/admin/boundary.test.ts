import { describe, expect, it } from 'vitest'
import {
  adminSessionFromAuth,
  canDecideCase,
  canOpenCase,
  canReadCaseField,
  canRegrantScope,
  canRevokeScope,
  canUseAdminBoundary,
  GENERIC_ADMIN_FAILURE,
  mergeRollbackReactivatesAuthority,
  previewDuplicateMerge,
} from './boundary'

const admin = {
  userId: 'admin-1',
  role: 'Administrator' as const,
  mfaEnrolled: true,
  mfaVerified: true,
  recentAuthAt: 9_500,
  sessionActive: true,
}
const reviewCase = {
  id: 'case-1',
  assignedTo: 'admin-1',
  targetId: 'store-1',
  targetType: 'store' as const,
  state: 'assigned' as const,
  submitterId: 'owner-1',
  lockVersion: 1,
  version: 1,
}
const grant = {
  subjectUserId: 'rep-1',
  storeId: 'store-1',
  state: 'revoked' as const,
  authorityEvidence: true,
  verifiedEmail: true,
  mfaVerified: true,
}

describe('admin review and access boundary', () => {
  it('derives the guard from real auth metadata and fails closed when metadata is absent', () => {
    const now = Date.parse('2026-08-04T12:05:00Z')
    const session = {
      userId: 'admin-1',
      accessToken: 'memory-only',
      expiresAt: now + 60_000,
      role: 'Administrator' as const,
      mfaRequired: true,
      mfaEnrolled: true,
      mfaVerified: true,
      passwordAuthenticatedAt: '2026-08-04T12:00:00Z',
      mfaVerifiedAt: '2026-08-04T12:01:00Z',
    }
    expect(canUseAdminBoundary(adminSessionFromAuth(session, now), now)).toBe(true)
    expect(
      canUseAdminBoundary(
        adminSessionFromAuth({ ...session, passwordAuthenticatedAt: undefined }, now),
        now,
      ),
    ).toBe(false)
    expect(
      canUseAdminBoundary(adminSessionFromAuth({ ...session, mfaVerifiedAt: undefined }, now), now),
    ).toBe(false)
    expect(
      canUseAdminBoundary(
        adminSessionFromAuth(
          { ...session, mfaEnrolled: false, mfaVerified: false, mfaVerifiedAt: undefined },
          now,
        ),
        now,
      ),
    ).toBe(true)
  })

  it('requires Administrator MFA and recent authentication', () => {
    expect(canUseAdminBoundary(admin, 10_000)).toBe(true)
    expect(canUseAdminBoundary({ ...admin, mfaVerified: false }, 10_000)).toBe(false)
    expect(canUseAdminBoundary({ ...admin, recentAuthAt: 1 }, 700_000)).toBe(false)
    expect(canUseAdminBoundary({ ...admin, role: 'Representative' }, 10_000)).toBe(false)
    expect(canUseAdminBoundary({ ...admin, mfaEnrolled: false, mfaVerified: false }, 10_000)).toBe(
      true,
    )
  })

  it('rechecks exact case assignment, target and field scope; self-approval is denied', () => {
    expect(canOpenCase(admin, reviewCase, 10_000)).toBe(true)
    expect(canOpenCase({ ...admin, userId: 'other' }, reviewCase, 10_000)).toBe(false)
    expect(
      canReadCaseField(
        admin,
        reviewCase,
        { caseId: 'case-1', targetId: 'store-1', targetType: 'store', field: 'hours' },
        10_000,
      ),
    ).toBe(true)
    expect(
      canReadCaseField(
        admin,
        reviewCase,
        { caseId: 'case-2', targetId: 'store-1', targetType: 'store', field: 'hours' },
        10_000,
      ),
    ).toBe(false)
    expect(canDecideCase(admin, reviewCase, 'approve', 10_000)).toBe(true)
    expect(canDecideCase({ ...admin, userId: 'owner-1' }, reviewCase, 'approve', 10_000)).toBe(
      false,
    )
    expect(canDecideCase(admin, reviewCase, '  ', 10_000)).toBe(false)
  })

  it('requires exact scope and evidence for revoke/regrant', () => {
    expect(canRevokeScope(admin, { ...grant, state: 'active' }, 'store-1', 10_000)).toBe(true)
    expect(canRegrantScope(admin, grant, 'store-1', 10_000)).toBe(true)
    expect(canRegrantScope(admin, { ...grant, authorityEvidence: false }, 'store-1', 10_000)).toBe(
      false,
    )
    expect(canRegrantScope(admin, grant, 'store-2', 10_000)).toBe(false)
  })

  it('previews only distinct stores, never reparents authority, and fails generically', () => {
    expect(previewDuplicateMerge(admin, 'store-1', 'store-2', 3, 1, 4, 10_000)).toEqual({
      canonicalStoreId: 'store-1',
      duplicateStoreId: 'store-2',
      references: 3,
      collisions: 1,
      authorityReparented: false,
      version: 4,
    })
    expect(previewDuplicateMerge(admin, 'store-1', 'store-1', 3, 1, 4, 10_000)).toBeNull()
    expect(mergeRollbackReactivatesAuthority()).toBe(false)
    expect(GENERIC_ADMIN_FAILURE).not.toMatch(/case|store|owner|user/i)
  })
})
