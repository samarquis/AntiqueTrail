import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InMemoryOfflineDatabase,
  WebCryptoOfflineGrantVerifier,
  loadOrCreateTripInstallationIdentity,
  offlineGrantBytes,
  type OfflineGrantClaims,
  type SignedOfflineGrant,
} from './offlineTripStore'
import { createTripOfflineRuntime, type TripOfflineGrantSource } from './tripRuntime'
import type { Trip } from './types'
import { unavailableTripClient } from './tripClient'

const trip: Trip = {
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
  verifier = new WebCryptoOfflineGrantVerifier(new Map([['key-v1', pair.publicKey]]))
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

async function grant(
  accountId = 'shopper-a',
  identity = { installId: 'install-a', deviceKeyId: 'device-key-a' },
): Promise<SignedOfflineGrant> {
  const claims: OfflineGrantClaims = {
    accountId,
    tripId: trip.id,
    installId: identity.installId,
    deviceId: identity.deviceKeyId,
    deviceKeyId: identity.deviceKeyId,
    sessionSecurityVersion: 3,
    issuedAt: '2026-08-03T12:00:00.000Z',
    expiresAt: '2026-08-05T00:00:00.000Z',
    reauthorizeBy: '2026-08-10T12:00:00.000Z',
    nonce: 'runtime-grant-1',
  }
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    offlineGrantBytes(claims),
  )
  return { keyId: 'key-v1', claims, signature: base64Url(signature) }
}

describe('browser trip offline runtime', () => {
  it('persists a verified start and recovers it through a fresh runtime instance', async () => {
    const database = new InMemoryOfflineDatabase()
    const source: TripOfflineGrantSource = {
      async startTripWithOfflineGrant() {
        return { trip, grant: await grant() }
      },
    }
    const first = createTripOfflineRuntime({
      database,
      installId: 'install-a',
      verifier,
      deviceKeyId: 'device-key-a',
    })
    await expect(first.start('shopper-a', 'trip-1', source)).resolves.toEqual(trip)

    const restarted = createTripOfflineRuntime({
      database,
      installId: 'install-a',
      verifier,
      deviceKeyId: 'device-key-a',
    })
    await expect(
      restarted.recover('shopper-a', 'trip-1', new Date('2026-08-04T12:00:00Z')),
    ).resolves.toMatchObject({ state: 'available', trip })
  })

  it('rejects a valid grant for a different authenticated account and purges on sign-out', async () => {
    const database = new InMemoryOfflineDatabase()
    const runtime = createTripOfflineRuntime({
      database,
      installId: 'install-a',
      verifier,
      deviceKeyId: 'device-key-a',
    })
    await expect(
      runtime.start('shopper-a', 'trip-1', {
        async startTripWithOfflineGrant() {
          return { trip, grant: await grant('shopper-b') }
        },
      }),
    ).rejects.toThrow(/offline trip/i)

    await runtime.start('shopper-a', 'trip-1', {
      async startTripWithOfflineGrant() {
        return { trip, grant: await grant() }
      },
    })
    await runtime.purgeAccount('shopper-a', 'confirmed_logout')
    await expect(
      runtime.recover('shopper-a', 'trip-1', new Date('2026-08-04T12:00:00Z')),
    ).resolves.toEqual({ state: 'absent' })
  })

  it('encrypts queued Go mutations across restart and replays them in order', async () => {
    const database = new InMemoryOfflineDatabase()
    const options = { database, installId: 'install-a', verifier, deviceKeyId: 'device-key-a' }
    const first = createTripOfflineRuntime(options)
    await first.start('shopper-a', trip.id, {
      async startTripWithOfflineGrant() {
        return { trip, grant: await grant() }
      },
    })
    const arrived = { ...trip, stops: [], version: 5 }
    await first.queueMutation?.('shopper-a', arrived, {
      kind: 'mark_arrived',
      stopId: 'stop-1',
    })

    const restarted = createTripOfflineRuntime(options)
    await expect(
      restarted.recover('shopper-a', trip.id, new Date('2026-08-04T12:00:00Z')),
    ).resolves.toMatchObject({ state: 'available', pendingCount: 1, trip: arrived })
    const markArrived = vi.fn().mockResolvedValue(arrived)
    await expect(
      restarted.replay?.('shopper-a', trip.id, { ...unavailableTripClient, markArrived }),
    ).resolves.toMatchObject({ state: 'empty', pendingCount: 0, trip: arrived })
    expect(markArrived).toHaveBeenCalledWith(trip.id, 'stop-1')
  })

  it('submits a server-verifiable envelope and purges on typed authorization loss', async () => {
    const database = new InMemoryOfflineDatabase()
    const runtime = createTripOfflineRuntime({
      database,
      installId: 'install-a',
      verifier,
      deviceKeyId: 'device-key-a',
    })
    await runtime.start('shopper-a', trip.id, {
      async startTripWithOfflineGrant() {
        return { trip, grant: await grant() }
      },
    })
    await runtime.queueMutation?.('shopper-a', trip, {
      kind: 'mark_arrived',
      stopId: 'stop-1',
    })
    const replayOfflineMutation = vi.fn(async () => ({ state: 'unauthorized' as const }))
    await expect(
      runtime.replay?.('shopper-a', trip.id, {
        ...unavailableTripClient,
        replayOfflineMutation,
      }),
    ).resolves.toEqual({
      state: 'purged',
      pendingCount: 0,
      purgeReason: 'authorization_lost',
    })
    expect(replayOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: trip.id,
        deviceId: 'device-key-a',
        idempotencyKey: expect.any(String),
        localSequence: 1,
        kind: 'mark_arrived',
        stopId: 'stop-1',
      }),
    )
    await expect(runtime.recover('shopper-a', trip.id)).resolves.toEqual({ state: 'absent' })
  })

  it('denies the old persisted installation replay after Navigator transfer', async () => {
    const oldDatabase = new InMemoryOfflineDatabase()
    const newDatabase = new InMemoryOfflineDatabase()
    const oldIdentity = await loadOrCreateTripInstallationIdentity(oldDatabase)
    const newIdentity = await loadOrCreateTripInstallationIdentity(newDatabase)
    expect(newIdentity).not.toEqual(oldIdentity)
    const oldRuntime = createTripOfflineRuntime({
      database: oldDatabase,
      verifier,
      ...oldIdentity,
    })
    await oldRuntime.start('shopper-a', trip.id, {
      async startTripWithOfflineGrant() {
        return { trip, grant: await grant('shopper-a', oldIdentity) }
      },
    })
    await oldRuntime.queueMutation?.('shopper-a', trip, {
      kind: 'mark_arrived',
      stopId: 'stop-1',
    })
    let activeDeviceId = oldIdentity.deviceKeyId
    const transferNavigatorDevice = vi.fn(async (targetTripId: string) => {
      expect(targetTripId).toBe(trip.id)
      activeDeviceId = newIdentity.deviceKeyId
      return trip
    })
    await transferNavigatorDevice(trip.id)
    const replayOfflineMutation = vi.fn(async (envelope: { deviceId: string }) =>
      envelope.deviceId === activeDeviceId
        ? { state: 'accepted' as const, trip }
        : { state: 'unauthorized' as const },
    )
    await expect(
      oldRuntime.replay?.('shopper-a', trip.id, {
        ...unavailableTripClient,
        replayOfflineMutation,
      }),
    ).resolves.toEqual({
      state: 'purged',
      pendingCount: 0,
      purgeReason: 'authorization_lost',
    })
    expect(replayOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: oldIdentity.deviceKeyId }),
    )
  })
})
