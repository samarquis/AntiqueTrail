export interface CandidateCleanupClaim {
  shareId: string
  claimToken: string
  storageKeys: readonly string[]
}

export interface CandidateStorageDeletionReceipt {
  receiptId: string
  providerReceipt: string
  deletedKeysDigest: string
}

export interface CandidateCleanupWorkerQueue {
  expireDue(input: { now: number; limit: number }): Promise<number>
  claimDue(input: { now: number; limit: number }): Promise<readonly CandidateCleanupClaim[]>
  complete(input: {
    shareId: string
    claimToken: string
    receiptId: string
    providerReceipt: string
    deletedKeysDigest: string
    completedAt: number
  }): Promise<void>
  fail(input: {
    shareId: string
    claimToken: string
    failedAt: number
    errorCode: 'storage_unavailable' | 'receipt_invalid' | 'completion_failed'
  }): Promise<'pending' | 'exhausted'>
}

export interface CandidateCleanupStorage {
  deleteObjects(keys: readonly string[]): Promise<CandidateStorageDeletionReceipt>
}

export async function runCandidateCleanupWorker(
  dependencies: { queue: CandidateCleanupWorkerQueue; storage: CandidateCleanupStorage },
  input: { now: number; limit: number },
): Promise<{ claimed: number; completed: string[]; failed: string[] }> {
  assertInput(input)
  const claims = await dependencies.queue.claimDue(input)
  const result = { claimed: claims.length, completed: [] as string[], failed: [] as string[] }

  for (const claim of claims) {
    try {
      assertClaim(claim)
      const receipt = await dependencies.storage.deleteObjects(claim.storageKeys)
      assertReceipt(receipt)
      await dependencies.queue.complete({
        shareId: claim.shareId,
        claimToken: claim.claimToken,
        receiptId: receipt.receiptId,
        providerReceipt: receipt.providerReceipt,
        deletedKeysDigest: receipt.deletedKeysDigest,
        completedAt: input.now,
      })
      result.completed.push(claim.shareId)
    } catch (error) {
      await dependencies.queue.fail({
        shareId: claim.shareId,
        claimToken: claim.claimToken,
        failedAt: input.now,
        errorCode: classifyFailure(error),
      })
      result.failed.push(claim.shareId)
    }
  }
  return result
}

export async function runCandidateCleanupCycle(
  dependencies: { queue: CandidateCleanupWorkerQueue; storage: CandidateCleanupStorage },
  input: { now: number; limit: number },
): Promise<{ expired: number; claimed: number; completed: string[]; failed: string[] }> {
  assertInput(input)
  const expired = await dependencies.queue.expireDue(input)
  const result = await runCandidateCleanupWorker(dependencies, input)
  return { expired, ...result }
}

function classifyFailure(
  error: unknown,
): 'storage_unavailable' | 'receipt_invalid' | 'completion_failed' {
  if (error instanceof Error && error.message === 'candidate_cleanup_receipt_invalid') {
    return 'receipt_invalid'
  }
  if (error instanceof Error && error.message === 'candidate_cleanup_completion_failed') {
    return 'completion_failed'
  }
  return 'storage_unavailable'
}

function assertInput(input: { now: number; limit: number }): void {
  if (!Number.isFinite(input.now) || input.now < 0)
    throw new Error('candidate_cleanup_time_invalid')
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw new Error('candidate_cleanup_limit_invalid')
  }
}

function assertClaim(claim: CandidateCleanupClaim): void {
  if (
    !claim.shareId ||
    !claim.claimToken ||
    claim.storageKeys.some(
      (key) =>
        !key.startsWith(`candidate/${claim.shareId}/`) ||
        key.startsWith('/') ||
        key.includes('..') ||
        key.includes('\\'),
    )
  ) {
    throw new Error('candidate_cleanup_claim_invalid')
  }
}

function assertReceipt(receipt: CandidateStorageDeletionReceipt): void {
  if (!receipt.receiptId || !receipt.providerReceipt || !receipt.deletedKeysDigest) {
    throw new Error('candidate_cleanup_receipt_invalid')
  }
}
