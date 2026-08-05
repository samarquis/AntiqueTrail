import { describe, expect, it } from 'vitest'
import { parseRG01Command } from '../../../supabase/functions/_shared/rg01-command'

const runId = '11111111-1111-4111-8111-111111111111'
const idempotencyKey = '22222222-2222-4222-8222-222222222222'

describe('RG-01 command parser', () => {
  it('accepts exact operational commands', () => {
    expect(
      parseRG01Command({
        operation: 'begin',
        payload: {
          runId,
          idempotencyKey,
          windowStart: '2026-02-06T00:00:00.000Z',
          windowEnd: '2026-08-05T00:00:00.000Z',
        },
      }),
    ).toEqual(expect.objectContaining({ operation: 'begin' }))
    expect(parseRG01Command({ operation: 'status', payload: {} })).toEqual({
      operation: 'status',
      payload: {},
    })
  })

  it.each(['totals', 'denominator', 'exclusions', 'signature', 'failedCodes'])(
    'rejects browser supplied %s',
    (field) => {
      expect(() =>
        parseRG01Command({
          operation: 'freeze',
          payload: { runId, idempotencyKey, [field]: 25 },
        }),
      ).toThrow(/shape/iu)
    },
  )

  it('rejects windows longer than 180 days and invalid digests', () => {
    expect(() =>
      parseRG01Command({
        operation: 'begin',
        payload: {
          runId,
          idempotencyKey,
          windowStart: '2025-01-01T00:00:00.000Z',
          windowEnd: '2026-08-05T00:00:00.000Z',
        },
      }),
    ).toThrow(/window/iu)
    expect(() =>
      parseRG01Command({
        operation: 'consume_decision',
        payload: { challengeId: runId, idempotencyKey, payloadDigest: 'not-a-digest' },
      }),
    ).toThrow(/digest/iu)
  })
})
