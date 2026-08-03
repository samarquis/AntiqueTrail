export interface RegionalReleasePrerequisites {
  package10AReceipt: boolean
  productOwnerApproval: boolean
  independentSecurityReview: boolean
  brandDomainApproval: boolean
  hostingRecovery: boolean
  transactionalEmail: boolean
  routingProvider: boolean
  mediaProcessing: boolean
  externalAuditAnchor: boolean
  supportIncidentPath: boolean
  promotionCapacity: boolean
  availabilityCapacity: boolean
  recoveryPoint15Minutes: boolean
  recoveryTime4Hours: boolean
}

export interface RegionalReleaseCapabilities {
  publicCatalog: boolean
  publicClaims: boolean
  publicReviews: boolean
  publicRegistration: boolean
  productPromotion: boolean
}

export interface RegionalReleaseState {
  status: 'draft' | 'frozen' | 'deploying' | 'active' | 'rolled_back'
  artifactDigest: string
  catalogDigest: string
  capabilities: RegionalReleaseCapabilities
  completedSteps: string[]
  signedReceipt?: string
  rollbackReason?: string
}

export type RegionalReleaseStep =
  | 'recovery_point'
  | 'migration_dry_run'
  | 'config_secret_digest_sbom'
  | 'canary'
  | 'production_migration'
  | 'smoke'
  | 'monitoring'
  | 'signed_release_receipt'
  | 'capability_enablement'

export interface ReleaseReceiptVerification {
  receipt: string
  verifyReceipt: (receipt: string, artifactDigest: string, catalogDigest: string) => boolean
}

const deploymentOrder: RegionalReleaseStep[] = [
  'recovery_point',
  'migration_dry_run',
  'config_secret_digest_sbom',
  'canary',
  'production_migration',
  'capability_enablement',
  'smoke',
  'monitoring',
  'signed_release_receipt',
]

function disabledCapabilities(): RegionalReleaseCapabilities {
  return {
    publicCatalog: false,
    publicClaims: false,
    publicReviews: false,
    publicRegistration: false,
    productPromotion: false,
  }
}

export function createRegionalRelease(
  artifactDigest: string,
  catalogDigest: string,
): RegionalReleaseState {
  return {
    status: 'draft',
    artifactDigest,
    catalogDigest,
    capabilities: disabledCapabilities(),
    completedSteps: [],
  }
}

export function freezeRegionalRelease(
  state: RegionalReleaseState,
  prerequisites: RegionalReleasePrerequisites,
): RegionalReleaseState {
  if (state.status !== 'draft') throw new Error('release_not_draft')
  const missing = Object.entries(prerequisites)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  if (missing.length) throw new Error(`release_prerequisite_missing:${missing.join(',')}`)
  return { ...state, status: 'frozen' }
}

export function advanceRegionalRelease(
  state: RegionalReleaseState,
  step: RegionalReleaseStep,
  verification?: ReleaseReceiptVerification,
): RegionalReleaseState {
  if (state.status !== 'frozen' && state.status !== 'deploying') {
    throw new Error('release_not_deployable')
  }
  if (state.completedSteps.includes(step)) return state

  const expected = deploymentOrder[state.completedSteps.length]
  if (step !== expected) throw new Error(`release_step_out_of_order:expected_${expected}`)

  if (step === 'signed_release_receipt') {
    if (
      !verification ||
      !verification.verifyReceipt(verification.receipt, state.artifactDigest, state.catalogDigest)
    ) {
      throw new Error('release_receipt_invalid')
    }
  }

  const completedSteps = [...state.completedSteps, step]
  if (step === 'capability_enablement') {
    return {
      ...state,
      status: 'deploying',
      completedSteps,
      capabilities: {
        publicCatalog: true,
        publicClaims: true,
        publicReviews: true,
        publicRegistration: true,
        productPromotion: true,
      },
    }
  }

  return {
    ...state,
    status: step === 'signed_release_receipt' ? 'active' : 'deploying',
    completedSteps,
    ...(step === 'signed_release_receipt' && verification
      ? { signedReceipt: verification.receipt }
      : {}),
  }
}

export function rollbackRegionalRelease(
  state: RegionalReleaseState,
  reason: string,
): RegionalReleaseState {
  if (!reason.trim()) throw new Error('rollback_reason_required')
  return {
    ...state,
    status: 'rolled_back',
    capabilities: disabledCapabilities(),
    rollbackReason: reason,
  }
}
