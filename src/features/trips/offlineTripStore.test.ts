import { describe, expect, it, vi } from 'vitest'
import {
  EncryptedTripOfflineStore,
  InMemoryOfflineDatabase,
  type OfflineMutation,
} from './offlineTripStore'
import type { Trip } from './types'

const activeTrip: Trip = {
  id: 'trip-1',
  name: 'Antique Day',
  localDate: '2026-08-10',
  state: 'active',
  version: 4,
  stops: [],
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

describe('encrypted active-trip recovery', () => {
  it('recovers the minimum trip snapshot after a cold restart only for the bound account', async () => {
    const database = new InMemoryOfflineDatabase()
    const firstRun = new EncryptedTripOfflineStore(database, 'install-a')
    await firstRun.save({
      accountId: 'shopper-a',
      deviceId: 'device-a',
      trip: activeTrip,
      grantExpiresAt: '2026-08-05T12:00:00.000Z',
      reauthorizeBy: '2026-08-12T12:00:00.000Z',
      mutations: [mutation(1)],
    })

    const restarted = new EncryptedTripOfflineStore(database, 'install-a')
    const recovered = await restarted.restore(
      'shopper-a',
      'trip-1',
      new Date('2026-08-04T12:00:00Z'),
    )
    expect(recovered).toMatchObject({ state: 'available', trip: activeTrip, pendingCount: 1 })

    const wrongAccount = await restarted.restore(
      'shopper-b',
      'trip-1',
      new Date('2026-08-04T12:00:00Z'),
    )
    expect(wrongAccount).toEqual({ state: 'account_mismatch' })
  })

  it('replays mutations once in sequence and preserves a stale private conflict for user choice', async () => {
    const database = new InMemoryOfflineDatabase()
    const store = new EncryptedTripOfflineStore(database, 'install-a')
    await store.save({
      accountId: 'shopper-a',
      deviceId: 'device-a',
      trip: activeTrip,
      grantExpiresAt: '2026-08-05T12:00:00.000Z',
      reauthorizeBy: '2026-08-12T12:00:00.000Z',
      mutations: [mutation(2), mutation(1)],
    })
    const seen: number[] = []
    const submit = vi.fn(async (item: OfflineMutation) => {
      seen.push(item.localSequence)
      return item.localSequence === 2
        ? ({ state: 'conflict', summary: 'Your private note changed elsewhere.' } as const)
        : ({ state: 'accepted', trip: { ...activeTrip, version: 5 } } as const)
    })

    const result = await store.replay('shopper-a', 'trip-1', submit)
    expect(seen).toEqual([1, 2])
    expect(result).toMatchObject({
      state: 'conflict',
      pendingCount: 1,
      conflict: { mutation: { localSequence: 2 } },
    })

    await store.resolveConflict('shopper-a', 'trip-1', 'saved')
    const replayed = await store.replay('shopper-a', 'trip-1', submit)
    expect(replayed).toMatchObject({ state: 'empty', pendingCount: 0 })
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it('rejects a queued mutation from another trip or Navigator device', async () => {
    const store = new EncryptedTripOfflineStore(new InMemoryOfflineDatabase(), 'install-a')
    await expect(
      store.save({
        accountId: 'shopper-a',
        deviceId: 'device-a',
        trip: activeTrip,
        grantExpiresAt: '2026-08-05T12:00:00.000Z',
        reauthorizeBy: '2026-08-12T12:00:00.000Z',
        mutations: [{ ...mutation(1), deviceId: 'old-device' }],
      }),
    ).rejects.toThrow(/navigator device/i)
  })

  it('warns before logout with unsynced changes and purges on confirmation, switch, or revoke', async () => {
    const database = new InMemoryOfflineDatabase()
    const store = new EncryptedTripOfflineStore(database, 'install-a')
    await store.save({
      accountId: 'shopper-a',
      deviceId: 'device-a',
      trip: activeTrip,
      grantExpiresAt: '2026-08-05T12:00:00.000Z',
      reauthorizeBy: '2026-08-12T12:00:00.000Z',
      mutations: [mutation(1)],
    })

    expect(await store.prepareLogout('shopper-a')).toEqual({
      requiresConfirmation: true,
      pendingCount: 1,
    })
    await store.purgeAccount('shopper-a', 'confirmed_logout')
    expect(await store.restore('shopper-a', 'trip-1', new Date('2026-08-04T12:00:00Z'))).toEqual({
      state: 'absent',
    })
  })

  it('purges the completed trip ciphertext after its final mutation synchronizes', async () => {
    const database = new InMemoryOfflineDatabase()
    const store = new EncryptedTripOfflineStore(database, 'install-a')
    await store.save({
      accountId: 'shopper-a',
      deviceId: 'device-a',
      trip: activeTrip,
      grantExpiresAt: '2026-08-05T12:00:00.000Z',
      reauthorizeBy: '2026-08-12T12:00:00.000Z',
      mutations: [mutation(1)],
    })
    await store.replay('shopper-a', 'trip-1', async () => ({
      state: 'accepted',
      trip: { ...activeTrip, state: 'completed', version: 5 },
    }))

    expect(await store.restore('shopper-a', 'trip-1', new Date('2026-08-04T12:00:00Z'))).toEqual({
      state: 'absent',
    })
  })
})
