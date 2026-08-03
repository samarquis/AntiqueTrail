import type { Trip } from './types'

const DATABASE_NAME = 'antique-trail-private-trip-v1'
const RECORD_STORE = 'encrypted-trips'
const KEY_STORE = 'device-keys'
const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000

export interface OfflineMutation {
  idempotencyKey: string
  tripId: string
  baseVersion: number
  deviceId: string
  localSequence: number
  kind: string
  stopId?: string
  privateValue?: string
  conflictResolution?: 'phone'
}

export interface OfflineTripInput {
  accountId: string
  deviceId: string
  trip: Trip
  grantExpiresAt: string
  reauthorizeBy: string
  mutations: OfflineMutation[]
}

interface OfflineTripPayload extends OfflineTripInput {
  lastObservedAt: string
}

export interface EncryptedOfflineRecord {
  id: string
  tripId: string
  installId: string
  accountBinding: string
  iv: ArrayBuffer
  ciphertext: ArrayBuffer
}

export interface OfflineTripDatabase {
  getRecord(id: string): Promise<EncryptedOfflineRecord | undefined>
  putRecord(record: EncryptedOfflineRecord): Promise<void>
  deleteRecord(id: string): Promise<void>
  listRecords(): Promise<EncryptedOfflineRecord[]>
  getKey(id: string): Promise<CryptoKey | undefined>
  putKey(id: string, key: CryptoKey): Promise<void>
  deleteKey(id: string): Promise<void>
}

export class InMemoryOfflineDatabase implements OfflineTripDatabase {
  readonly records = new Map<string, EncryptedOfflineRecord>()
  readonly keys = new Map<string, CryptoKey>()

  async getRecord(id: string) {
    return this.records.get(id)
  }
  async putRecord(record: EncryptedOfflineRecord) {
    this.records.set(record.id, record)
  }
  async deleteRecord(id: string) {
    this.records.delete(id)
  }
  async listRecords() {
    return [...this.records.values()]
  }
  async getKey(id: string) {
    return this.keys.get(id)
  }
  async putKey(id: string, key: CryptoKey) {
    this.keys.set(id, key)
  }
  async deleteKey(id: string) {
    this.keys.delete(id)
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

export class IndexedDbOfflineDatabase implements OfflineTripDatabase {
  private databasePromise?: Promise<IDBDatabase>

  private database(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains(RECORD_STORE))
            database.createObjectStore(RECORD_STORE, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'))
      })
    }
    return this.databasePromise
  }

  private async store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.database()).transaction(name, mode).objectStore(name)
  }

  async getRecord(id: string) {
    return requestResult<EncryptedOfflineRecord | undefined>(
      (await this.store(RECORD_STORE, 'readonly')).get(id),
    )
  }
  async putRecord(record: EncryptedOfflineRecord) {
    await requestResult((await this.store(RECORD_STORE, 'readwrite')).put(record))
  }
  async deleteRecord(id: string) {
    await requestResult((await this.store(RECORD_STORE, 'readwrite')).delete(id))
  }
  async listRecords() {
    return requestResult<EncryptedOfflineRecord[]>(
      (await this.store(RECORD_STORE, 'readonly')).getAll(),
    )
  }
  async getKey(id: string) {
    return requestResult<CryptoKey | undefined>((await this.store(KEY_STORE, 'readonly')).get(id))
  }
  async putKey(id: string, key: CryptoKey) {
    await requestResult((await this.store(KEY_STORE, 'readwrite')).put(key, id))
  }
  async deleteKey(id: string) {
    await requestResult((await this.store(KEY_STORE, 'readwrite')).delete(id))
  }
}

export type OfflineRestoreResult =
  | { state: 'absent' | 'account_mismatch' }
  | { state: 'available'; trip: Trip; pendingCount: number }
  | { state: 'locked_pending_sync'; pendingCount: number; reason: 'expired' | 'clock_rollback' }

export type ReplaySubmissionResult =
  | { state: 'accepted'; trip: Trip }
  | { state: 'duplicate'; trip: Trip }
  | { state: 'conflict'; summary: string }
  | { state: 'unauthorized' }

export type OfflineReplayResult =
  | { state: 'empty'; pendingCount: 0; trip: Trip }
  | {
      state: 'conflict'
      pendingCount: number
      conflict: { mutation: OfflineMutation; summary: string }
    }
  | { state: 'purged'; pendingCount: 0; purgeReason: 'authorization_lost' }

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function recordId(installId: string, tripId: string): string {
  return `${installId}:${tripId}`
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', text(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export class EncryptedTripOfflineStore {
  constructor(
    private readonly database: OfflineTripDatabase = new IndexedDbOfflineDatabase(),
    private readonly installId: string,
  ) {}

  private async binding(accountId: string) {
    return sha256(`${this.installId}\u0000${accountId}`)
  }

  private keyId(accountBinding: string) {
    return `${this.installId}:${accountBinding}`
  }

  private async key(accountBinding: string): Promise<CryptoKey> {
    const id = this.keyId(accountBinding)
    const existing = await this.database.getKey(id)
    if (existing) return existing
    const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
    await this.database.putKey(id, generated)
    return generated
  }

  private aad(record: Pick<EncryptedOfflineRecord, 'installId' | 'tripId' | 'accountBinding'>) {
    return text(`${record.installId}\u0000${record.tripId}\u0000${record.accountBinding}`)
  }

  private async encrypt(payload: OfflineTripPayload): Promise<EncryptedOfflineRecord> {
    const accountBinding = await this.binding(payload.accountId)
    const metadata = {
      id: recordId(this.installId, payload.trip.id),
      tripId: payload.trip.id,
      installId: this.installId,
      accountBinding,
    }
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: this.aad(metadata) },
      await this.key(accountBinding),
      text(JSON.stringify(payload)),
    )
    return { ...metadata, iv: iv.buffer, ciphertext }
  }

  private async decrypt(record: EncryptedOfflineRecord): Promise<OfflineTripPayload> {
    const key = await this.database.getKey(this.keyId(record.accountBinding))
    if (!key) throw new Error('Offline key unavailable.')
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(record.iv),
        additionalData: this.aad(record),
      },
      key,
      record.ciphertext,
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as OfflineTripPayload
  }

  private async write(payload: OfflineTripPayload) {
    await this.database.putRecord(await this.encrypt(payload))
  }

  private async purgeTrip(payload: OfflineTripPayload) {
    const binding = await this.binding(payload.accountId)
    await this.database.deleteRecord(recordId(this.installId, payload.trip.id))
    const stillUsed = (await this.database.listRecords()).some(
      (record) => record.installId === this.installId && record.accountBinding === binding,
    )
    if (!stillUsed) await this.database.deleteKey(this.keyId(binding))
  }

  async save(input: OfflineTripInput): Promise<void> {
    const keys = new Set<string>()
    const sequences = new Set<number>()
    for (const mutation of input.mutations) {
      if (mutation.tripId !== input.trip.id)
        throw new Error('Offline mutation belongs to another trip.')
      if (mutation.deviceId !== input.deviceId)
        throw new Error('Offline mutation does not match the active Navigator device.')
      if (keys.has(mutation.idempotencyKey) || sequences.has(mutation.localSequence))
        throw new Error('Offline mutation identity or sequence is duplicated.')
      keys.add(mutation.idempotencyKey)
      sequences.add(mutation.localSequence)
    }
    const mutations = [...input.mutations].sort(
      (left, right) => left.localSequence - right.localSequence,
    )
    await this.write({ ...input, mutations, lastObservedAt: new Date().toISOString() })
  }

  private async payload(
    accountId: string,
    tripId: string,
  ): Promise<OfflineTripPayload | undefined> {
    const record = await this.database.getRecord(recordId(this.installId, tripId))
    if (!record || record.accountBinding !== (await this.binding(accountId))) return undefined
    return this.decrypt(record)
  }

  async restore(
    accountId: string,
    tripId: string,
    now = new Date(),
  ): Promise<OfflineRestoreResult> {
    const record = await this.database.getRecord(recordId(this.installId, tripId))
    if (!record) return { state: 'absent' }
    if (record.accountBinding !== (await this.binding(accountId)))
      return { state: 'account_mismatch' }
    const payload = await this.decrypt(record)
    if (now.getTime() > new Date(payload.reauthorizeBy).getTime()) {
      await this.purgeAccount(accountId, 'expired')
      return { state: 'absent' }
    }
    const pendingCount = payload.mutations.length
    if (new Date(payload.lastObservedAt).getTime() - now.getTime() > CLOCK_ROLLBACK_TOLERANCE_MS)
      return { state: 'locked_pending_sync', pendingCount, reason: 'clock_rollback' }
    if (now.getTime() > new Date(payload.grantExpiresAt).getTime())
      return { state: 'locked_pending_sync', pendingCount, reason: 'expired' }
    payload.lastObservedAt = now.toISOString()
    await this.write(payload)
    return { state: 'available', trip: payload.trip, pendingCount }
  }

  async replay(
    accountId: string,
    tripId: string,
    submit: (mutation: OfflineMutation) => Promise<ReplaySubmissionResult>,
  ): Promise<OfflineReplayResult> {
    const payload = await this.payload(accountId, tripId)
    if (!payload) return { state: 'purged', pendingCount: 0, purgeReason: 'authorization_lost' }
    payload.mutations.sort((left, right) => left.localSequence - right.localSequence)
    while (payload.mutations.length) {
      const mutation = payload.mutations[0]
      const result = await submit(mutation)
      if (result.state === 'unauthorized') {
        await this.purgeAccount(accountId, 'authorization_lost')
        return { state: 'purged', pendingCount: 0, purgeReason: 'authorization_lost' }
      }
      if (result.state === 'conflict') {
        await this.write(payload)
        return {
          state: 'conflict',
          pendingCount: payload.mutations.length,
          conflict: { mutation, summary: result.summary },
        }
      }
      payload.trip = result.trip
      payload.mutations.shift()
      if (payload.mutations.length === 0 && payload.trip.state === 'completed') {
        await this.purgeTrip(payload)
        return { state: 'empty', pendingCount: 0, trip: payload.trip }
      }
      await this.write(payload)
    }
    return { state: 'empty', pendingCount: 0, trip: payload.trip }
  }

  async resolveConflict(
    accountId: string,
    tripId: string,
    choice: 'phone' | 'saved',
  ): Promise<void> {
    const payload = await this.payload(accountId, tripId)
    if (!payload || payload.mutations.length === 0) return
    if (choice === 'saved') payload.mutations.shift()
    else payload.mutations[0] = { ...payload.mutations[0], conflictResolution: 'phone' }
    await this.write(payload)
  }

  async prepareLogout(accountId: string): Promise<{
    requiresConfirmation: boolean
    pendingCount: number
  }> {
    const binding = await this.binding(accountId)
    let pendingCount = 0
    for (const record of await this.database.listRecords()) {
      if (record.installId !== this.installId || record.accountBinding !== binding) continue
      pendingCount += (await this.decrypt(record)).mutations.length
    }
    return { requiresConfirmation: pendingCount > 0, pendingCount }
  }

  async purgeAccount(
    accountId: string,
    reason: 'confirmed_logout' | 'account_switch' | 'authorization_lost' | 'expired',
  ): Promise<void> {
    void reason
    const binding = await this.binding(accountId)
    for (const record of await this.database.listRecords()) {
      if (record.installId === this.installId && record.accountBinding === binding)
        await this.database.deleteRecord(record.id)
    }
    await this.database.deleteKey(this.keyId(binding))
  }
}
