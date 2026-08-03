import { describe, expect, it, vi } from 'vitest'
import {
  PRIVATE_READINESS_CAPABILITIES,
  calculateReadinessGate,
  enrollReadinessSubject,
  evaluateCat01,
  signReadinessReceipt,
  validateItineraries,
  validateReadinessCohort,
} from './readinessMachine'
import type {
  Cat01Packet,
  ReadinessCohortSubject,
  ReadinessEvidence,
  ReadinessItinerary,
  ReadinessReceipt,
  ReadinessReceiptVerifier,
} from './types'

function cat01(): Cat01Packet {
  return {
    frozenDigest: 'cat01-digest',
    reviewers: [
      { reviewerId: 'reviewer-a', name: 'Reviewer A' },
      { reviewerId: 'reviewer-b', name: 'Reviewer B' },
    ],
    listings: ['listing-a', 'listing-b', 'listing-c'].map((listingId) => ({
      listingId,
      nonPartner: true,
      city: 'Topeka',
      reviews: [
        {
          reviewerId: 'reviewer-a',
          sourceCount: 2,
          humanMinutes: 30,
          disagreementCount: 1,
          correctionCount: 1,
          reverificationMinutes: 10,
          provenanceComplete: true,
          licenseComplete: true,
          fresh: true,
        },
        {
          reviewerId: 'reviewer-b',
          sourceCount: 2,
          humanMinutes: 35,
          disagreementCount: 1,
          correctionCount: 1,
          reverificationMinutes: 12,
          provenanceComplete: true,
          licenseComplete: true,
          fresh: true,
        },
      ],
    })),
    budget: {
      approvedByProductOwner: true,
      approvalReceiptId: 'cat01-budget-receipt',
      signatureVerified: true,
      budgetMinutes: 2400,
      forecastMinutes: 1800,
      coversTwelveAndSeventyPercent: true,
      coversReverificationDays: 180,
    },
  }
}

function cohort(): ReadinessCohortSubject[] {
  return Array.from({ length: 8 }, (_, index) => ({
    subjectId: `subject-${index + 1}`,
    emailHmac: `hmac-${index + 1}`,
    verifiedEmail: true,
    adult: true,
    consented: true,
    onePersonAccountAttested: true,
    excludedClass: 'none' as const,
    ageBand: index < 3 ? ('70+' as const) : ('55-69' as const),
    adaptation: index < 2,
    selectedFirstEight: true,
    grantIssuedAt: '2026-08-01T00:00:00Z',
    grantExpiresAt: '2026-08-31T00:00:00Z',
    startedAt: '2026-08-03T00:00:00Z',
  }))
}

function itineraries(): ReadinessItinerary[] {
  const days = [
    ['Tuesday', '2026-08-04'],
    ['Friday', '2026-08-07'],
    ['Saturday', '2026-08-08'],
  ] as const
  return days.flatMap(([day, date], dayIndex) =>
    Array.from({ length: 3 }, (_, index) => ({
      itineraryId: `${day.toLowerCase()}-${index + 1}`,
      namedDay: day,
      localDate: date,
      nonHoliday: true,
      storeIds: [
        `store-${dayIndex}-${index}-a`,
        `store-${dayIndex}-${index}-b`,
        `store-${dayIndex}-${index}-c`,
      ],
      baselineRecheckedAt: '2026-07-15T00:00:00Z',
      startsAtFirstOpening: true,
      dwellMinutesPerStore: 45,
      transitionBufferMinutes: 10,
      providerMatrixDigest: `matrix-${dayIndex}-${index}`,
      finishesByVerifiedClosing: true,
      evidenceDigest: `evidence-${dayIndex}-${index}`,
    })),
  )
}

function evidence(): ReadinessEvidence {
  return {
    sourceDigest: 'readiness-source-digest',
    calculatedAt: '2026-08-03T12:00:00Z',
    cat01Receipt: {
      receiptId: 'cat01-receipt',
      decision: 'pass',
      frozenDigest: 'cat01-digest',
      signerResponsibility: 'ProductOwner',
      signatureVerified: true,
    },
    cohort: cohort(),
    itineraries: itineraries(),
    catalog: {
      activeVerifiedListings: 12,
      eligibleBaselineCount: 16,
      coveragePercent: 75,
      freshnessPercent: 100,
      marketSizeExceptionApproved: false,
      canonicalBrowseRoute: '/stores?area=topeka-ks',
      factOnly: true,
      provenanceComplete: true,
      noPartnershipImplication: true,
    },
    attempts: cohort().map((subject) => ({
      attemptId: `attempt-${subject.subjectId}`,
      attemptKind: 'original' as const,
      subjectId: subject.subjectId,
      attemptedCoreJourney: true,
      completedWithoutBlockingDefect: subject.subjectId !== 'subject-8',
      returnIntent: Number(subject.subjectId.split('-')[1]) <= 5,
      completedSecondTrip: false,
    })),
    artifactHashes: {
      browserDevice: 'hash-browser',
      accessibilityOlderAdult: 'hash-accessibility',
      legalInsurance: 'hash-legal',
      humanCapacity: 'hash-capacity',
      support: 'hash-support',
      security: 'hash-security',
      recovery: 'hash-recovery',
      incident: 'hash-incident',
    },
    unresolvedDefects: [],
    prerequisitesPassed: true,
  }
}

describe('Package 10A readiness machine', () => {
  it('blocks CAT-01 until two named independent reviewers and Product Owner budget approval exist', () => {
    expect(evaluateCat01(cat01())).toEqual([])
    const incomplete = cat01()
    incomplete.reviewers[1] = { ...incomplete.reviewers[0] }
    incomplete.budget.approvedByProductOwner = false
    expect(evaluateCat01(incomplete)).toEqual(
      expect.arrayContaining(['cat01_reviewers_not_independent', 'cat01_budget_not_approved']),
    )
  })

  it('enforces first-eight composition, deduplication, cohort cap, and 30-day grants', () => {
    expect(validateReadinessCohort(cohort())).toEqual([])
    const invalid = cohort()
    invalid[1] = { ...invalid[1], emailHmac: invalid[0].emailHmac, ageBand: '18-54' }
    invalid[2] = { ...invalid[2], grantExpiresAt: '2026-09-15T00:00:00Z' }
    expect(validateReadinessCohort(invalid)).toEqual(
      expect.arrayContaining([
        'cohort_duplicate_person_or_email',
        'cohort_first_eight_age_composition',
        'cohort_grant_exceeds_30_days',
      ]),
    )
    expect(validateReadinessCohort([...cohort(), ...cohort(), ...cohort()])).toContain(
      'cohort_cap_exceeded',
    )
    expect(() =>
      enrollReadinessSubject(cohort(), {
        ...cohort()[0],
        subjectId: 'subject-9',
        emailHmac: 'hmac-9',
        selectedFirstEight: false,
        startedAt: undefined,
      }),
    ).toThrow('cohort_enrollment_closed_after_first_eight_started')
  })

  it('requires exactly nine unique valid three-store itineraries across the named days', () => {
    expect(validateItineraries(itineraries())).toEqual([])
    const invalid = itineraries()
    invalid[1] = { ...invalid[1], storeIds: [...invalid[0].storeIds] }
    invalid[8] = { ...invalid[8], finishesByVerifiedClosing: false }
    expect(validateItineraries(invalid)).toEqual(
      expect.arrayContaining(['itinerary_store_sets_not_unique', 'itinerary_schedule_invalid']),
    )
  })

  it('calculates deterministic blockers without enabling any public capability', () => {
    const incomplete = evidence()
    incomplete.artifactHashes.recovery = ''
    incomplete.attempts = incomplete.attempts.slice(0, 7)
    const first = calculateReadinessGate(incomplete)
    const second = calculateReadinessGate(incomplete)
    expect(first).toEqual(second)
    expect(first.blockers).toEqual(
      expect.arrayContaining(['readiness_artifacts_incomplete', 'readiness_attempts_below_eight']),
    )
    expect(first.capabilities).toEqual(PRIVATE_READINESS_CAPABILITIES)
  })

  it('signs only an exact passing frozen digest and still keeps readiness private/noindex', async () => {
    const calculation = calculateReadinessGate(evidence())
    expect(calculation.blockers).toEqual([])
    const receipt: ReadinessReceipt = {
      receiptId: 'readiness-receipt',
      state: 'frozen',
      decision: 'pass',
      frozenDigest: calculation.frozenDigest,
      signerAccountId: 'product-owner-1',
      signerResponsibility: 'ProductOwner',
      signedAt: '2026-08-03T12:00:00Z',
      signature: 'opaque-signature',
    }
    const verifier: ReadinessReceiptVerifier = { verify: vi.fn(async () => true) }
    const signed = await signReadinessReceipt(calculation, receipt, verifier)
    expect(signed.state).toBe('signed')
    expect(signed.capabilities).toEqual(PRIVATE_READINESS_CAPABILITIES)
    await expect(
      signReadinessReceipt(calculation, receipt, { verify: async () => false }),
    ).rejects.toThrow('readiness_receipt_signature_invalid')
  })
})
