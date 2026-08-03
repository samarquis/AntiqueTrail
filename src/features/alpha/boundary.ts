import type {
  AcceptanceCheck,
  AlphaAccount,
  AlphaCapabilities,
  EvidenceReceipt,
  SyntheticArtifact,
} from './types'

export const ALPHA_CAPABILITIES: AlphaCapabilities = {
  syntheticAlpha: true,
  publicReviewsEnabled: false,
  publicPromotionEnabled: false,
  externalProvidersEnabled: false,
  preciseLocationEnabled: false,
  catalogResponseCaching: false,
}
export const GENERIC_ALPHA_BLOCKED = 'This capability is not available in Synthetic Internal Alpha.'

export function validateTwoAccountMatrix(accounts: AlphaAccount[]): boolean {
  const roles = new Set(accounts.map((account) => account.role))
  return (
    accounts.length === 2 &&
    roles.has('TestUserA') &&
    roles.has('TestUserB') &&
    new Set(accounts.map((account) => account.pseudonymousId)).size === 2 &&
    accounts.every((account) => account.verifiedEmail && account.age18Attested)
  )
}

export function isSyntheticArtifact(artifact: SyntheticArtifact): boolean {
  return (
    artifact.audience === 'synthetic' &&
    !('sourceProvider' in artifact) &&
    !('preciseLocation' in artifact) &&
    !('ownerEmail' in artifact)
  )
}

export function privacyBoundaryViolations(
  capabilities: AlphaCapabilities = ALPHA_CAPABILITIES,
): string[] {
  const violations: string[] = []
  if (capabilities.publicReviewsEnabled) violations.push('public_reviews')
  if (capabilities.publicPromotionEnabled) violations.push('public_promotion')
  if (capabilities.externalProvidersEnabled) violations.push('external_provider')
  if (capabilities.preciseLocationEnabled) violations.push('precise_location')
  if (capabilities.catalogResponseCaching) violations.push('catalog_cache')
  return violations
}

export function canRecordEvidence(
  check: AcceptanceCheck,
  capabilities: AlphaCapabilities = ALPHA_CAPABILITIES,
): boolean {
  return Boolean(
    check.id &&
      check.artifactHash &&
      check.actorPseudonym &&
      check.observedAt &&
      privacyBoundaryViolations(capabilities).length === 0,
  )
}

export class EvidenceLedger {
  #receipts: EvidenceReceipt[] = []
  append(
    check: AcceptanceCheck,
    capabilities: AlphaCapabilities = ALPHA_CAPABILITIES,
  ): EvidenceReceipt {
    if (!canRecordEvidence(check, capabilities)) throw new Error('alpha_evidence_denied')
    const previousDigest = this.#receipts.at(-1)?.digest ?? 'GENESIS'
    const sequence = this.#receipts.length + 1
    const digest = `sha256:${sequence}:${check.id}:${check.artifactHash}:${previousDigest}`
    const receipt = {
      sequence,
      checkId: check.id,
      result: check.result,
      artifactHash: check.artifactHash,
      actorPseudonym: check.actorPseudonym,
      observedAt: check.observedAt,
      previousDigest,
      digest,
    }
    this.#receipts.push(receipt)
    return receipt
  }
  list(): readonly EvidenceReceipt[] {
    return this.#receipts
  }
}
