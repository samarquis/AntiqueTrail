/* Platform-neutral lifecycle orchestration. Edge entrypoints supply the RPC and Storage adapters. */

export interface ExportClaim {
  job_id: string
  claim_token: string
  object_key: string
}

export interface MemoryPurgeClaim {
  undo_token: string
  claim_token: string
}

export interface ExpiredArchive {
  job_id: string
  object_key: string
}

export interface AccountDeletionClaim {
  deletion_request_id: string
  claim_token: string
  user_id: string
  storage_objects: Array<{ bucket_id: string; object_key: string }>
}

export interface AccountLifecycleWorkerDependencies {
  claimExports(now: string, limit: number): Promise<ExportClaim[]>
  buildExport(jobId: string, claimToken: string): Promise<string>
  putArchive(objectKey: string, bytes: Uint8Array): Promise<void>
  completeExport(input: {
    jobId: string
    claimToken: string
    objectKey: string
    checksum: Uint8Array
    bytes: number
    completedAt: string
  }): Promise<void>
  failExport(jobId: string, claimToken: string, now: string): Promise<void>
  expireExports(now: string, limit: number): Promise<ExpiredArchive[]>
  deleteArchive(objectKey: string): Promise<void>
  completeExportExpiry(jobId: string, objectKey: string, completedAt: string): Promise<void>
  claimMemoryPurges(now: string, limit: number): Promise<MemoryPurgeClaim[]>
  completeMemoryPurge(undoToken: string, claimToken: string, completedAt: string): Promise<void>
  failMemoryPurge(undoToken: string, claimToken: string, now: string): Promise<void>
  purgeDismissals(now: string, limit: number): Promise<number>
  claimAccountDeletions(now: string, limit: number): Promise<AccountDeletionClaim[]>
  deleteAccountStorageObject(bucketId: string, objectKey: string): Promise<void>
  prepareAccountDeletion(requestId: string, claimToken: string, preparedAt: string): Promise<void>
  deleteProviderUser(userId: string): Promise<void>
  completeAccountDeletion(requestId: string, claimToken: string, completedAt: string): Promise<void>
  failAccountDeletion(
    requestId: string,
    claimToken: string,
    now: string,
    errorCode: string,
  ): Promise<void>
}

export interface AccountLifecycleRunSummary {
  exportsClaimed: number
  exportsCompleted: number
  exportsFailed: number
  archivesExpired: number
  memoriesClaimed: number
  memoriesPurged: number
  memoriesFailed: number
  dismissalsPurged: number
  accountsClaimed: number
  accountsDeleted: number
  accountsFailed: number
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function verifiedArchive(
  bytes: Uint8Array,
  expectedBytes: number,
  expectedChecksumHex: string,
): Promise<boolean> {
  if (bytes.byteLength !== expectedBytes || !/^[0-9a-f]{64}$/u.test(expectedChecksumHex))
    return false
  return hex(await sha256(bytes)) === expectedChecksumHex
}

export async function runAccountLifecycleWorker(
  dependencies: AccountLifecycleWorkerDependencies,
  now = new Date().toISOString(),
): Promise<AccountLifecycleRunSummary> {
  const summary: AccountLifecycleRunSummary = {
    exportsClaimed: 0,
    exportsCompleted: 0,
    exportsFailed: 0,
    archivesExpired: 0,
    memoriesClaimed: 0,
    memoriesPurged: 0,
    memoriesFailed: 0,
    dismissalsPurged: 0,
    accountsClaimed: 0,
    accountsDeleted: 0,
    accountsFailed: 0,
  }
  const encoder = new TextEncoder()
  const exports = await dependencies.claimExports(now, 10)
  summary.exportsClaimed = exports.length
  for (const claim of exports) {
    try {
      const archive = await dependencies.buildExport(claim.job_id, claim.claim_token)
      const bytes = encoder.encode(archive)
      const checksum = await sha256(bytes)
      await dependencies.putArchive(claim.object_key, bytes)
      await dependencies.completeExport({
        jobId: claim.job_id,
        claimToken: claim.claim_token,
        objectKey: claim.object_key,
        checksum,
        bytes: bytes.byteLength,
        completedAt: now,
      })
      summary.exportsCompleted += 1
    } catch {
      await dependencies.failExport(claim.job_id, claim.claim_token, now)
      summary.exportsFailed += 1
    }
  }

  for (const archive of await dependencies.expireExports(now, 25)) {
    try {
      await dependencies.deleteArchive(archive.object_key)
      await dependencies.completeExportExpiry(archive.job_id, archive.object_key, now)
      summary.archivesExpired += 1
    } catch {
      // The expired state already denies download. Leaving archive_deleted_at null
      // makes the same object retry on the next bounded run.
    }
  }

  const memories = await dependencies.claimMemoryPurges(now, 25)
  summary.memoriesClaimed = memories.length
  for (const claim of memories) {
    try {
      await dependencies.completeMemoryPurge(claim.undo_token, claim.claim_token, now)
      summary.memoriesPurged += 1
    } catch {
      await dependencies.failMemoryPurge(claim.undo_token, claim.claim_token, now)
      summary.memoriesFailed += 1
    }
  }
  summary.dismissalsPurged = await dependencies.purgeDismissals(now, 100)

  const accounts = await dependencies.claimAccountDeletions(now, 10)
  summary.accountsClaimed = accounts.length
  for (const claim of accounts) {
    try {
      for (const object of claim.storage_objects) {
        await dependencies.deleteAccountStorageObject(object.bucket_id, object.object_key)
      }
      await dependencies.prepareAccountDeletion(claim.deletion_request_id, claim.claim_token, now)
      await dependencies.deleteProviderUser(claim.user_id)
      await dependencies.completeAccountDeletion(claim.deletion_request_id, claim.claim_token, now)
      summary.accountsDeleted += 1
    } catch {
      await dependencies.failAccountDeletion(
        claim.deletion_request_id,
        claim.claim_token,
        now,
        'storage_or_provider_unavailable',
      )
      summary.accountsFailed += 1
    }
  }
  return summary
}
