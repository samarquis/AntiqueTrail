import { describe, expect, it } from 'vitest'
import {
  parseCommunityGateCommand,
  parseCommunityUserCommand,
} from '../../../supabase/functions/_shared/community-user-command'

const runId = '12000000-0000-4000-8000-000000000101'

describe('community user-session command boundary', () => {
  it('accepts only the bounded preparation operations', () => {
    expect(parseCommunityUserCommand({ operation: 'list', payload: {} }).operation).toBe('list')
    expect(() => parseCommunityUserCommand({ operation: 'activate', payload: { runId } })).toThrow(
      'community_command_unavailable',
    )
    expect(() =>
      parseCommunityUserCommand({
        operation: 'prepare',
        payload: {
          runId,
          areaSlug: 'osage-city',
          selectionReceiptId: runId,
          prerequisiteReceiptId: runId,
          expectedRootVersion: 1,
          idempotencyKey: 'x',
          targetOrdinal: 1,
        },
      }),
    ).toThrow('community_command_unavailable')
  })

  it('requires the exact capability-bound gate decision payload', () => {
    expect(
      parseCommunityGateCommand({ operation: 'request', payload: { runId, decision: 'reject' } })
        .operation,
    ).toBe('request')
    expect(() =>
      parseCommunityGateCommand({
        operation: 'decide',
        payload: {
          runId,
          challengeId: runId,
          payloadDigest: '00'.repeat(32),
          decision: 'pass',
          expectedRunVersion: 1,
          idempotencyKey: 'gate-1',
          extra: true,
        },
      }),
    ).toThrow('community_command_unavailable')
  })
})
