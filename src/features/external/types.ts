export type ReadinessState = 'not_started' | 'running' | 'passed' | 'blocked'
export type ReadinessResult = 'pass' | 'fail' | 'blocked'
export type BugSeverity = 'blocking' | 'privacy' | 'security' | 'data_loss' | 'major' | 'minor'

export interface ReadinessPrerequisite {
  id: string
  name: string
  result: ReadinessResult
  artifactHash?: string
}
export interface SyntheticTestAccount {
  pseudonymousId: string
  role: 'TestUserA' | 'TestUserB' | 'Administrator'
  syntheticOnly: true
  separateDevice: boolean
  verifiedEmail: boolean
  age18Attested: boolean
  mfaState: 'enabled' | 'not_required'
}
export interface BugIntake {
  id: string
  severity: BugSeverity
  summary: string
  evidenceHash: string
  actorPseudonym: string
  containsPreciseLocation: false
  containsRawEmail: false
  state: 'open' | 'triaged' | 'resolved'
}
export interface ReadinessReceipt {
  state: ReadinessState
  prerequisiteDigest: string
  artifactHashes: string[]
  promotionEnabled: false
  ownerOutreachEnabled: false
  signedBy?: 'ProductOwner'
}
