import { describe, expect, it, vi } from 'vitest'
import { createCandidateCleanupScheduler } from './candidateCleanupService'

describe('configured candidate cleanup service', () => {
  it('expires pending shares before claiming and deleting due Storage objects', async () => {
    const calls: string[] = []
    const scheduler = createCandidateCleanupScheduler({
      rpc: {
        async rpc<T>(name: string) {
          calls.push(name)
          if (name === 'expire_candidate_shares') return { data: 1 as T, error: null }
          if (name === 'claim_candidate_cleanup') return { data: [] as T, error: null }
          throw new Error('unexpected_rpc')
        },
      },
      storage: { deleteObjects: vi.fn() },
    })
    await scheduler.runOnce(Date.UTC(2026, 7, 3))
    expect(calls).toEqual(['expire_candidate_shares', 'claim_candidate_cleanup'])
  })
})
