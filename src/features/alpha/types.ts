export type AlphaRole = 'TestUserA' | 'TestUserB' | 'Administrator' | 'AgentAssistedShopper'
export type EvidenceResult = 'pass' | 'fail' | 'blocked'

export interface AlphaAccount {
  pseudonymousId: string
  role: AlphaRole
  verifiedEmail: boolean
  age18Attested: boolean
  mfaEnabled: boolean
  deviceClass: 'phone' | 'tablet' | 'desktop'
}
export interface AlphaCapabilities {
  syntheticAlpha: true
  publicReviewsEnabled: boolean
  publicPromotionEnabled: boolean
  externalProvidersEnabled: boolean
  preciseLocationEnabled: boolean
  catalogResponseCaching: boolean
}
export interface SyntheticArtifact {
  id: string
  audience: 'synthetic'
  storeName: string
  sourceProvider?: never
  preciseLocation?: never
  ownerEmail?: never
}
export interface AcceptanceCheck {
  id: string
  name: string
  result: EvidenceResult
  artifactHash: string
  actorPseudonym: string
  observedAt: string
}
export interface EvidenceReceipt {
  sequence: number
  checkId: string
  result: EvidenceResult
  artifactHash: string
  actorPseudonym: string
  observedAt: string
  previousDigest: string
  digest: string
}
