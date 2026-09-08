import { describe, expect, it } from 'vitest'
import { projectRG01Status } from './operationsProjection'

const runId = '11111111-1111-4111-8111-111111111111'

const run = {
  runId,
  state: 'frozen',
  windowStart: '2026-02-06T00:00:00.000Z',
  windowEnd: '2026-08-05T00:00:00.000Z',
  sourceCutoff: '2026-08-05T00:00:00.000Z',
  currentSource: true,
  manifestDigest: 'a'.repeat(64),
  blockers: [],
  metrics: { first_trip_shoppers: 25, current_listings: 12, privateSubjectId: 'secret' },
  receiptId: null,
  receiptStatus: 'none',
  supersedesReceiptId: null,
  supersessionStatus: 'none',
  linkagePurgeDueAt: null,
  purgeStatus: 'not_due',
  linkagePurged: false,
  subjectId: 'never-render-this',
}

describe('RG-01 operational projection', () => {
  it('accepts the bounded aggregate contract and drops unknown metric fields', () => {
    const projection = projectRG01Status({
      collectionEnabled: true,
      permissions: { prepare: true, freeze: true, sign: false },
      run,
      runs: [run],
    })
    expect(projection.run?.metrics).toEqual({ first_trip_shoppers: 25, current_listings: 12 })
    expect(JSON.stringify(projection)).not.toContain('secret')
    expect(JSON.stringify(projection)).not.toContain('subjectId')
  })

  it('rejects malformed or unbounded server data', () => {
    expect(() =>
      projectRG01Status({
        collectionEnabled: true,
        permissions: { prepare: true, freeze: true, sign: false },
        run,
        runs: [{ ...run, manifestDigest: 'not-a-digest' }],
      }),
    ).toThrow(/unavailable/iu)
  })
})
