import type {
  Cat01Packet,
  PrivateReadinessCapabilities,
  ReadinessCohortSubject,
  ReadinessEvidence,
  ReadinessGateCalculation,
  ReadinessItinerary,
  ReadinessReceipt,
  ReadinessReceiptVerifier,
  SignedReadinessReceipt,
} from './types'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export const PRIVATE_READINESS_CAPABILITIES: PrivateReadinessCapabilities = Object.freeze({
  listingsPrivate: true,
  noindex: true,
  artifactsUndistributed: true,
  anonymousRealStoreAccess: false,
  publicReviews: false,
  ownerContact: false,
  publicPromotion: false,
})

export function evaluateCat01(packet: Cat01Packet): string[] {
  const blockers: string[] = []
  const reviewerIds = packet.reviewers.map((reviewer) => reviewer.reviewerId)
  if (
    packet.reviewers.length !== 2 ||
    new Set(reviewerIds).size !== 2 ||
    packet.reviewers.some((reviewer) => !reviewer.reviewerId || !reviewer.name.trim())
  )
    blockers.push('cat01_reviewers_not_independent')
  if (
    packet.listings.length !== 3 ||
    new Set(packet.listings.map((listing) => listing.listingId)).size !== 3
  )
    blockers.push('cat01_three_listings_required')
  if (
    packet.listings.some((listing) => {
      const reviewIds = new Set(listing.reviews.map((review) => review.reviewerId))
      return (
        !listing.nonPartner ||
        listing.city !== 'Topeka' ||
        listing.reviews.length !== 2 ||
        reviewerIds.some((reviewerId) => !reviewIds.has(reviewerId)) ||
        listing.reviews.some(
          (review) =>
            review.sourceCount < 1 ||
            review.humanMinutes < 1 ||
            review.disagreementCount < 0 ||
            review.correctionCount < 0 ||
            review.reverificationMinutes < 0 ||
            !review.provenanceComplete ||
            !review.licenseComplete ||
            !review.fresh,
        )
      )
    })
  )
    blockers.push('cat01_listing_reconciliation_incomplete')
  if (
    !packet.budget.approvedByProductOwner ||
    !packet.budget.approvalReceiptId ||
    !packet.budget.signatureVerified
  )
    blockers.push('cat01_budget_not_approved')
  if (
    packet.budget.budgetMinutes <= 0 ||
    packet.budget.forecastMinutes <= 0 ||
    packet.budget.forecastMinutes > packet.budget.budgetMinutes ||
    !packet.budget.coversTwelveAndSeventyPercent ||
    packet.budget.coversReverificationDays < 180
  )
    blockers.push('cat01_forecast_not_sustainable')
  if (!packet.frozenDigest) blockers.push('cat01_digest_missing')
  return blockers
}

export function validateReadinessCohort(subjects: ReadinessCohortSubject[]): string[] {
  const blockers: string[] = []
  if (subjects.length > 20) blockers.push('cohort_cap_exceeded')
  const identities = subjects.flatMap((subject) => [
    `subject:${subject.subjectId}`,
    `email:${subject.emailHmac}`,
  ])
  if (new Set(identities).size !== identities.length)
    blockers.push('cohort_duplicate_person_or_email')
  if (
    subjects.some(
      (subject) =>
        !subject.subjectId ||
        !subject.emailHmac ||
        !subject.verifiedEmail ||
        !subject.adult ||
        !subject.consented ||
        !subject.onePersonAccountAttested ||
        subject.excludedClass !== 'none',
    )
  )
    blockers.push('cohort_subject_ineligible')
  if (
    subjects.some((subject) => {
      const issuedAt = Date.parse(subject.grantIssuedAt)
      const expiresAt = Date.parse(subject.grantExpiresAt)
      return (
        !Number.isFinite(issuedAt) ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= issuedAt ||
        expiresAt - issuedAt > 30 * DAY_IN_MS ||
        Boolean(subject.grantRevokedAt)
      )
    })
  )
    blockers.push('cohort_grant_exceeds_30_days')

  const firstEight = subjects.filter((subject) => subject.selectedFirstEight)
  if (
    firstEight.length !== 8 ||
    firstEight.some((subject) => subject.ageBand === '18-54') ||
    firstEight.filter((subject) => subject.ageBand === '70+').length < 3
  )
    blockers.push('cohort_first_eight_age_composition')
  if (firstEight.filter((subject) => subject.adaptation).length < 2)
    blockers.push('cohort_first_eight_adaptation_composition')
  return blockers
}

export function enrollReadinessSubject(
  subjects: ReadinessCohortSubject[],
  subject: ReadinessCohortSubject,
): ReadinessCohortSubject[] {
  if (subjects.length >= 20) throw new Error('cohort_cap_exceeded')
  if (
    subjects.filter((candidate) => candidate.selectedFirstEight && candidate.startedAt).length >= 8
  )
    throw new Error('cohort_enrollment_closed_after_first_eight_started')
  if (
    subjects.some(
      (candidate) =>
        candidate.subjectId === subject.subjectId || candidate.emailHmac === subject.emailHmac,
    )
  )
    throw new Error('cohort_duplicate_person_or_email')
  if (
    !subject.subjectId ||
    !subject.emailHmac ||
    !subject.verifiedEmail ||
    !subject.adult ||
    !subject.consented ||
    !subject.onePersonAccountAttested ||
    subject.excludedClass !== 'none'
  )
    throw new Error('cohort_subject_ineligible')
  const issuedAt = Date.parse(subject.grantIssuedAt)
  const expiresAt = Date.parse(subject.grantExpiresAt)
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 30 * DAY_IN_MS ||
    subject.grantRevokedAt
  )
    throw new Error('cohort_grant_invalid')
  return [...subjects, { ...subject }]
}

function utcDayName(localDate: string): string {
  const day = new Date(`${localDate}T12:00:00Z`).getUTCDay()
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]
}

export function validateItineraries(itineraries: ReadinessItinerary[]): string[] {
  const blockers: string[] = []
  if (itineraries.length !== 9) blockers.push('itinerary_nine_required')
  const ids = itineraries.map((itinerary) => itinerary.itineraryId)
  if (new Set(ids).size !== ids.length) blockers.push('itinerary_ids_not_unique')
  const storeSets = itineraries.map((itinerary) => [...itinerary.storeIds].sort().join('|'))
  if (new Set(storeSets).size !== storeSets.length) blockers.push('itinerary_store_sets_not_unique')
  for (const namedDay of ['Tuesday', 'Friday', 'Saturday'] as const) {
    if (itineraries.filter((itinerary) => itinerary.namedDay === namedDay).length !== 3)
      blockers.push(`itinerary_${namedDay.toLowerCase()}_count_invalid`)
  }
  if (
    itineraries.some((itinerary) => {
      const date = Date.parse(`${itinerary.localDate}T00:00:00Z`)
      const baseline = Date.parse(itinerary.baselineRecheckedAt)
      return (
        !itinerary.nonHoliday ||
        itinerary.storeIds.length !== 3 ||
        new Set(itinerary.storeIds).size !== 3 ||
        utcDayName(itinerary.localDate) !== itinerary.namedDay ||
        !Number.isFinite(date) ||
        !Number.isFinite(baseline) ||
        date < baseline ||
        date - baseline > 30 * DAY_IN_MS ||
        !itinerary.startsAtFirstOpening ||
        itinerary.dwellMinutesPerStore !== 45 ||
        itinerary.transitionBufferMinutes !== 10 ||
        !itinerary.providerMatrixDigest ||
        !itinerary.finishesByVerifiedClosing ||
        !itinerary.evidenceDigest
      )
    })
  )
    blockers.push('itinerary_schedule_invalid')
  return blockers
}

function catalogBlockers(evidence: ReadinessEvidence): string[] {
  const blockers: string[] = []
  const { catalog } = evidence
  const countPasses =
    catalog.activeVerifiedListings >= 12 ||
    (catalog.eligibleBaselineCount < 12 &&
      catalog.marketSizeExceptionApproved &&
      catalog.activeVerifiedListings >= catalog.eligibleBaselineCount)
  if (!countPasses) blockers.push('catalog_twelve_listing_floor_missing')
  if (catalog.coveragePercent < 70) blockers.push('catalog_seventy_percent_coverage_missing')
  if (catalog.freshnessPercent !== 100) blockers.push('catalog_freshness_not_complete')
  if (
    catalog.canonicalBrowseRoute !== '/stores?area=topeka-ks' ||
    !catalog.factOnly ||
    !catalog.provenanceComplete ||
    !catalog.noPartnershipImplication
  )
    blockers.push('catalog_private_fact_contract_incomplete')
  return blockers
}

function attemptBlockers(evidence: ReadinessEvidence): string[] {
  const blockers: string[] = []
  if (
    new Set(evidence.attempts.map((attempt) => attempt.attemptId)).size !== evidence.attempts.length
  )
    blockers.push('readiness_attempt_ids_not_unique')
  const firstEightIds = new Set(
    evidence.cohort
      .filter((subject) => subject.selectedFirstEight)
      .map((subject) => subject.subjectId),
  )
  const firstEightAttempts = evidence.attempts.filter((attempt) =>
    firstEightIds.has(attempt.subjectId),
  )
  const attemptsBySubject = new Map<
    string,
    { original: boolean; completed: boolean; returned: boolean }
  >()
  for (const attempt of firstEightAttempts) {
    const current = attemptsBySubject.get(attempt.subjectId) ?? {
      original: false,
      completed: false,
      returned: false,
    }
    attemptsBySubject.set(attempt.subjectId, {
      original:
        current.original || (attempt.attemptKind === 'original' && attempt.attemptedCoreJourney),
      completed: current.completed || attempt.completedWithoutBlockingDefect,
      returned: current.returned || attempt.returnIntent || attempt.completedSecondTrip,
    })
  }
  const subjectResults = [...attemptsBySubject.values()]
  if (subjectResults.length < 8 || subjectResults.filter((result) => result.original).length < 8)
    blockers.push('readiness_attempts_below_eight')
  if (subjectResults.filter((result) => result.completed).length < 7)
    blockers.push('readiness_completions_below_seven')
  if (subjectResults.filter((result) => result.returned).length < 5)
    blockers.push('readiness_return_intent_below_five')
  return blockers
}

export function calculateReadinessGate(evidence: ReadinessEvidence): ReadinessGateCalculation {
  const blockers: string[] = []
  if (
    !evidence.cat01Receipt ||
    evidence.cat01Receipt.decision !== 'pass' ||
    evidence.cat01Receipt.signerResponsibility !== 'ProductOwner' ||
    !evidence.cat01Receipt.signatureVerified ||
    !evidence.cat01Receipt.frozenDigest
  )
    blockers.push('cat01_signed_pass_missing')
  blockers.push(...validateReadinessCohort(evidence.cohort))
  const calculatedAt = Date.parse(evidence.calculatedAt)
  if (
    !Number.isFinite(calculatedAt) ||
    evidence.cohort
      .filter((subject) => subject.selectedFirstEight)
      .some(
        (subject) =>
          Date.parse(subject.grantIssuedAt) > calculatedAt ||
          Date.parse(subject.grantExpiresAt) <= calculatedAt ||
          Boolean(subject.grantRevokedAt),
      )
  )
    blockers.push('cohort_first_eight_grant_inactive')
  blockers.push(...validateItineraries(evidence.itineraries))
  blockers.push(...catalogBlockers(evidence))
  blockers.push(...attemptBlockers(evidence))
  if (Object.values(evidence.artifactHashes).some((hash) => !hash))
    blockers.push('readiness_artifacts_incomplete')
  if (
    evidence.unresolvedDefects.some((defect) =>
      ['blocking', 'privacy', 'security', 'data_loss'].includes(defect.severity),
    )
  )
    blockers.push('readiness_critical_defect_open')
  if (!evidence.prerequisitesPassed) blockers.push('readiness_prerequisites_incomplete')
  if (!evidence.sourceDigest) blockers.push('readiness_source_digest_missing')
  return {
    frozenDigest: evidence.sourceDigest,
    blockers,
    capabilities: PRIVATE_READINESS_CAPABILITIES,
  }
}

export async function signReadinessReceipt(
  calculation: ReadinessGateCalculation,
  receipt: ReadinessReceipt,
  verifier: ReadinessReceiptVerifier,
): Promise<SignedReadinessReceipt> {
  if (
    receipt.frozenDigest !== calculation.frozenDigest ||
    receipt.signerResponsibility !== 'ProductOwner' ||
    !receipt.receiptId ||
    !receipt.signerAccountId ||
    !receipt.signedAt ||
    !receipt.signature
  )
    throw new Error('readiness_receipt_mismatch')
  if (receipt.decision === 'pass' && calculation.blockers.length > 0)
    throw new Error('readiness_pass_blocked')
  if (!(await verifier.verify(receipt))) throw new Error('readiness_receipt_signature_invalid')
  return {
    ...receipt,
    state: receipt.decision === 'pass' ? 'signed' : 'rejected',
    capabilities: PRIVATE_READINESS_CAPABILITIES,
  }
}
