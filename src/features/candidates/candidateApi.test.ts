import { describe, expect, it } from 'vitest'
import { createCandidateProductionClient } from './candidateApi'

describe('candidate production client', () => {
  it('uses bounded RPCs for private DB commands and Edge for external/provider work', async () => {
    const rpcCalls: unknown[][] = []
    const edgeCalls: unknown[][] = []
    const rpc = async <T>(...args: unknown[]): Promise<T> => {
      rpcCalls.push(args)
      return { id: 'candidate-1' } as T
    }
    const edge = async <T>(...args: unknown[]): Promise<T> => {
      edgeCalls.push(args)
      return { accepted: false, state: 'pending', message: 'Pending' } as T
    }
    const client = createCandidateProductionClient({ rpc, edge })

    await client.saveCandidate({
      url: 'https://example.com/store',
      title: 'Store',
      note: '',
      extraction: {
        mode: 'manual_fallback',
        reason: 'fetch_failed',
        originalLink: 'https://example.com/store',
        originalNote: '',
        normalizedUrl: 'https://example.com/store',
        destinationHost: 'example.com',
        suggestions: { title: null, description: null, canonicalUrl: null, verified: false },
        publicWriteAllowed: false,
      },
    })
    await client.sendShare({ candidateId: 'candidate-1', recipientEmail: 'owner@example.com' })

    expect(rpcCalls[0]).toEqual(['candidate_save_candidate', expect.any(Object)])
    expect(edgeCalls[0]).toEqual([
      'candidate-send-share',
      {
        candidateId: 'candidate-1',
        recipientEmail: 'owner@example.com',
        idempotencyKey: 'send-candidate-1',
      },
    ])
  })

  it('maps transport details to the generic private failure', async () => {
    const client = createCandidateProductionClient({
      rpc: async () => {
        throw new Error('sensitive database detail')
      },
      edge: async () => {
        throw new Error('provider detail')
      },
    })
    await expect(client.listShares()).rejects.toThrow(/could not update this private item/i)
    await expect(
      client.sendShare({ candidateId: 'x', recipientEmail: 'a@b.test' }),
    ).rejects.toThrow(/could not update this private item/i)
  })
})
