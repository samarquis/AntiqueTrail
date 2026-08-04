import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
  const events: string[] = []
  const trip = {
    id: 'trip-1',
    name: 'Antique Day',
    localDate: '2026-08-10',
    state: 'active',
    version: 4,
    stops: [],
  }
  const grant = {
    keyId: 'key-v1',
    claims: {
      accountId: 'shopper-a',
      tripId: 'trip-1',
      installId: 'install-a',
      deviceId: 'install-a',
      deviceKeyId: 'device-key-a',
      sessionSecurityVersion: 3,
      issuedAt: '2026-08-04T12:00:00.000Z',
      expiresAt: '2026-08-05T12:00:00.000Z',
      reauthorizeBy: '2026-08-11T12:00:00.000Z',
      nonce: 'grant-1',
    },
    signature: 'valid-signature',
  }
  const supabase = {
    functions: {
      invoke: vi.fn(
        async (
          name: string,
          options: unknown,
        ): Promise<{
          data: { state: string; receiptId: string } | null
          error: Error | null
        }> => {
          events.push(`edge:${name}`)
          void options
          return { data: { state: 'ready', receiptId: 'receipt-1' }, error: null }
        },
      ),
    },
    rpc: vi.fn(async (name: string, payload: unknown) => {
      events.push(`rpc:${name}`)
      void payload
      return { data: { trip, grant }, error: null }
    }),
    auth: {},
  }
  return { events, trip, grant, supabase }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => harness.supabase) }))

import { configuredComposition } from './configuredComposition'
import {
  InMemoryOfflineDatabase,
  loadOrCreateTripInstallationIdentity,
  type TripInstallationIdentity,
} from '../features/trips'

let tripDatabase: InMemoryOfflineDatabase
let tripIdentity: TripInstallationIdentity

describe('configured Trip grant composition', () => {
  beforeEach(async () => {
    harness.events.length = 0
    harness.supabase.rpc.mockClear()
    harness.supabase.functions.invoke.mockClear()
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    tripDatabase = new InMemoryOfflineDatabase()
    tripIdentity = await loadOrCreateTripInstallationIdentity(tripDatabase)
    harness.grant.claims.installId = tripIdentity.installId
    harness.grant.claims.deviceId = tripIdentity.installId
    harness.grant.claims.deviceKeyId = tripIdentity.deviceKeyId
    vi.stubEnv('VITE_TRIP_OFFLINE_GRANT_KEY_ID', 'key-v1')
    vi.stubEnv(
      'VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK',
      JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    )
  })

  afterEach(() => vi.unstubAllEnvs())

  it('preflights the signer before consumption and unwraps fallback and offline starts', async () => {
    const composition = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    expect(composition).not.toBeNull()

    await expect(composition!.clients.trips!.start('trip-1')).resolves.toEqual(harness.trip)
    expect(harness.events).toEqual(['edge:trip-grant-signer', 'rpc:start_trip_with_offline_grant'])
    expect(harness.supabase.functions.invoke).toHaveBeenLastCalledWith('trip-grant-signer', {
      body: {
        tripId: 'trip-1',
        installId: tripIdentity.installId,
        deviceId: tripIdentity.installId,
        deviceKeyId: tripIdentity.deviceKeyId,
      },
    })

    harness.events.length = 0
    await expect(
      composition!.clients.tripOfflineGrants!.startTripWithOfflineGrant(
        'trip-1',
        tripIdentity.installId,
        tripIdentity.deviceKeyId,
      ),
    ).resolves.toEqual({ trip: harness.trip, grant: harness.grant })
    expect(harness.events).toEqual(['edge:trip-grant-signer', 'rpc:start_trip_with_offline_grant'])
  })

  it('fails closed without calling a consume RPC when signer preflight is unavailable', async () => {
    harness.supabase.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: new Error('signer unavailable'),
    })
    const composition = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    await expect(composition!.clients.trips!.start('trip-1')).rejects.toThrow()
    expect(harness.supabase.rpc).not.toHaveBeenCalled()
  })
})
