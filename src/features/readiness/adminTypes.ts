export interface ReadinessAdminInvitation {
  invitationId: string
  state: 'pending' | 'registration_pending' | 'accepted' | 'revoked' | 'expired'
  expiresAt: string
  subjectId: string | null
  version: number
}

export interface ReadinessAdminSubject {
  subjectId: string
  state: 'active' | 'excluded' | 'expired'
  ageBand: '55-69' | '70+' | null
  adaptation: boolean | null
  startedAt: string | null
  exclusionReason: string | null
  version: number
}

export interface ReadinessAdminRun {
  runId: string
  state: 'not_started' | 'in_progress' | 'completed' | 'blocked'
  version: number
  frozenDigest: string | null
  blockers: string[]
  receiptId: string | null
  calculatedAt: string | null
  factCollectionState: 'collecting' | 'frozen' | null
}

export interface ReadinessAdminWorkspace {
  cohort: {
    cohortId: string
    areaSlug: 'topeka-ks'
    state: 'active' | 'revoked' | 'expired'
    version: number
  }
  invitations: ReadinessAdminInvitation[]
  subjects: ReadinessAdminSubject[]
  run: ReadinessAdminRun | null
  capabilities: {
    listingsPrivate: true
    noindex: true
    anonymousRealStoreAccess: false
    publicReviews: false
    publicPromotion: false
  }
}

export interface ReadinessAdminInvitationResult {
  invitationId: string
  state: ReadinessAdminInvitation['state']
  expiresAt: string
  token: string | null
  replayed: boolean
}

export interface ReadinessAdminCalculation {
  runId: string
  blockers: string[]
  canPass: boolean
  source: 'server_authoritative_facts'
}

export interface ReadinessAdminFreezeResult {
  runId: string
  state: 'frozen'
  frozenDigest: string
  blockers: string[]
  calculatedAt: string
  adminRunState: 'completed' | 'blocked'
}

export interface ReadinessAdminSigningCapability {
  capabilityId: string
  capabilityToken: string
  frozenDigest: string
  expiresAt: string
  blockers: string[]
}

export interface ReadinessAdminDecisionInput {
  capabilityToken: string
  decision: 'pass' | 'reject'
  signedPayloadDigest: string
  signatureDigest: string
  providerKeyId: string
  providerVerificationId: string
  reason?: string
}

export interface ReadinessAdminDecisionResult {
  receiptId: string
  runId: string
  state: 'signed' | 'rejected'
  decision: 'pass' | 'reject'
  replayed: boolean
}

export interface ReadinessAdminClient {
  getWorkspace(cohortId?: string, runId?: string): Promise<ReadinessAdminWorkspace>
  createInvitation(
    cohortId: string,
    recipientEmailHmac: string,
    idempotencyKey: string,
  ): Promise<ReadinessAdminInvitationResult>
  revokeInvitation(invitationId: string, expectedVersion: number): Promise<unknown>
  markStarted(subjectId: string, expectedVersion: number): Promise<unknown>
  excludeSubject(subjectId: string, reason: string, expectedVersion: number): Promise<unknown>
  beginRun(cohortId: string, runId: string, idempotencyKey: string): Promise<unknown>
  calculateGate(runId: string): Promise<ReadinessAdminCalculation>
  freezeReceipt(runId: string): Promise<ReadinessAdminFreezeResult>
  requestSigningCapability(
    runId: string,
    expectedDigest: string,
  ): Promise<ReadinessAdminSigningCapability>
  decideReceipt(input: ReadinessAdminDecisionInput): Promise<ReadinessAdminDecisionResult>
}
