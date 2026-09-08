import { describe, expect, it, vi } from 'vitest'
import { CommunityGateError, createCommunityGateClient } from './gateClient'

describe('community gate client', () => {
  it('keeps the frozen packet and decision as separate exact calls', async () => {
    const execute = vi.fn(async (operation: string) =>
      operation === 'packet' ? { runId: 'run' } : { challengeId: 'challenge' },
    )
    const client = createCommunityGateClient({ execute })
    await client.packet('12000000-0000-4000-8000-000000000101')
    await client.request('12000000-0000-4000-8000-000000000101', 'reject')
    expect(execute.mock.calls).toEqual([
      ['packet', { runId: '12000000-0000-4000-8000-000000000101' }],
      ['request', { runId: '12000000-0000-4000-8000-000000000101', decision: 'reject' }],
    ])
  })

  it('fails closed', async () => {
    const client = createCommunityGateClient({
      execute: async () => {
        throw new Error('private detail')
      },
    })
    await expect(client.packet('12000000-0000-4000-8000-000000000101')).rejects.toBeInstanceOf(
      CommunityGateError,
    )
  })
})
