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
  getExportMedia(bucketId: string, objectKey: string, maxBytes: number): Promise<Uint8Array>
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

interface PortableExportSource {
  canonical: unknown
  media?: Array<{ bucketId: string; objectKey: string; path: string }>
}

interface ZipEntry {
  path: string
  bytes: Uint8Array
}

export const PORTABLE_EXPORT_MAX_MEDIA_FILES = 100
export const PORTABLE_EXPORT_MAX_FILE_BYTES = 8 * 1024 * 1024
export const PORTABLE_EXPORT_MAX_SOURCE_BYTES = 32 * 1024 * 1024

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

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 255, (value >>> 8) & 255)
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Deterministic, dependency-free ZIP writer using the portable STORE method. */
export function zip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    if (!/^[a-z0-9][a-z0-9._/-]{0,239}$/u.test(entry.path) || entry.path.includes('..'))
      throw new Error('unsafe_export_path')
    const name = encoder.encode(entry.path)
    const checksum = crc32(entry.bytes)
    const local = concat([
      Uint8Array.of(0x50, 0x4b, 0x03, 0x04),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(entry.bytes.byteLength),
      u32(entry.bytes.byteLength),
      u16(name.byteLength),
      u16(0),
      name,
      entry.bytes,
    ])
    localParts.push(local)
    centralParts.push(
      concat([
        Uint8Array.of(0x50, 0x4b, 0x01, 0x02),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(checksum),
        u32(entry.bytes.byteLength),
        u32(entry.bytes.byteLength),
        u16(name.byteLength),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    )
    offset += local.byteLength
  }
  const central = concat(centralParts)
  return concat([
    ...localParts,
    central,
    Uint8Array.of(0x50, 0x4b, 0x05, 0x06),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.byteLength),
    u32(offset),
    u16(0),
  ])
}

function csv(value: unknown): string {
  const rows = Array.isArray(value) ? value : []
  const keys = [
    ...new Set(rows.flatMap((row) => (row && typeof row === 'object' ? Object.keys(row) : []))),
  ].sort()
  const quote = (cell: unknown) => {
    const raw = String(cell ?? '')
    const safe = /^[=+\-@\t\r]/u.test(raw) ? `'${raw}` : raw
    return `"${safe.replaceAll('"', '""')}"`
  }
  return `${keys.map(quote).join(',')}\r\n${rows.map((row) => keys.map((key) => quote((row as Record<string, unknown>)[key])).join(',')).join('\r\n')}\r\n`
}

export async function buildPortableExport(
  raw: string,
  getMedia: (bucketId: string, objectKey: string, maxBytes: number) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  if (new TextEncoder().encode(raw).byteLength > PORTABLE_EXPORT_MAX_FILE_BYTES)
    throw new Error('account_export_canonical_too_large')
  const parsed = JSON.parse(raw) as PortableExportSource
  const canonical = Object.hasOwn(parsed, 'canonical') ? parsed.canonical : parsed
  const canonicalBytes = new TextEncoder().encode(JSON.stringify(canonical))
  const root =
    canonical && typeof canonical === 'object' ? (canonical as Record<string, unknown>) : {}
  const shopper =
    root.shopper && typeof root.shopper === 'object'
      ? (root.shopper as Record<string, unknown>)
      : {}
  const candidate =
    root.candidate && typeof root.candidate === 'object'
      ? (root.candidate as Record<string, unknown>)
      : {}
  const entries: ZipEntry[] = [{ path: 'user-data.json', bytes: canonicalBytes }]
  let sourceBytes = canonicalBytes.byteLength
  for (const [path, value] of [
    ['tables/saved-stores.csv', shopper.savedStores],
    ['tables/memories.csv', shopper.memories],
    ['tables/corrections.csv', shopper.corrections],
    ['tables/candidate-links.csv', candidate.links],
    ['tables/candidate-shares.csv', candidate.shares],
    ['tables/trip-ideas.csv', candidate.tripIdeas],
  ] as const) {
    const bytes = new TextEncoder().encode(csv(value))
    sourceBytes += bytes.byteLength
    if (sourceBytes > PORTABLE_EXPORT_MAX_SOURCE_BYTES)
      throw new Error('account_export_source_too_large')
    entries.push({ path, bytes })
  }
  const mediaFiles = parsed.media ?? []
  if (mediaFiles.length > PORTABLE_EXPORT_MAX_MEDIA_FILES)
    throw new Error('account_export_media_count_exceeded')
  for (const media of mediaFiles) {
    if (media.bucketId !== 'candidate-private' || !/^media\/[a-z0-9._/-]+$/u.test(media.path))
      throw new Error('unsafe_export_media')
    const remaining = PORTABLE_EXPORT_MAX_SOURCE_BYTES - sourceBytes
    if (remaining <= 0) throw new Error('account_export_source_too_large')
    const bytes = await getMedia(
      media.bucketId,
      media.objectKey,
      Math.min(PORTABLE_EXPORT_MAX_FILE_BYTES, remaining),
    )
    if (bytes.byteLength > PORTABLE_EXPORT_MAX_FILE_BYTES || bytes.byteLength > remaining)
      throw new Error('account_export_media_too_large')
    sourceBytes += bytes.byteLength
    entries.push({ path: media.path, bytes })
  }
  const manifestFiles = await Promise.all(
    entries.map(async (entry) => ({
      path: entry.path,
      bytes: entry.bytes.byteLength,
      sha256: hex(await sha256(entry.bytes)),
    })),
  )
  entries.push({
    path: 'manifest.json',
    bytes: new TextEncoder().encode(
      JSON.stringify({ schemaVersion: 1, algorithm: 'SHA-256', files: manifestFiles }),
    ),
  })
  return zip(entries)
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
  const exports = await dependencies.claimExports(now, 10)
  summary.exportsClaimed = exports.length
  for (const claim of exports) {
    try {
      const archive = await dependencies.buildExport(claim.job_id, claim.claim_token)
      const bytes = await buildPortableExport(archive, dependencies.getExportMedia)
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
