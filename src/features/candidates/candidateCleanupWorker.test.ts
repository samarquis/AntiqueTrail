import { describe, expect, it, vi } from 'vitest'
import {
  runCandidateCleanupWorker,
  type CandidateCleanupWorkerQueue,
} from './candidateCleanupWorker'

describe('candidate cleanup worker adapter', () => {
  it('claims due work, deletes Storage first, then records durable DB completion', async () => {
    const operations: string[] = []
    const queue: CandidateCleanupWorkerQueue = {
      claimDue: vi.fn(async () => [
        {
          shareId: 'share-1',
          claimToken: 'claim-1',
          storageKeys: ['candidate/share-1/preview.html'],
        },
      ]),
      complete: vi.fn(async (input) => {
        operations.push(`complete:${input.providerReceipt}`)
      }),
    }

    const result = await runCandidateCleanupWorker(
      {
        queue,
        storage: {
          deleteObjects: async (keys) => {
            operations.push(`storage:${keys.join(',')}`)
            return {
              receiptId: 'receipt-1',
              providerReceipt: 'provider-delete-1',
              deletedKeysDigest: 'digest-1',
            }
          },
        },
      },
      { now: Date.UTC(2026, 7, 3), limit: 25 },
    )

    expect(operations).toEqual([
      'storage:candidate/share-1/preview.html',
      'complete:provider-delete-1',
    ])
    expect(queue.complete).toHaveBeenCalledWith({
      shareId: 'share-1',
      claimToken: 'claim-1',
      receiptId: 'receipt-1',
      providerReceipt: 'provider-delete-1',
      deletedKeysDigest: 'digest-1',
      completedAt: Date.UTC(2026, 7, 3),
    })
    expect(result).toEqual({ claimed: 1, completed: ['share-1'], failed: [] })
  })

  it('never records DB completion when Storage deletion fails', async () => {
    const complete = vi.fn()

    const result = await runCandidateCleanupWorker(
      {
        queue: {
          claimDue: async () => [
            {
              shareId: 'share-2',
              claimToken: 'claim-2',
              storageKeys: ['candidate/share-2/preview.html'],
            },
          ],
          complete,
        },
        storage: {
          deleteObjects: async () => {
            throw new Error('storage_unavailable')
          },
        },
      },
      { now: Date.UTC(2026, 7, 3), limit: 25 },
    )

    expect(complete).not.toHaveBeenCalled()
    expect(result).toEqual({ claimed: 1, completed: [], failed: ['share-2'] })
  })
})
