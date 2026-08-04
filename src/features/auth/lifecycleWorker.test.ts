import { describe, expect, it, vi } from 'vitest'
import {
  runAccountLifecycleWorker,
  sha256,
  verifiedArchive,
  type AccountLifecycleWorkerDependencies,
} from '../../../supabase/functions/_shared/account-lifecycle'

function dependencies(
  overrides: Partial<AccountLifecycleWorkerDependencies> = {},
): AccountLifecycleWorkerDependencies {
  return {
    claimExports: vi.fn(async () => [
      { job_id: 'job-1', claim_token: 'claim-1', object_key: 'account-exports/a/job-1.json' },
    ]),
    buildExport: vi.fn(async () => '{"schemaVersion":1}'),
    putArchive: vi.fn(async () => undefined),
    completeExport: vi.fn(async () => undefined),
    failExport: vi.fn(async () => undefined),
    expireExports: vi.fn(async () => [{ job_id: 'old-1', object_key: 'old.json' }]),
    deleteArchive: vi.fn(async () => undefined),
    completeExportExpiry: vi.fn(async () => undefined),
    claimMemoryPurges: vi.fn(async () => [{ undo_token: 'undo-1', claim_token: 'memory-1' }]),
    completeMemoryPurge: vi.fn(async () => undefined),
    failMemoryPurge: vi.fn(async () => undefined),
    purgeDismissals: vi.fn(async () => 2),
    ...overrides,
  }
}

describe('account lifecycle worker', () => {
  it('uploads canonical bytes before recording their exact digest and completion', async () => {
    const boundary = dependencies()
    const summary = await runAccountLifecycleWorker(boundary, '2026-08-04T12:00:00Z')
    const expected = new TextEncoder().encode('{"schemaVersion":1}')
    expect(boundary.putArchive).toHaveBeenCalledWith('account-exports/a/job-1.json', expected)
    expect(boundary.completeExport).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        claimToken: 'claim-1',
        objectKey: 'account-exports/a/job-1.json',
        bytes: expected.byteLength,
        checksum: await sha256(expected),
      }),
    )
    expect(summary).toEqual({
      exportsClaimed: 1,
      exportsCompleted: 1,
      exportsFailed: 0,
      archivesExpired: 1,
      memoriesClaimed: 1,
      memoriesPurged: 1,
      memoriesFailed: 0,
      dismissalsPurged: 2,
    })
  })

  it('records retry-safe failures and leaves failed archive deletion retryable', async () => {
    const boundary = dependencies({
      putArchive: vi.fn(async () => {
        throw new Error('storage detail')
      }),
      deleteArchive: vi.fn(async () => {
        throw new Error('storage detail')
      }),
      completeMemoryPurge: vi.fn(async () => {
        throw new Error('database detail')
      }),
    })
    const summary = await runAccountLifecycleWorker(boundary, '2026-08-04T12:00:00Z')
    expect(boundary.failExport).toHaveBeenCalledWith('job-1', 'claim-1', '2026-08-04T12:00:00Z')
    expect(boundary.completeExport).not.toHaveBeenCalled()
    expect(boundary.completeExportExpiry).not.toHaveBeenCalled()
    expect(boundary.failMemoryPurge).toHaveBeenCalledWith(
      'undo-1',
      'memory-1',
      '2026-08-04T12:00:00Z',
    )
    expect(summary).toMatchObject({ exportsFailed: 1, archivesExpired: 0, memoriesFailed: 1 })
  })

  it('accepts only exact archive size and digest', async () => {
    const bytes = new TextEncoder().encode('{"private":true}')
    const checksum = [...(await sha256(bytes))]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    await expect(verifiedArchive(bytes, bytes.byteLength, checksum)).resolves.toBe(true)
    await expect(verifiedArchive(bytes, bytes.byteLength + 1, checksum)).resolves.toBe(false)
    await expect(verifiedArchive(bytes, bytes.byteLength, '0'.repeat(64))).resolves.toBe(false)
  })
})
