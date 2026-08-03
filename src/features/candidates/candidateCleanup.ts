const PAYLOAD_CLEANUP_WINDOW_MS = 24 * 60 * 60 * 1_000

export type CandidatePayloadState = 'pending' | 'accepted' | 'closed'

export interface CandidatePayloadCleanupItem {
  shareId: string
  state: CandidatePayloadState
  expiresAt: number
  cleanupDueAt: number
  storageKeys: readonly string[]
}

/**
 * Server-side cleanup adapter. listDue must claim rows so overlapping workers
 * cannot process the same row; delete methods must be idempotent for retries.
 */
export interface CandidatePayloadCleanupRepository {
  listDue(input: { now: number; limit: number }): Promise<readonly CandidatePayloadCleanupItem[]>
  deleteStorageObjects(keys: readonly string[]): Promise<void>
  deleteEncryptedPayload(shareId: string): Promise<void>
  markComplete(shareId: string, completedAt: number): Promise<void>
}

export interface CandidatePayloadCleanupResult {
  examined: number
  cleaned: string[]
  skipped: string[]
}

/** The scheduler persists this deadline when a pending share is created. */
export function cleanupDeadlineFor(expiresAt: number): number {
  assertTimestamp(expiresAt)
  return expiresAt + PAYLOAD_CLEANUP_WINDOW_MS
}

/**
 * Provider-neutral scheduled-worker boundary. It has no Store/Event write
 * capability and deliberately ignores accepted shares so their Trip Ideas
 * remain recipient-owned.
 */
export async function runCandidatePayloadCleanup(
  repository: CandidatePayloadCleanupRepository,
  input: { now: number; limit: number },
): Promise<CandidatePayloadCleanupResult> {
  assertTimestamp(input.now)
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw new Error('candidate_cleanup_limit_invalid')
  }

  const items = await repository.listDue(input)
  const result: CandidatePayloadCleanupResult = {
    examined: items.length,
    cleaned: [],
    skipped: [],
  }

  for (const item of items) {
    assertCleanupItem(item)
    if (item.cleanupDueAt > cleanupDeadlineFor(item.expiresAt)) {
      throw new Error('candidate_cleanup_deadline_violation')
    }
    if (item.state !== 'pending' || item.expiresAt > input.now || item.cleanupDueAt > input.now) {
      result.skipped.push(item.shareId)
      continue
    }

    // Storage goes first: retries may safely repeat a missing-object delete,
    // while removing the payload first could orphan a private storage object.
    await repository.deleteStorageObjects(item.storageKeys)
    await repository.deleteEncryptedPayload(item.shareId)
    await repository.markComplete(item.shareId, input.now)
    result.cleaned.push(item.shareId)
  }
  return result
}

function assertCleanupItem(item: CandidatePayloadCleanupItem): void {
  if (!item.shareId || item.storageKeys.some((key) => !isCandidateStorageKey(item.shareId, key))) {
    throw new Error('candidate_cleanup_item_invalid')
  }
  assertTimestamp(item.expiresAt)
  assertTimestamp(item.cleanupDueAt)
}

function isCandidateStorageKey(shareId: string, key: string): boolean {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\')) return false
  return key.startsWith(`candidate/${shareId}/`)
}

function assertTimestamp(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error('candidate_cleanup_timestamp_invalid')
}
