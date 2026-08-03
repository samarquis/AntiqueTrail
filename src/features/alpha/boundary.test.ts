import { describe, expect, it } from 'vitest'
import {
  ALPHA_CAPABILITIES,
  EvidenceLedger,
  isSyntheticArtifact,
  privacyBoundaryViolations,
  validateTwoAccountMatrix,
} from './boundary'

const accounts = [
  {
    pseudonymousId: 'a',
    role: 'TestUserA' as const,
    verifiedEmail: true,
    age18Attested: true,
    mfaEnabled: false,
    deviceClass: 'desktop' as const,
  },
  {
    pseudonymousId: 'b',
    role: 'TestUserB' as const,
    verifiedEmail: true,
    age18Attested: true,
    mfaEnabled: false,
    deviceClass: 'phone' as const,
  },
]

describe('Synthetic Internal Alpha boundary', () => {
  it('requires two distinct approved accounts and no shared identity', () => {
    expect(validateTwoAccountMatrix(accounts)).toBe(true)
    expect(validateTwoAccountMatrix([accounts[0], { ...accounts[1], pseudonymousId: 'a' }])).toBe(
      false,
    )
    expect(validateTwoAccountMatrix([accounts[0]])).toBe(false)
  })

  it('rejects real/provider/location/cache data and keeps alpha capabilities closed', () => {
    expect(privacyBoundaryViolations()).toEqual([])
    expect(ALPHA_CAPABILITIES.publicReviewsEnabled).toBe(false)
    expect(ALPHA_CAPABILITIES.externalProvidersEnabled).toBe(false)
    expect(
      isSyntheticArtifact({ id: 'store-1', audience: 'synthetic', storeName: 'Fictional Finds' }),
    ).toBe(true)
    expect(
      isSyntheticArtifact({
        id: 'store-2',
        audience: 'synthetic',
        storeName: 'Fictional Finds',
        sourceProvider: undefined,
      } as never),
    ).toBe(false)
  })

  it('records content-free hash-linked evidence and rejects unsafe capability state', () => {
    const ledger = new EvidenceLedger()
    const first = ledger.append({
      id: 'catalog-browse',
      name: 'Browse',
      result: 'pass',
      artifactHash: 'hash-1',
      actorPseudonym: 'tester-a',
      observedAt: '2026-01-01T00:00:00Z',
    })
    const second = ledger.append({
      id: 'two-account',
      name: 'Two account',
      result: 'pass',
      artifactHash: 'hash-2',
      actorPseudonym: 'tester-b',
      observedAt: '2026-01-01T00:01:00Z',
    })
    expect(first.sequence).toBe(1)
    expect(second.previousDigest).toBe(first.digest)
    expect(ledger.list()[0]).not.toHaveProperty('email')
    expect(() =>
      ledger.append(
        {
          id: 'unsafe',
          name: 'Unsafe',
          result: 'pass',
          artifactHash: 'hash-3',
          actorPseudonym: 'tester-a',
          observedAt: '2026-01-01T00:02:00Z',
        },
        { ...ALPHA_CAPABILITIES, catalogResponseCaching: true },
      ),
    ).toThrow('alpha_evidence_denied')
  })
})
