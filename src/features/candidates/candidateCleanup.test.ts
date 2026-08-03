import { describe, expect, it } from 'vitest'
import {
  cleanupDeadlineFor,
  runCandidatePayloadCleanup,
  type CandidatePayloadCleanupItem,
} from './candidateCleanup'

const HOUR = 60 * 60 * 1_000

describe('candidate payload cleanup contract', () => {
  it('schedules expired, unaccepted payload cleanup no later than 24 hours after expiry', () => {
    const expiresAt = Date.UTC(2026, 7, 1, 12)
    expect(cleanupDeadlineFor(expiresAt)).toBe(Date.UTC(2026, 7, 2, 12))
  })

  it('deletes due pending payload and storage while retaining an accepted Trip Idea source', async () => {
    const now = Date.UTC(2026, 7, 3, 12)
    const pending = item({
      shareId: 'pending-share',
      expiresAt: now - 25 * HOUR,
      cleanupDueAt: now - HOUR,
      storageKeys: ['candidate/pending-share/preview.html'],
    })
    const accepted = item({
      shareId: 'accepted-share',
      state: 'accepted',
      expiresAt: now - 25 * HOUR,
      cleanupDueAt: now - HOUR,
      storageKeys: ['candidate/accepted-share/preview.html'],
    })
    const deletedStorage: string[] = []
    const deletedPayloads: string[] = []
    const completed: string[] = []

    const result = await runCandidatePayloadCleanup(
      {
        listDue: async () => [pending, accepted],
        deleteStorageObjects: async (keys) => {
          deletedStorage.push(...keys)
        },
        deleteEncryptedPayload: async (shareId) => {
          deletedPayloads.push(shareId)
        },
        markComplete: async (shareId) => {
          completed.push(shareId)
        },
      },
      { now, limit: 50 },
    )

    expect(result).toEqual({ examined: 2, cleaned: ['pending-share'], skipped: ['accepted-share'] })
    expect(deletedStorage).toEqual(['candidate/pending-share/preview.html'])
    expect(deletedPayloads).toEqual(['pending-share'])
    expect(completed).toEqual(['pending-share'])
  })

  it('fails the run when a repository returns a cleanup schedule outside the 24-hour contract', async () => {
    const now = Date.UTC(2026, 7, 3, 12)
    const expiresAt = now - 25 * HOUR

    await expect(
      runCandidatePayloadCleanup(
        {
          listDue: async () => [
            item({ shareId: 'late-share', expiresAt, cleanupDueAt: expiresAt + 25 * HOUR }),
          ],
          deleteStorageObjects: async () => undefined,
          deleteEncryptedPayload: async () => undefined,
          markComplete: async () => undefined,
        },
        { now, limit: 50 },
      ),
    ).rejects.toThrow('candidate_cleanup_deadline_violation')
  })

  it('defensively skips a pending payload that has not expired', async () => {
    const now = Date.UTC(2026, 7, 3, 12)
    const future = item({
      shareId: 'future-share',
      expiresAt: now + HOUR,
      cleanupDueAt: now + 25 * HOUR,
    })

    const result = await runCandidatePayloadCleanup(
      {
        listDue: async () => [future],
        deleteStorageObjects: async () => {
          throw new Error('future storage must remain')
        },
        deleteEncryptedPayload: async () => {
          throw new Error('future payload must remain')
        },
        markComplete: async () => {
          throw new Error('future cleanup must not complete')
        },
      },
      { now, limit: 50 },
    )

    expect(result).toEqual({ examined: 1, cleaned: [], skipped: ['future-share'] })
  })
})

function item(overrides: Partial<CandidatePayloadCleanupItem>): CandidatePayloadCleanupItem {
  return {
    shareId: 'share-1',
    state: 'pending',
    expiresAt: Date.UTC(2026, 7, 1),
    cleanupDueAt: Date.UTC(2026, 7, 2),
    storageKeys: [],
    ...overrides,
  }
}
