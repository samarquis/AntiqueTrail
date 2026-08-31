export const MEDIA_MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MEDIA_MAX_DERIVATIVE_BYTES = 4 * 1024 * 1024
export const MEDIA_MAX_DIMENSION = 8192
export const MEDIA_MAX_PIXELS = 40_000_000

export type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp'

export interface MediaInspection {
  mime: MediaMime
  width: number
  height: number
  bytes: number
}

export interface MediaIngestInput {
  bytes: Uint8Array
  claimedMime: string
  storeId: string
  kind: 'cover' | 'gallery'
  altText: string
  idempotencyKey: string
  rightsConfirmed: boolean
  originalUploadId?: string
}

interface ReservedUpload {
  uploadId: string
  originalObjectKey: string
  derivativeObjectKey: string
}

interface ProcessedImage {
  bytes: Uint8Array
  mime: string
  width: number
  height: number
  metadataStripped: boolean
  reencoded: boolean
  operationId: string
}

export interface MediaPipelineDependencies {
  reserve(input: {
    storeId: string
    kind: 'cover' | 'gallery'
    altText: string
    idempotencyKey: string
    rightsConfirmed: boolean
    originalUploadId?: string
    inspection: MediaInspection
  }): Promise<ReservedUpload>
  putPrivate(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  scan(input: {
    uploadId: string
    objectKey: string
    bytes: Uint8Array
  }): Promise<{ outcome: 'clean' | 'malicious' | 'unknown'; operationId?: string }>
  reencode(input: {
    uploadId: string
    objectKey: string
    bytes: Uint8Array
    outputMime: 'image/webp'
    maxWidth: number
    maxHeight: number
    maxPixels: number
  }): Promise<ProcessedImage>
  recordQuarantined(input: {
    uploadId: string
    outcome: 'malicious' | 'unknown' | 'processing_failed'
  }): Promise<void>
  recordProcessed(input: {
    uploadId: string
    derivativeObjectKey: string
    derivativeDigest: string
    derivativeBytes: number
    width: number
    height: number
    scanOperationId: string
    processorOperationId: string
    metadataStripped: true
    reencoded: true
  }): Promise<void>
  claimPublish(jobId: string): Promise<{
    uploadId: string
    privateDerivativeKey: string
    publicDerivativeKey: string
  }>
  getPrivate(key: string): Promise<Uint8Array>
  putPublic(
    key: string,
    bytes: Uint8Array,
    options: { cacheControl: '31536000'; contentType: 'image/webp'; upsert: false },
  ): Promise<void>
  completePublish(jobId: string, uploadId: string, publicKey: string): Promise<void>
  claimPurge(jobId: string): Promise<{
    uploadId: string
    privateKeys: string[]
    publicKeys: string[]
  }>
  deletePrivate(key: string): Promise<void>
  deletePublic(key: string): Promise<void>
  completePurge(jobId: string, uploadId: string): Promise<void>
}

export class MediaPipelineError extends Error {
  constructor() {
    super('media_unavailable')
    this.name = 'MediaPipelineError'
  }
}

function unavailable(): never {
  throw new MediaPipelineError()
}

function boundedDimensions(width: number, height: number): { width: number; height: number } {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MEDIA_MAX_DIMENSION ||
    height > MEDIA_MAX_DIMENSION ||
    width * height > MEDIA_MAX_PIXELS
  )
    unavailable()
  return { width, height }
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR')
    unavailable()
  return boundedDimensions(view.getUint32(16), view.getUint32(20))
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return
  const sof = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ])
  let offset = 2
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= bytes.length) unavailable()
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) unavailable()
    if (sof.has(marker)) {
      if (length < 7) unavailable()
      return boundedDimensions(
        (bytes[offset + 5] << 8) | bytes[offset + 6],
        (bytes[offset + 3] << 8) | bytes[offset + 4],
      )
    }
    offset += length
  }
  unavailable()
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (
    bytes.length < 20 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP'
  )
    return
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(4, true) + 8 !== bytes.byteLength) unavailable()
  const chunk = String.fromCharCode(...bytes.slice(12, 16))
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    return boundedDimensions(width, height)
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8)
    const height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
    return boundedDimensions(width, height)
  }
  if (chunk === 'VP8 ') {
    for (let offset = 20; offset + 6 < bytes.length; offset += 1) {
      if (bytes[offset] === 0x9d && bytes[offset + 1] === 0x01 && bytes[offset + 2] === 0x2a) {
        const width = (bytes[offset + 3] | (bytes[offset + 4] << 8)) & 0x3fff
        const height = (bytes[offset + 5] | (bytes[offset + 6] << 8)) & 0x3fff
        return boundedDimensions(width, height)
      }
    }
  }
  unavailable()
}

export function inspectMediaUpload(bytes: Uint8Array, claimedMime: string): MediaInspection {
  if (bytes.byteLength < 20 || bytes.byteLength > MEDIA_MAX_IMAGE_BYTES) unavailable()
  const png = pngDimensions(bytes)
  const jpeg = png ? undefined : jpegDimensions(bytes)
  const webp = png || jpeg ? undefined : webpDimensions(bytes)
  const detected = png
    ? { mime: 'image/png' as const, ...png }
    : jpeg
      ? { mime: 'image/jpeg' as const, ...jpeg }
      : webp
        ? { mime: 'image/webp' as const, ...webp }
        : undefined
  if (!detected || detected.mime !== claimedMime.trim().toLowerCase()) unavailable()
  return { ...detected, bytes: bytes.byteLength }
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function validInput(input: MediaIngestInput): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
  return (
    uuid.test(input.storeId) &&
    uuid.test(input.idempotencyKey) &&
    (input.originalUploadId === undefined || uuid.test(input.originalUploadId)) &&
    input.altText === input.altText.trim() &&
    input.altText.length >= 1 &&
    input.altText.length <= 240 &&
    input.rightsConfirmed
  )
}

export async function runMediaIngest(
  input: MediaIngestInput,
  dependencies: MediaPipelineDependencies,
): Promise<{ state: 'awaiting_review' }> {
  try {
    if (!validInput(input)) unavailable()
    const inspection = inspectMediaUpload(input.bytes, input.claimedMime)
    const reserved = await dependencies.reserve({
      storeId: input.storeId,
      kind: input.kind,
      altText: input.altText,
      idempotencyKey: input.idempotencyKey,
      rightsConfirmed: input.rightsConfirmed,
      originalUploadId: input.originalUploadId,
      inspection,
    })
    await dependencies.putPrivate(reserved.originalObjectKey, input.bytes, inspection.mime)

    let scan: Awaited<ReturnType<MediaPipelineDependencies['scan']>>
    try {
      scan = await dependencies.scan({
        uploadId: reserved.uploadId,
        objectKey: reserved.originalObjectKey,
        bytes: input.bytes,
      })
    } catch {
      await dependencies.recordQuarantined({ uploadId: reserved.uploadId, outcome: 'unknown' })
      unavailable()
    }
    if (scan.outcome !== 'clean' || !scan.operationId) {
      await dependencies.recordQuarantined({
        uploadId: reserved.uploadId,
        outcome: scan.outcome === 'malicious' ? 'malicious' : 'unknown',
      })
      unavailable()
    }

    let processed: ProcessedImage
    try {
      processed = await dependencies.reencode({
        uploadId: reserved.uploadId,
        objectKey: reserved.originalObjectKey,
        bytes: input.bytes,
        outputMime: 'image/webp',
        maxWidth: MEDIA_MAX_DIMENSION,
        maxHeight: MEDIA_MAX_DIMENSION,
        maxPixels: MEDIA_MAX_PIXELS,
      })
    } catch {
      await dependencies.recordQuarantined({
        uploadId: reserved.uploadId,
        outcome: 'processing_failed',
      })
      unavailable()
    }
    const derivative = inspectMediaUpload(processed.bytes, processed.mime)
    if (
      derivative.mime !== 'image/webp' ||
      derivative.bytes > MEDIA_MAX_DERIVATIVE_BYTES ||
      derivative.width !== processed.width ||
      derivative.height !== processed.height ||
      !processed.metadataStripped ||
      !processed.reencoded ||
      !processed.operationId
    ) {
      await dependencies.recordQuarantined({
        uploadId: reserved.uploadId,
        outcome: 'processing_failed',
      })
      unavailable()
    }
    await dependencies.putPrivate(reserved.derivativeObjectKey, processed.bytes, 'image/webp')
    await dependencies.recordProcessed({
      uploadId: reserved.uploadId,
      derivativeObjectKey: reserved.derivativeObjectKey,
      derivativeDigest: await digestHex(processed.bytes),
      derivativeBytes: derivative.bytes,
      width: derivative.width,
      height: derivative.height,
      scanOperationId: scan.operationId,
      processorOperationId: processed.operationId,
      metadataStripped: true,
      reencoded: true,
    })
    return { state: 'awaiting_review' }
  } catch (error) {
    if (error instanceof MediaPipelineError) throw error
    unavailable()
  }
}

const PRIVATE_KEY = /^quarantine\/[0-9a-f-]{36}\/(original|derivative\.webp)$/u
const PUBLIC_KEY = /^official\/[0-9a-f-]{36}\/v[1-9][0-9]*\/[a-f0-9]{16,64}\.webp$/u

export async function runMediaPublish(
  jobId: string,
  dependencies: MediaPipelineDependencies,
): Promise<{ state: 'published' }> {
  try {
    const claim = await dependencies.claimPublish(jobId)
    if (
      !PRIVATE_KEY.test(claim.privateDerivativeKey) ||
      !PUBLIC_KEY.test(claim.publicDerivativeKey)
    )
      unavailable()
    const bytes = await dependencies.getPrivate(claim.privateDerivativeKey)
    const inspection = inspectMediaUpload(bytes, 'image/webp')
    if (inspection.bytes > MEDIA_MAX_DERIVATIVE_BYTES) unavailable()
    await dependencies.putPublic(claim.publicDerivativeKey, bytes, {
      cacheControl: '31536000',
      contentType: 'image/webp',
      upsert: false,
    })
    await dependencies.completePublish(jobId, claim.uploadId, claim.publicDerivativeKey)
    return { state: 'published' }
  } catch (error) {
    if (error instanceof MediaPipelineError) throw error
    unavailable()
  }
}

export async function runMediaPurge(
  jobId: string,
  dependencies: MediaPipelineDependencies,
): Promise<{ state: 'purged' }> {
  try {
    const claim = await dependencies.claimPurge(jobId)
    if (
      claim.privateKeys.some((key) => !PRIVATE_KEY.test(key)) ||
      claim.publicKeys.some((key) => !PUBLIC_KEY.test(key))
    )
      unavailable()
    for (const key of claim.privateKeys) await dependencies.deletePrivate(key)
    for (const key of claim.publicKeys) await dependencies.deletePublic(key)
    await dependencies.completePurge(jobId, claim.uploadId)
    return { state: 'purged' }
  } catch (error) {
    if (error instanceof MediaPipelineError) throw error
    unavailable()
  }
}
