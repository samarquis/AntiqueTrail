export interface Cat01Reviewer {
  reviewerId: string
  name: string
}

export interface Cat01ListingReview {
  reviewerId: string
  sourceCount: number
  humanMinutes: number
  disagreementCount: number
  correctionCount: number
  reverificationMinutes: number
  provenanceComplete: boolean
  licenseComplete: boolean
  fresh: boolean
}

export interface Cat01Packet {
  frozenDigest: string
  reviewers: Cat01Reviewer[]
  listings: Array<{
    listingId: string
    nonPartner: boolean
    city: string
    reviews: Cat01ListingReview[]
  }>
  budget: {
    approvedByProductOwner: boolean
    approvalReceiptId: string
    signatureVerified: boolean
    budgetMinutes: number
    forecastMinutes: number
    coversTwelveAndSeventyPercent: boolean
    coversReverificationDays: number
  }
}

export type ReadinessExcludedClass =
  | 'none'
  | 'owner'
  | 'household'
  | 'ai'
  | 'synthetic'
  | 'test_operator'

export interface ReadinessCohortSubject {
  subjectId: string
  emailHmac: string
  verifiedEmail: boolean
  adult: boolean
  consented: boolean
  onePersonAccountAttested: boolean
  excludedClass: ReadinessExcludedClass
  ageBand: '18-54' | '55-69' | '70+'
  adaptation: boolean
  selectedFirstEight: boolean
  grantIssuedAt: string
  grantExpiresAt: string
  grantRevokedAt?: string
  startedAt?: string
}

export interface ReadinessItinerary {
  itineraryId: string
  namedDay: 'Tuesday' | 'Friday' | 'Saturday'
  localDate: string
  nonHoliday: boolean
  storeIds: string[]
  baselineRecheckedAt: string
  startsAtFirstOpening: boolean
  dwellMinutesPerStore: number
  transitionBufferMinutes: number
  providerMatrixDigest: string
  finishesByVerifiedClosing: boolean
  evidenceDigest: string
}

export interface ReadinessEvidence {
  sourceDigest: string
  calculatedAt: string
  cat01Receipt: {
    receiptId: string
    decision: 'pass' | 'reject'
    frozenDigest: string
    signerResponsibility: 'ProductOwner'
    signatureVerified: boolean
  } | null
  cohort: ReadinessCohortSubject[]
  itineraries: ReadinessItinerary[]
  catalog: {
    activeVerifiedListings: number
    eligibleBaselineCount: number
    coveragePercent: number
    freshnessPercent: number
    marketSizeExceptionApproved: boolean
    canonicalBrowseRoute: string
    factOnly: boolean
    provenanceComplete: boolean
    noPartnershipImplication: boolean
  }
  attempts: Array<{
    attemptId: string
    attemptKind: 'original' | 'retest'
    subjectId: string
    attemptedCoreJourney: boolean
    completedWithoutBlockingDefect: boolean
    returnIntent: boolean
    completedSecondTrip: boolean
  }>
  artifactHashes: {
    browserDevice: string
    accessibilityOlderAdult: string
    legalInsurance: string
    humanCapacity: string
    support: string
    security: string
    recovery: string
    incident: string
  }
  unresolvedDefects: Array<{
    defectId: string
    severity: 'blocking' | 'privacy' | 'security' | 'data_loss' | 'other'
  }>
  prerequisitesPassed: boolean
}

export interface PrivateReadinessCapabilities {
  readonly listingsPrivate: true
  readonly noindex: true
  readonly artifactsUndistributed: true
  readonly anonymousRealStoreAccess: false
  readonly publicReviews: false
  readonly ownerContact: false
  readonly publicPromotion: false
}

export interface ReadinessGateCalculation {
  frozenDigest: string
  blockers: string[]
  capabilities: PrivateReadinessCapabilities
}

export interface ReadinessReceipt {
  receiptId: string
  state: 'frozen'
  decision: 'pass' | 'reject'
  frozenDigest: string
  signerAccountId: string
  signerResponsibility: 'ProductOwner'
  signedAt: string
  signature: string
}

export interface SignedReadinessReceipt extends Omit<ReadinessReceipt, 'state'> {
  state: 'signed' | 'rejected'
  capabilities: PrivateReadinessCapabilities
}

export interface ReadinessReceiptVerifier {
  verify(receipt: ReadinessReceipt): Promise<boolean>
}

export interface DurableReadinessStatus {
  runId: string
  state: 'frozen' | 'signed' | 'rejected'
  frozenDigest: string
  blockers: string[]
  calculatedAt: string
  receiptId: string | null
}

export interface ReadinessSigningChallenge {
  challengeId: string
  payloadDigest: string
  expiresAt: string
}

export interface DurableReadinessClient {
  getStatus(runId: string): Promise<DurableReadinessStatus>
  requestSigningChallenge(runId: string): Promise<ReadinessSigningChallenge>
}
