import { describe, expect, it } from 'vitest'
import {
  advanceRegionalRelease,
  createRegionalRelease,
  freezeRegionalRelease,
  rollbackRegionalRelease,
  type RegionalReleaseStep,
  type RegionalReleasePrerequisites,
} from './regionalRelease'

function passingPrerequisites(): RegionalReleasePrerequisites {
  return {
    package10AReceipt: true,
    productOwnerApproval: true,
    independentSecurityReview: true,
    brandDomainApproval: true,
    hostingRecovery: true,
    transactionalEmail: true,
    routingProvider: true,
    mediaProcessing: true,
    externalAuditAnchor: true,
    supportIncidentPath: true,
    promotionCapacity: true,
    availabilityCapacity: true,
    recoveryPoint15Minutes: true,
    recoveryTime4Hours: true,
  }
}

describe('regional public release state machine', () => {
  it('refuses to freeze while any signed prerequisite is missing', () => {
    const prerequisites = passingPrerequisites()
    prerequisites.independentSecurityReview = false
    const state = createRegionalRelease('artifact-sha256', 'catalog-sha256')

    expect(() => freezeRegionalRelease(state, prerequisites)).toThrow(/independentSecurityReview/)
    expect(state.status).toBe('draft')
    expect(Object.values(state.capabilities).every((enabled) => !enabled)).toBe(true)
  })

  it('records the deployment checklist in a strict, idempotent order', () => {
    let state = freezeRegionalRelease(
      createRegionalRelease('artifact-sha256', 'catalog-sha256'),
      passingPrerequisites(),
    )
    const steps: RegionalReleaseStep[] = [
      'recovery_point',
      'migration_dry_run',
      'config_secret_digest_sbom',
      'canary',
      'production_migration',
    ]

    expect(() => advanceRegionalRelease(state, 'canary')).toThrow(/step_out_of_order/)
    for (const step of steps) state = advanceRegionalRelease(state, step)
    expect(advanceRegionalRelease(state, 'production_migration')).toEqual(state)
    expect(state.status).toBe('deploying')
    expect(state.artifactDigest).toBe('artifact-sha256')
    expect(state.catalogDigest).toBe('catalog-sha256')
    expect(Object.values(state.capabilities).every((enabled) => !enabled)).toBe(true)
  })

  it('enables capabilities before smoke and activates only after the final verified receipt', () => {
    let state = freezeRegionalRelease(
      createRegionalRelease('artifact-sha256', 'catalog-sha256'),
      passingPrerequisites(),
    )
    const beforeEnablement: RegionalReleaseStep[] = [
      'recovery_point',
      'migration_dry_run',
      'config_secret_digest_sbom',
      'canary',
      'production_migration',
    ]
    for (const step of beforeEnablement) state = advanceRegionalRelease(state, step)
    state = advanceRegionalRelease(state, 'capability_enablement')
    expect(state.status).toBe('deploying')
    expect(Object.values(state.capabilities).every(Boolean)).toBe(true)
    state = advanceRegionalRelease(state, 'smoke')
    state = advanceRegionalRelease(state, 'monitoring')

    expect(() =>
      advanceRegionalRelease(state, 'signed_release_receipt', {
        receipt: 'bad',
        verifyReceipt: () => false,
      }),
    ).toThrow(/receipt_invalid/)
    state = advanceRegionalRelease(state, 'signed_release_receipt', {
      receipt: 'signed:artifact-sha256:catalog-sha256',
      verifyReceipt: (receipt, artifact, catalog) => receipt === `signed:${artifact}:${catalog}`,
    })

    expect(state.status).toBe('active')
    expect(Object.values(state.capabilities).every(Boolean)).toBe(true)
  })

  it('rolls back atomically without erasing frozen evidence', () => {
    let state = freezeRegionalRelease(
      createRegionalRelease('artifact-sha256', 'catalog-sha256'),
      passingPrerequisites(),
    )
    for (const step of [
      'recovery_point',
      'migration_dry_run',
      'config_secret_digest_sbom',
      'canary',
    ] as RegionalReleaseStep[]) {
      state = advanceRegionalRelease(state, step)
    }

    const rolledBack = rollbackRegionalRelease(state, 'canary_health_failed')
    expect(rolledBack.status).toBe('rolled_back')
    expect(rolledBack.rollbackReason).toBe('canary_health_failed')
    expect(rolledBack.completedSteps).toEqual(state.completedSteps)
    expect(Object.values(rolledBack.capabilities).every((enabled) => !enabled)).toBe(true)
  })
})
