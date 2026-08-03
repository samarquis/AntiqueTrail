import { beforeAll, describe, expect, it } from 'vitest'
import {
  InMemoryOfflineDatabase,
  WebCryptoOfflineGrantVerifier,
  offlineGrantBytes,
  type OfflineGrantClaims,
  type SignedOfflineGrant,
} from './offlineTripStore'
import { createTripOfflineRuntime, type TripOfflineGrantSource } from './tripRuntime'
import type { Trip } from './types'

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

function base64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

async function grant(accountId = 'shopper-a'): Promise<SignedOfflineGrant> {
  const claims: OfflineGrantClaims = {
    accountId,
    tripId: trip.id,
    installId: 'install-a',
    deviceId: 'install-a',
    deviceKeyId: 'device-key-a',
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
})
