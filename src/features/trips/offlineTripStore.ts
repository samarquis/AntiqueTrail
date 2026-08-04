import type { Trip } from './types'

const DATABASE_NAME = 'antique-trail-private-trip-v1'
const RECORD_STORE = 'encrypted-trips'
const KEY_STORE = 'device-keys'
const INSTALLATION_IDENTITY_KEY = 'trip-installation-identity-v1'
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
  trip: Trip
  grant: SignedOfflineGrant
  mutations: OfflineMutation[]
}

export interface OfflineGrantClaims {
  accountId: string
  tripId: string
  installId: string
  deviceId: string
  deviceKeyId: string
  sessionSecurityVersion: number
  issuedAt: string
  expiresAt: string
  reauthorizeBy: string
  nonce: string
}

export interface SignedOfflineGrant {
  keyId: string
  claims: OfflineGrantClaims
  signature: string
}

export interface OfflineGrantVerifier {
  verify(grant: SignedOfflineGrant): Promise<boolean>
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
  getInstallationIdentity(): Promise<TripInstallationIdentity | undefined>
  putInstallationIdentity(identity: TripInstallationIdentity): Promise<void>
}

export interface TripInstallationIdentity {
  installId: string
  deviceKeyId: string
  publicKeyJwk: JsonWebKey
}

export class InMemoryOfflineDatabase implements OfflineTripDatabase {
  readonly records = new Map<string, EncryptedOfflineRecord>()
  readonly keys = new Map<string, CryptoKey>()
  installationIdentity?: TripInstallationIdentity

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
  async getInstallationIdentity() {
    return this.installationIdentity
  }
  async putInstallationIdentity(identity: TripInstallationIdentity) {
    this.installationIdentity = identity
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
  async getInstallationIdentity() {
    return requestResult<TripInstallationIdentity | undefined>(
      (await this.store(KEY_STORE, 'readonly')).get(INSTALLATION_IDENTITY_KEY),
    )
  }
  async putInstallationIdentity(identity: TripInstallationIdentity) {
    await requestResult(
      (await this.store(KEY_STORE, 'readwrite')).put(identity, INSTALLATION_IDENTITY_KEY),
    )
  }
}

function validInstallationIdentity(value: TripInstallationIdentity | undefined): boolean {
  return Boolean(
    value &&
      /^install-[0-9a-f-]{36}$/u.test(value.installId) &&
      /^device-key-[A-Za-z0-9_-]{43}$/u.test(value.deviceKeyId) &&
      value.publicKeyJwk.kty === 'EC' &&
      value.publicKeyJwk.crv === 'P-256' &&
      value.publicKeyJwk.x &&
      value.publicKeyJwk.y,
  )
}

function base64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export async function tripDeviceKeyId(publicKey: JsonWebKey): Promise<string> {
  if (publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' || !publicKey.x || !publicKey.y)
    throw new Error('Invalid trip device public key.')
  const canonical = JSON.stringify({ crv: 'P-256', kty: 'EC', x: publicKey.x, y: publicKey.y })
  return `device-key-${base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))}`
}

export interface TripDeviceProof {
  issuedAt: string
  nonce: string
  signature: string
}

export async function signTripDeviceProof(
  database: OfflineTripDatabase,
  identity: TripInstallationIdentity,
  purpose: 'grant-v1' | 'go-v1',
  fields: readonly (string | number)[],
): Promise<TripDeviceProof> {
  const privateKey = await database.getKey(identity.deviceKeyId)
  if (!privateKey || privateKey.extractable || privateKey.type !== 'private')
    throw new Error('Trip device key unavailable.')
  const issuedAt = new Date().toISOString()
  const nonce = crypto.randomUUID()
  const bytes = new TextEncoder().encode(
    JSON.stringify([purpose, ...fields, identity.deviceKeyId, issuedAt, nonce]),
  )
  return {
    issuedAt,
    nonce,
    signature: base64Url(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes),
    ),
  }
}

/** Loads one installation identity whose key id resolves to a non-extractable persisted key. */
export async function loadOrCreateTripInstallationIdentity(
  database: OfflineTripDatabase,
): Promise<TripInstallationIdentity> {
  const existing = await database.getInstallationIdentity()
  if (validInstallationIdentity(existing)) {
    const key = await database.getKey(existing!.deviceKeyId)
    if (
      key &&
      !key.extractable &&
      key.type === 'private' &&
      (await tripDeviceKeyId(existing!.publicKeyJwk)) === existing!.deviceKeyId
    )
      return existing!
  }
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const identity = {
    installId: `install-${crypto.randomUUID()}`,
    deviceKeyId: await tripDeviceKeyId(publicKeyJwk),
    publicKeyJwk,
  }
  await database.putKey(identity.deviceKeyId, pair.privateKey)
  await database.putInstallationIdentity(identity)
  return identity
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

export function offlineGrantBytes(claims: OfflineGrantClaims): Uint8Array {
  return text(
    JSON.stringify([
      claims.accountId,
      claims.tripId,
      claims.installId,
      claims.deviceId,
      claims.deviceKeyId,
      claims.sessionSecurityVersion,
      claims.issuedAt,
      claims.expiresAt,
      claims.reauthorizeBy,
      claims.nonce,
    ]),
  )
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid offline grant signature.')
  const padded = value
    .replace(/-/gu, '+')
    .replace(/_/gu, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export class WebCryptoOfflineGrantVerifier implements OfflineGrantVerifier {
  constructor(private readonly publicKeys: ReadonlyMap<string, CryptoKey>) {}

  async verify(grant: SignedOfflineGrant): Promise<boolean> {
    const key = this.publicKeys.get(grant.keyId)
    if (!key) return false
    try {
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        decodeBase64Url(grant.signature),
        offlineGrantBytes(grant.claims),
      )
    } catch {
      return false
    }
  }
}

class RejectOfflineGrantVerifier implements OfflineGrantVerifier {
  async verify() {
    return false
  }
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
    private readonly grantVerifier: OfflineGrantVerifier = new RejectOfflineGrantVerifier(),
    private readonly deviceKeyId: string = installId,
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
    const accountBinding = await this.binding(payload.grant.claims.accountId)
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
    const binding = await this.binding(payload.grant.claims.accountId)
    await this.database.deleteRecord(recordId(this.installId, payload.trip.id))
    const stillUsed = (await this.database.listRecords()).some(
      (record) => record.installId === this.installId && record.accountBinding === binding,
    )
    if (!stillUsed) await this.database.deleteKey(this.keyId(binding))
  }

  async save(input: OfflineTripInput): Promise<void> {
    const claims = input.grant.claims
    const issuedAt = Date.parse(claims.issuedAt)
    const expiresAt = Date.parse(claims.expiresAt)
    const reauthorizeBy = Date.parse(claims.reauthorizeBy)
    const maximumGrantMs = 36 * 60 * 60 * 1000
    const maximumReauthorizationMs = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()
    if (
      !(await this.grantVerifier.verify(input.grant)) ||
      claims.accountId.length < 1 ||
      claims.tripId !== input.trip.id ||
      claims.installId !== this.installId ||
      claims.deviceId.length < 1 ||
      claims.deviceKeyId !== this.deviceKeyId ||
      !Number.isInteger(claims.sessionSecurityVersion) ||
      claims.sessionSecurityVersion < 0 ||
      claims.nonce.length < 8 ||
      !Number.isFinite(issuedAt) ||
      !Number.isFinite(expiresAt) ||
      !Number.isFinite(reauthorizeBy) ||
      issuedAt > now + CLOCK_ROLLBACK_TOLERANCE_MS ||
      expiresAt <= now ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > maximumGrantMs ||
      reauthorizeBy < expiresAt ||
      reauthorizeBy - issuedAt > maximumReauthorizationMs
    )
      throw new Error('Offline grant verification failed.')
    const keys = new Set<string>()
    const sequences = new Set<number>()
    for (const mutation of input.mutations) {
      if (mutation.tripId !== input.trip.id)
        throw new Error('Offline mutation belongs to another trip.')
      if (mutation.deviceId !== claims.deviceId)
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
    const payload = await this.decrypt(record)
    if (!(await this.grantVerifier.verify(payload.grant))) return undefined
    return payload
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
    if (!(await this.grantVerifier.verify(payload.grant))) {
      await this.purgeAccount(accountId, 'authorization_lost')
      return { state: 'absent' }
    }
    if (now.getTime() > new Date(payload.grant.claims.reauthorizeBy).getTime()) {
      await this.purgeAccount(accountId, 'expired')
      return { state: 'absent' }
    }
    const pendingCount = payload.mutations.length
    if (new Date(payload.lastObservedAt).getTime() - now.getTime() > CLOCK_ROLLBACK_TOLERANCE_MS)
      return { state: 'locked_pending_sync', pendingCount, reason: 'clock_rollback' }
    if (now.getTime() > new Date(payload.grant.claims.expiresAt).getTime())
      return { state: 'locked_pending_sync', pendingCount, reason: 'expired' }
    payload.lastObservedAt = now.toISOString()
    await this.write(payload)
    return { state: 'available', trip: payload.trip, pendingCount }
  }

  async queueMutation(
    accountId: string,
    trip: Trip,
    action: Pick<OfflineMutation, 'kind' | 'stopId'>,
  ): Promise<{ trip: Trip; pendingCount: number }> {
    const payload = await this.payload(accountId, trip.id)
    if (!payload) throw new Error('Offline trip unavailable.')
    const restored = await this.restore(accountId, trip.id)
    if (restored.state !== 'available') throw new Error('Offline trip unavailable.')
    const localSequence =
      payload.mutations.reduce(
        (highest, mutation) => Math.max(highest, mutation.localSequence),
        0,
      ) + 1
    payload.trip = trip
    payload.mutations.push({
      idempotencyKey: `${payload.grant.claims.deviceId}:${crypto.randomUUID()}`,
      tripId: trip.id,
      baseVersion: payload.trip.version,
      deviceId: payload.grant.claims.deviceId,
      localSequence,
      kind: action.kind,
      stopId: action.stopId,
    })
    payload.lastObservedAt = new Date().toISOString()
    await this.write(payload)
    return { trip, pendingCount: payload.mutations.length }
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

  async recordCompleted(accountId: string, trip: Trip): Promise<void> {
    if (trip.state !== 'completed') throw new Error('trip_not_completed')
    const payload = await this.payload(accountId, trip.id)
    if (!payload) return
    payload.trip = trip
    await this.purgeTrip(payload)
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
