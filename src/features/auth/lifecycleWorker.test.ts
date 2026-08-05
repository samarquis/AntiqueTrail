import { describe, expect, it, vi } from 'vitest'
import {
  buildPortableExport,
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
    getExportMedia: vi.fn(async () => new Uint8Array()),
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
    runReviewLifecycle: vi.fn(async () => ({
      reviewsFinalized: 3,
      restrictionsExpired: 1,
      appealsExpired: 2,
    })),
    claimAccountDeletions: vi.fn(async () => [
      {
        deletion_request_id: 'delete-1',
        claim_token: 'delete-claim-1',
        user_id: 'user-1',
        storage_objects: [
          { bucket_id: 'account-exports', object_key: 'account-exports/user-1/export.json' },
          { bucket_id: 'candidate-private', object_key: 'candidate/share-1/image.jpg' },
        ],
      },
    ]),
    deleteAccountStorageObject: vi.fn(async () => undefined),
    prepareAccountDeletion: vi.fn(async () => undefined),
    deleteProviderUser: vi.fn(async () => undefined),
    completeAccountDeletion: vi.fn(async () => undefined),
    failAccountDeletion: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('account lifecycle worker', () => {
  it('uploads canonical bytes before recording their exact digest and completion', async () => {
    const boundary = dependencies()
    const summary = await runAccountLifecycleWorker(boundary, '2026-08-04T12:00:00Z')
    const expected = await buildPortableExport('{"schemaVersion":1}', boundary.getExportMedia)
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
      reviewsFinalized: 3,
      reviewRestrictionsExpired: 1,
      reviewAppealsExpired: 2,
      accountsClaimed: 1,
      accountsDeleted: 1,
      accountsFailed: 0,
    })
    expect(boundary.deleteAccountStorageObject).toHaveBeenNthCalledWith(
      1,
      'account-exports',
      'account-exports/user-1/export.json',
    )
    expect(boundary.deleteAccountStorageObject).toHaveBeenNthCalledWith(
      2,
      'candidate-private',
      'candidate/share-1/image.jpg',
    )
    expect(boundary.prepareAccountDeletion).toHaveBeenCalledWith(
      'delete-1',
      'delete-claim-1',
      '2026-08-04T12:00:00Z',
    )
    expect(boundary.deleteProviderUser).toHaveBeenCalledWith('user-1')
    expect(boundary.completeAccountDeletion).toHaveBeenCalledWith(
      'delete-1',
      'delete-claim-1',
      '2026-08-04T12:00:00Z',
    )
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

  it('leaves account deletion retryable when Storage or provider deletion fails', async () => {
    const storageFailure = dependencies({
      deleteAccountStorageObject: vi.fn(async () => {
        throw new Error('storage unavailable')
      }),
    })
    await expect(
      runAccountLifecycleWorker(storageFailure, '2026-08-04T12:00:00Z'),
    ).resolves.toMatchObject({ accountsDeleted: 0, accountsFailed: 1 })
    expect(storageFailure.prepareAccountDeletion).not.toHaveBeenCalled()
    expect(storageFailure.deleteProviderUser).not.toHaveBeenCalled()
    expect(storageFailure.completeAccountDeletion).not.toHaveBeenCalled()
    expect(storageFailure.failAccountDeletion).toHaveBeenCalledWith(
      'delete-1',
      'delete-claim-1',
      '2026-08-04T12:00:00Z',
      'storage_or_provider_unavailable',
    )

    const providerFailure = dependencies({
      deleteProviderUser: vi.fn(async () => {
        throw new Error('provider unavailable')
      }),
    })
    await runAccountLifecycleWorker(providerFailure, '2026-08-04T12:00:00Z')
    expect(providerFailure.prepareAccountDeletion).toHaveBeenCalled()
    expect(providerFailure.completeAccountDeletion).not.toHaveBeenCalled()
    expect(providerFailure.failAccountDeletion).toHaveBeenCalled()
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

  it('creates a ZIP with canonical JSON, convenience CSV, media, and a checksum manifest', async () => {
    const bytes = await buildPortableExport(
      JSON.stringify({
        canonical: {
          shopper: { savedStores: [{ name: 'Scott\'s "Shop"', note: '=cmd()' }] },
          candidate: {},
        },
        media: [
          {
            bucketId: 'candidate-private',
            objectKey: 'candidate/a/photo.jpg',
            path: 'media/a/photo.jpg',
          },
        ],
      }),
      async () => new Uint8Array([1, 2, 3]),
    )
    const text = new TextDecoder().decode(bytes)
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(text).toContain('user-data.json')
    expect(text).toContain('tables/saved-stores.csv')
    expect(text).toContain("'=cmd()")
    expect(text).toContain('media/a/photo.jpg')
    expect(text).toContain('manifest.json')
    expect(text).toContain('SHA-256')
  })

  it('fails before archiving an export that exceeds bounded media limits', async () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => ({
      bucketId: 'candidate-private',
      objectKey: `candidate/a/${index}.jpg`,
      path: `media/a/${index}.jpg`,
    }))
    const getMedia = vi.fn(async () => new Uint8Array())
    await expect(
      buildPortableExport(JSON.stringify({ canonical: {}, media: tooMany }), getMedia),
    ).rejects.toThrow('account_export_media_count_exceeded')
    expect(getMedia).not.toHaveBeenCalled()
  })
})
