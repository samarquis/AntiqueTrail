import { describe, expect, it, vi } from 'vitest'
import {
  inspectMediaUpload,
  MEDIA_MAX_IMAGE_BYTES,
  runMediaIngest,
  runMediaPublish,
  runMediaPurge,
  type MediaPipelineDependencies,
} from '../../../supabase/functions/_shared/media-pipeline'

function png(width = 640, height = 480, trailingBytes = 0): Uint8Array {
  const bytes = new Uint8Array(24 + trailingBytes)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function webp(width = 640, height = 480): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88], 0)
  const widthMinusOne = width - 1
  const heightMinusOne = height - 1
  bytes.set(
    [
      widthMinusOne & 255,
      (widthMinusOne >> 8) & 255,
      (widthMinusOne >> 16) & 255,
      heightMinusOne & 255,
      (heightMinusOne >> 8) & 255,
      (heightMinusOne >> 16) & 255,
    ],
    24,
  )
  return bytes
}

function dependencies(
  overrides: Partial<MediaPipelineDependencies> = {},
): MediaPipelineDependencies {
  return {
    reserve: vi.fn(async () => ({
      uploadId: '11111111-1111-4111-8111-111111111111',
      originalObjectKey: 'quarantine/11111111-1111-4111-8111-111111111111/original',
      derivativeObjectKey: 'quarantine/11111111-1111-4111-8111-111111111111/derivative.webp',
    })),
    putPrivate: vi.fn(async () => undefined),
    scan: vi.fn(async () => ({ outcome: 'clean' as const, operationId: 'scan-1' })),
    reencode: vi.fn(async () => ({
      bytes: webp(640, 480),
      mime: 'image/webp',
      width: 640,
      height: 480,
      metadataStripped: true,
      reencoded: true,
      operationId: 'decode-1',
    })),
    recordQuarantined: vi.fn(async () => undefined),
    recordProcessed: vi.fn(async () => undefined),
    claimPublish: vi.fn(async () => ({
      uploadId: '11111111-1111-4111-8111-111111111111',
      privateDerivativeKey: 'quarantine/11111111-1111-4111-8111-111111111111/derivative.webp',
      publicDerivativeKey: 'official/22222222-2222-4222-8222-222222222222/v1/aaaaaaaaaaaaaaaa.webp',
    })),
    getPrivate: vi.fn(async () => webp(640, 480)),
    putPublic: vi.fn(async () => undefined),
    completePublish: vi.fn(async () => undefined),
    claimPurge: vi.fn(async () => ({
      uploadId: '11111111-1111-4111-8111-111111111111',
      privateKeys: [
        'quarantine/11111111-1111-4111-8111-111111111111/original',
        'quarantine/11111111-1111-4111-8111-111111111111/derivative.webp',
      ],
      publicKeys: ['official/22222222-2222-4222-8222-222222222222/v1/aaaaaaaaaaaaaaaa.webp'],
    })),
    deletePrivate: vi.fn(async () => undefined),
    deletePublic: vi.fn(async () => undefined),
    completePurge: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('M-01 media pipeline boundary', () => {
  it('accepts only a claimed MIME that matches the file signature and bounded dimensions', () => {
    expect(inspectMediaUpload(png(), 'image/png')).toEqual({
      mime: 'image/png',
      width: 640,
      height: 480,
      bytes: 24,
    })
    expect(() => inspectMediaUpload(png(), 'image/jpeg')).toThrow('media_unavailable')
    expect(() => inspectMediaUpload(png(9000, 480), 'image/png')).toThrow('media_unavailable')
    expect(() => inspectMediaUpload(png(640, 480, MEDIA_MAX_IMAGE_BYTES), 'image/png')).toThrow(
      'media_unavailable',
    )
  })

  it('keeps a clean re-encoded derivative private for review', async () => {
    const boundary = dependencies()
    const result = await runMediaIngest(
      {
        bytes: png(),
        claimedMime: 'image/png',
        storeId: '22222222-2222-4222-8222-222222222222',
        kind: 'cover',
        altText: 'Front entrance of the antique store',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        rightsConfirmed: true,
      },
      boundary,
    )

    expect(result).toEqual({ state: 'awaiting_review' })
    expect(boundary.putPrivate).toHaveBeenCalledTimes(2)
    expect(boundary.putPublic).not.toHaveBeenCalled()
    expect(boundary.recordProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        scanOperationId: 'scan-1',
        processorOperationId: 'decode-1',
        metadataStripped: true,
        reencoded: true,
      }),
    )
  })

  it('forwards the rejected-original reference to the reserve dependency', async () => {
    const boundary = dependencies()
    const originalUploadId = '44444444-4444-4444-8444-444444444444'
    await runMediaIngest(
      {
        bytes: png(),
        claimedMime: 'image/png',
        storeId: '22222222-2222-4222-8222-222222222222',
        kind: 'cover',
        altText: 'Corrected storefront',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        rightsConfirmed: true,
        originalUploadId,
      },
      boundary,
    )
    expect(boundary.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: '22222222-2222-4222-8222-222222222222',
        originalUploadId,
      }),
    )
  })

  it('leaves the original quarantined when scanning is unavailable', async () => {
    const boundary = dependencies({
      scan: vi.fn(async () => ({ outcome: 'unknown' as const })),
    })

    await expect(
      runMediaIngest(
        {
          bytes: png(),
          claimedMime: 'image/png',
          storeId: '22222222-2222-4222-8222-222222222222',
          kind: 'gallery',
          altText: 'Interior display case',
          idempotencyKey: '33333333-3333-4333-8333-333333333333',
          rightsConfirmed: true,
        },
        boundary,
      ),
    ).rejects.toThrow('media_unavailable')
    expect(boundary.recordQuarantined).toHaveBeenCalled()
    expect(boundary.reencode).not.toHaveBeenCalled()
    expect(boundary.putPublic).not.toHaveBeenCalled()
  })

  it('rejects a processor result without stripping and re-encoding proof', async () => {
    const boundary = dependencies({
      reencode: vi.fn(async () => ({
        bytes: webp(),
        mime: 'image/webp',
        width: 640,
        height: 480,
        metadataStripped: false,
        reencoded: true,
        operationId: 'decode-1',
      })),
    })

    await expect(
      runMediaIngest(
        {
          bytes: png(),
          claimedMime: 'image/png',
          storeId: '22222222-2222-4222-8222-222222222222',
          kind: 'gallery',
          altText: 'Interior display case',
          idempotencyKey: '33333333-3333-4333-8333-333333333333',
          rightsConfirmed: true,
        },
        boundary,
      ),
    ).rejects.toThrow('media_unavailable')
    expect(boundary.recordProcessed).not.toHaveBeenCalled()
    expect(boundary.putPublic).not.toHaveBeenCalled()
  })

  it('publishes only an approved immutable derivative claim', async () => {
    const boundary = dependencies()
    await expect(runMediaPublish('job-1', boundary)).resolves.toEqual({ state: 'published' })
    expect(boundary.putPublic).toHaveBeenCalledWith(
      expect.stringMatching(/^official\/[0-9a-f-]+\/v1\/[a-f0-9]{16}\.webp$/u),
      expect.any(Uint8Array),
      { cacheControl: '31536000', contentType: 'image/webp', upsert: false },
    )
    expect(boundary.completePublish).toHaveBeenCalled()
  })

  it('completes purge only after private and public objects are deleted', async () => {
    const boundary = dependencies()
    await expect(runMediaPurge('job-1', boundary)).resolves.toEqual({ state: 'purged' })
    expect(boundary.deletePrivate).toHaveBeenCalledTimes(2)
    expect(boundary.deletePublic).toHaveBeenCalledTimes(1)
    expect(boundary.completePurge).toHaveBeenCalledTimes(1)

    const failed = dependencies({ deletePublic: vi.fn(async () => Promise.reject(new Error())) })
    await expect(runMediaPurge('job-1', failed)).rejects.toThrow('media_unavailable')
    expect(failed.completePurge).not.toHaveBeenCalled()
  })
})
