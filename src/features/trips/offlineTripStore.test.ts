import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EncryptedTripOfflineStore,
  InMemoryOfflineDatabase,
  loadOrCreateTripInstallationIdentity,
  signTripDeviceProof,
  tripDeviceKeyId,
  WebCryptoOfflineGrantVerifier,
  offlineGrantBytes,
  type OfflineGrantClaims,
  type OfflineMutation,
  type OfflineTripInput,
} from './offlineTripStore'
import { verifyDeviceProof } from '../../../supabase/functions/_shared/trip-device-proof'
import type { Trip } from './types'

const activeTrip: Trip = {
  id: 'trip-1',
  name: 'Antique Day',
  localDate: '2026-08-10',
  state: 'active',
  version: 4,
  stops: [],
}

let privateKey: CryptoKey
let verifier: WebCryptoOfflineGrantVerifier

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])
  privateKey = pair.privateKey
  verifier = new WebCryptoOfflineGrantVerifier(new Map([['test-key-v1', pair.publicKey]]))
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

function base64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

async function signedInput(
  mutations: OfflineMutation[],
  overrides: Partial<OfflineGrantClaims> = {},
): Promise<OfflineTripInput> {
  const claims: OfflineGrantClaims = {
    accountId: 'shopper-a',
    tripId: 'trip-1',
    installId: 'install-a',
    deviceId: 'device-a',
    deviceKeyId: 'device-key-a',
    sessionSecurityVersion: 3,
    issuedAt: '2026-08-03T12:00:00.000Z',
    expiresAt: '2026-08-05T00:00:00.000Z',
    reauthorizeBy: '2026-08-10T12:00:00.000Z',
    nonce: 'grant-nonce-1',
    ...overrides,
  }
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    offlineGrantBytes(claims),
  )
  return {
    trip: activeTrip,
    grant: { keyId: 'test-key-v1', claims, signature: base64Url(signature) },
    mutations,
  }
}

function mutation(sequence: number): OfflineMutation {
  return {
    idempotencyKey: `device-a:${sequence}`,
    tripId: 'trip-1',
    baseVersion: 4,
    deviceId: 'device-a',
    localSequence: sequence,
    kind: 'mark_arrived',
    stopId: `stop-${sequence}`,
  }
}

function store(database = new InMemoryOfflineDatabase()) {
  return new EncryptedTripOfflineStore(database, 'install-a', verifier, 'device-key-a')
}

class PausedOfflineDatabase extends InMemoryOfflineDatabase {
  private pauseRead = false
  private notifyRead: () => void = () => {}
  private releaseRead: () => void = () => {}
  private readStarted: Promise<void> = Promise.resolve()
  private readGate: Promise<void> = Promise.resolve()

  pauseNextRead() {
    this.readStarted = new Promise((resolve) => {
      this.notifyRead = resolve
    })
    this.readGate = new Promise((resolve) => {
      this.releaseRead = resolve
    })
    this.pauseRead = true
    return { started: this.readStarted, release: () => this.releaseRead() }
  }

  override async getRecord(id: string) {
    const record = await super.getRecord(id)
    if (this.pauseRead) {
      this.pauseRead = false
      this.notifyRead()
      await this.readGate
    }
    return record
  }
}

describe('encrypted active-trip recovery', () => {
  it('creates different per-install identities and reloads the persisted non-extractable key', async () => {
    const firstDatabase = new InMemoryOfflineDatabase()
    const secondDatabase = new InMemoryOfflineDatabase()
    const first = await loadOrCreateTripInstallationIdentity(firstDatabase)
    const second = await loadOrCreateTripInstallationIdentity(secondDatabase)
    expect(first).not.toEqual(second)
    await expect(loadOrCreateTripInstallationIdentity(firstDatabase)).resolves.toEqual(first)
    const deviceKey = await firstDatabase.getKey(first.deviceKeyId)
    expect(deviceKey).toBeDefined()
    expect(deviceKey?.extractable).toBe(false)
    expect(deviceKey?.type).toBe('private')
    expect(deviceKey?.algorithm.name).toBe('ECDSA')
    await expect(tripDeviceKeyId(first.publicKeyJwk)).resolves.toBe(first.deviceKeyId)
  })

  it('rejects copied device labels and tampered proof while accepting the persisted key', async () => {
    const database = new InMemoryOfflineDatabase()
    const copiedDatabase = new InMemoryOfflineDatabase()
    const identity = await loadOrCreateTripInstallationIdentity(database)
    const copiedIdentity = await loadOrCreateTripInstallationIdentity(copiedDatabase)
    const fields = ['trip-1', identity.installId] as const
    const proof = await signTripDeviceProof(database, identity, 'grant-v1', fields)
    await expect(
      verifyDeviceProof({
        publicKey: identity.publicKeyJwk,
        deviceKeyId: identity.deviceKeyId,
        purpose: 'grant-v1',
        fields,
        ...proof,
        now: Date.parse(proof.issuedAt),
      }),
    ).resolves.toBe(true)
    await expect(
      verifyDeviceProof({
        publicKey: copiedIdentity.publicKeyJwk,
        deviceKeyId: identity.deviceKeyId,
        purpose: 'grant-v1',
        fields,
        ...proof,
        now: Date.parse(proof.issuedAt),
      }),
    ).resolves.toBe(false)
    await expect(
      verifyDeviceProof({
        publicKey: identity.publicKeyJwk,
        deviceKeyId: identity.deviceKeyId,
        purpose: 'grant-v1',
        fields: ['trip-tampered', identity.installId],
        ...proof,
        now: Date.parse(proof.issuedAt),
      }),
    ).resolves.toBe(false)
  })
  it('verifies the server signature and every account/trip/install/device grant binding', async () => {
    const database = new InMemoryOfflineDatabase()
    const offline = store(database)
    const signed = await signedInput([])
    await expect(offline.save(signed)).resolves.toBeUndefined()

    await expect(
      offline.save({
        ...signed,
        grant: { ...signed.grant, claims: { ...signed.grant.claims, accountId: 'shopper-b' } },
      }),
    ).rejects.toThrow(/offline grant/i)
    await expect(
      new EncryptedTripOfflineStore(database, 'other-install', verifier, 'device-key-a').save(
        signed,
      ),
    ).rejects.toThrow(/offline grant/i)
  })

  it('recovers the minimum trip snapshot after a cold restart only for the bound account', async () => {
    const database = new InMemoryOfflineDatabase()
    await store(database).save(await signedInput([mutation(1)]))

    const restarted = store(database)
    const recovered = await restarted.restore(
      'shopper-a',
      'trip-1',
      new Date('2026-08-04T12:00:00Z'),
    )
    expect(recovered).toMatchObject({ state: 'available', trip: activeTrip, pendingCount: 1 })
    expect(
      await restarted.restore('shopper-b', 'trip-1', new Date('2026-08-04T12:00:00Z')),
    ).toEqual({ state: 'account_mismatch' })
  })

  it('preserves queued mutation identities and stale base versions across repeated grant refreshes', async () => {
    const offline = store()
    const first = {
      ...mutation(1),
      privateValue: 'Private appointment note',
      conflictResolution: 'phone' as const,
    }
    const second = mutation(2)
    await offline.save(await signedInput([second, first]))
    const refreshedTrip = { ...activeTrip, version: 5 }
    const refreshed = {
      ...(await signedInput([], { nonce: 'grant-nonce-2', sessionSecurityVersion: 4 })),
      trip: refreshedTrip,
    }

    await offline.save(refreshed)
    await offline.save(refreshed)
    const seen: OfflineMutation[] = []
    const result = await offline.replay('shopper-a', 'trip-1', async (item) => {
      seen.push(item)
      return item.localSequence === 1
        ? { state: 'accepted', trip: refreshedTrip }
        : { state: 'conflict', summary: 'The retained mutation has a stale version.' }
    })

    expect(seen).toEqual([first, second])
    expect(seen.map((item) => item.baseVersion)).toEqual([4, 4])
    expect(result).toMatchObject({ state: 'conflict', pendingCount: 1 })
  })

  it('keeps the previous encrypted record when a refreshed account or device does not match', async () => {
    const database = new InMemoryOfflineDatabase()
    const offline = store(database)
    await offline.save(await signedInput([mutation(1)]))
    const previous = await database.getRecord('install-a:trip-1')

    await expect(
      offline.save(await signedInput([], { accountId: 'shopper-b', nonce: 'wrong-account' })),
    ).rejects.toThrow(/account/i)
    await expect(
      offline.save(await signedInput([], { deviceId: 'device-b', nonce: 'wrong-device' })),
    ).rejects.toThrow(/device/i)
    expect(await database.getRecord('install-a:trip-1')).toEqual(previous)

    const seen: OfflineMutation[] = []
    await offline.replay('shopper-a', 'trip-1', async (item) => {
      seen.push(item)
      return { state: 'conflict', summary: 'Keep the queued mutation.' }
    })
    expect(seen).toEqual([mutation(1)])
  })

  it('keeps unreadable existing ciphertext intact when a refreshed grant cannot be saved', async () => {
    const database = new InMemoryOfflineDatabase()
    const offline = store(database)
    await offline.save(await signedInput([mutation(1)]))
    const existing = await database.getRecord('install-a:trip-1')
    if (!existing) throw new Error('Expected the encrypted trip record.')
    const ciphertext = existing.ciphertext.slice(0)
    new Uint8Array(ciphertext)[0] ^= 1
    const unreadable = { ...existing, ciphertext }
    await database.putRecord(unreadable)

    await expect(offline.save(await signedInput([], { nonce: 'fresh-grant' }))).rejects.toThrow()
    expect(await database.getRecord('install-a:trip-1')).toEqual(unreadable)
  })

  it('serializes grant refresh with a concurrent queue write for the same store', async () => {
    const database = new PausedOfflineDatabase()
    const offline = store(database)
    await offline.save(await signedInput([mutation(1)]))
    const refreshedTrip = { ...activeTrip, version: 5 }
    const refreshed = {
      ...(await signedInput([], { nonce: 'grant-nonce-2', sessionSecurityVersion: 4 })),
      trip: refreshedTrip,
    }
    const gate = database.pauseNextRead()
    const starting = offline.save(refreshed)
    await gate.started
    const queueing = offline.queueMutation('shopper-a', refreshedTrip, {
      kind: 'mark_arrived',
      stopId: 'stop-2',
    })
    gate.release()
    await Promise.all([starting, queueing])

    const seen: OfflineMutation[] = []
    const result = await offline.replay('shopper-a', 'trip-1', async (item) => {
      seen.push(item)
      return item.localSequence === 1
        ? { state: 'accepted', trip: refreshedTrip }
        : { state: 'conflict', summary: 'Keep the newly queued mutation.' }
    })
    expect(seen).toHaveLength(2)
    expect(seen[0]).toEqual(mutation(1))
    expect(seen[1]).toMatchObject({
      tripId: 'trip-1',
      baseVersion: 5,
      deviceId: 'device-a',
      localSequence: 2,
      kind: 'mark_arrived',
      stopId: 'stop-2',
    })
    expect(seen[1].idempotencyKey).not.toBe(mutation(1).idempotencyKey)
    expect(result).toMatchObject({ state: 'conflict', pendingCount: 1 })
  })

  it('replays mutations once in sequence and preserves a stale private conflict for user choice', async () => {
    const offline = store()
    await offline.save(await signedInput([mutation(2), mutation(1)]))
    const seen: number[] = []
    const submit = vi.fn(async (item: OfflineMutation) => {
      seen.push(item.localSequence)
      return item.localSequence === 2
        ? ({ state: 'conflict', summary: 'Your private note changed elsewhere.' } as const)
        : ({ state: 'accepted', trip: { ...activeTrip, version: 5 } } as const)
    })

    const result = await offline.replay('shopper-a', 'trip-1', submit)
    expect(seen).toEqual([1, 2])
    expect(result).toMatchObject({ state: 'conflict', pendingCount: 1 })
    await offline.resolveConflict('shopper-a', 'trip-1', 'saved')
    expect(await offline.replay('shopper-a', 'trip-1', submit)).toMatchObject({ state: 'empty' })
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it('rejects a queued mutation from another trip or Navigator device', async () => {
    await expect(
      store().save(await signedInput([{ ...mutation(1), deviceId: 'old-device' }])),
    ).rejects.toThrow(/navigator device/i)
  })

  it('warns before logout with unsynced changes and purges on confirmation, switch, or revoke', async () => {
    const offline = store()
    await offline.save(await signedInput([mutation(1)]))
    expect(await offline.prepareLogout('shopper-a')).toEqual({
      requiresConfirmation: true,
      pendingCount: 1,
    })
    await offline.purgeAccount('shopper-a', 'confirmed_logout')
    expect(await offline.restore('shopper-a', 'trip-1', new Date('2026-08-04T12:00:00Z'))).toEqual({
      state: 'absent',
    })
  })

  it('purges the completed trip ciphertext after its final mutation synchronizes', async () => {
    const offline = store()
    await offline.save(await signedInput([mutation(1)]))
    await offline.replay('shopper-a', 'trip-1', async () => ({
      state: 'accepted',
      trip: { ...activeTrip, state: 'completed', version: 5 },
    }))
    expect(await offline.restore('shopper-a', 'trip-1', new Date('2026-08-04T12:00:00Z'))).toEqual({
      state: 'absent',
    })
  })

  it('purges a terminal offline snapshot after the separate completion command succeeds', async () => {
    const offline = store()
    await offline.save(await signedInput([]))
    await offline.recordCompleted('shopper-a', {
      ...activeTrip,
      state: 'completed',
      version: 5,
    })
    expect(await offline.restore('shopper-a', 'trip-1', new Date('2026-08-04T12:00:00Z'))).toEqual({
      state: 'absent',
    })
  })
})
