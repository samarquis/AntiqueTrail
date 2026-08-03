import { describe, expect, it } from 'vitest'
import {
  canPrepareReceipt,
  canSignReadiness,
  createReadinessReceipt,
  EXTERNAL_CAPABILITIES,
  productionPromotionAllowed,
  readinessBlockers,
  recordBug,
  validateTestAccounts,
} from './boundary'

const accounts = [
  {
    pseudonymousId: 'a',
    role: 'TestUserA' as const,
    syntheticOnly: true as const,
    separateDevice: true,
    verifiedEmail: true,
    age18Attested: true,
    mfaState: 'not_required' as const,
  },
  {
    pseudonymousId: 'b',
    role: 'TestUserB' as const,
    syntheticOnly: true as const,
    separateDevice: true,
    verifiedEmail: true,
    age18Attested: true,
    mfaState: 'not_required' as const,
  },
]

describe('External Testing Readiness boundary', () => {
  it('requires separate synthetic test accounts and keeps production capabilities disabled', () => {
    expect(validateTestAccounts(accounts)).toBe(true)
    expect(
      validateTestAccounts([
        { ...accounts[0], pseudonymousId: 'same' },
        { ...accounts[1], pseudonymousId: 'same' },
      ]),
    ).toBe(false)
    expect(EXTERNAL_CAPABILITIES.promotion).toBe(false)
    expect(EXTERNAL_CAPABILITIES.externalProviders).toBe(false)
    expect(productionPromotionAllowed()).toBe(false)
  })

  it('blocks an incomplete readiness receipt and only permits Product Owner signing', () => {
    const prerequisites = [
      { id: 'alpha', name: 'Synthetic Alpha', result: 'pass' as const, artifactHash: 'hash-a' },
      { id: 'email', name: 'Email gate', result: 'blocked' as const },
    ]
    expect(readinessBlockers(prerequisites)).toHaveLength(1)
    const receipt = createReadinessReceipt(prerequisites)
    expect(receipt.state).toBe('blocked')
    expect(canPrepareReceipt(prerequisites)).toBe(false)
    expect(canSignReadiness(receipt, 'ProductOwner')).toBe(false)
    expect(canSignReadiness({ ...receipt, state: 'running' }, 'Administrator')).toBe(false)
  })

  it('captures redacted bug evidence and rejects raw email/location payloads', () => {
    const bug = recordBug({
      id: 'bug-1',
      severity: 'privacy',
      summary: 'Private page exposed a generic error',
      evidenceHash: 'hash-b',
      actorPseudonym: 'tester-a',
      state: 'open',
    })
    expect(bug.containsPreciseLocation).toBe(false)
    expect(bug.containsRawEmail).toBe(false)
    expect(() => recordBug({ ...bug, summary: 'Contact test@example.com at 127.0.0.1' })).toThrow(
      'bug_payload_redaction_required',
    )
  })
})
