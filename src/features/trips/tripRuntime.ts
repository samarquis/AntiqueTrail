import {
  EncryptedTripOfflineStore,
  IndexedDbOfflineDatabase,
  type OfflineGrantVerifier,
  type OfflineRestoreResult,
  type OfflineReplayResult,
  type OfflineTripDatabase,
  type SignedOfflineGrant,
} from './offlineTripStore'
import type { OfflineQueueSnapshot, Trip, TripClient } from './types'

export const DEFAULT_TRIP_INSTALL_ID = 'antique-trail-pwa-install-v1'
export const GENERIC_OFFLINE_TRIP_ERROR = 'The offline trip could not be prepared safely.'

export interface TripOfflineGrantSource {
  startTripWithOfflineGrant(
    tripId: string,
    installId: string,
    deviceKeyId: string,
  ): Promise<{ trip: Trip; grant: SignedOfflineGrant }>
}

export interface TripOfflineRuntime {
  readonly installId: string
  readonly deviceKeyId: string
  start(accountId: string, tripId: string, source: TripOfflineGrantSource): Promise<Trip>
  recover(accountId: string, tripId: string, now?: Date): Promise<OfflineRestoreResult>
  queueMutation?(
    accountId: string,
    trip: Trip,
    action: { kind: 'mark_arrived' | 'complete_stop' | 'skip_stop'; stopId: string },
  ): Promise<OfflineQueueSnapshot>
  replay?(accountId: string, tripId: string, client: TripClient): Promise<OfflineReplayResult>
  prepareSignOut(
    accountId: string,
  ): Promise<{ requiresConfirmation: boolean; pendingCount: number }>
  purgeAccount(
    accountId: string,
    reason: 'confirmed_logout' | 'account_switch' | 'authorization_lost' | 'expired',
  ): Promise<void>
}

class RejectingVerifier implements OfflineGrantVerifier {
  async verify() {
    return false
  }
}

export function createTripOfflineRuntime(
  options: {
    database?: OfflineTripDatabase
    installId?: string
    verifier?: OfflineGrantVerifier
    deviceKeyId?: string
  } = {},
): TripOfflineRuntime {
  const installId = options.installId ?? DEFAULT_TRIP_INSTALL_ID
  const deviceKeyId = options.deviceKeyId ?? `${installId}:device-key-v1`
  const store = new EncryptedTripOfflineStore(
    options.database ?? new IndexedDbOfflineDatabase(),
    installId,
    options.verifier ?? new RejectingVerifier(),
    deviceKeyId,
  )
  return {
    installId,
    deviceKeyId,
    async start(accountId, tripId, source) {
      try {
        const result = await source.startTripWithOfflineGrant(tripId, installId, deviceKeyId)
        if (
          result.trip.id !== tripId ||
          result.grant.claims.accountId !== accountId ||
          result.grant.claims.tripId !== tripId ||
          result.grant.claims.installId !== installId ||
          result.grant.claims.deviceKeyId !== deviceKeyId
        )
          throw new Error(GENERIC_OFFLINE_TRIP_ERROR)
        await store.save({ trip: result.trip, grant: result.grant, mutations: [] })
        return result.trip
      } catch {
        throw new Error(GENERIC_OFFLINE_TRIP_ERROR)
      }
    },
    recover(accountId, tripId, now) {
      return store.restore(accountId, tripId, now)
    },
    async queueMutation(accountId, trip, action) {
      const result = await store.queueMutation(accountId, trip, action)
      return {
        state: 'queued',
        pendingCount: result.pendingCount,
        lastUpdatedAt: new Date().toISOString(),
      }
    },
    replay(accountId, tripId, client) {
      return store.replay(accountId, tripId, async (mutation) => {
        try {
          const stopId = mutation.stopId
          if (!stopId) return { state: 'conflict', summary: 'The offline action is incomplete.' }
          const next =
            mutation.kind === 'mark_arrived'
              ? await client.markArrived(tripId, stopId)
              : mutation.kind === 'complete_stop'
                ? await client.completeStop(tripId, stopId)
                : mutation.kind === 'skip_stop'
                  ? await client.skipStop(tripId, stopId)
                  : null
          return next
            ? { state: 'accepted', trip: next }
            : { state: 'conflict', summary: 'The offline action is no longer supported.' }
        } catch {
          return { state: 'conflict', summary: 'This change conflicts with the saved trip.' }
        }
      })
    },
    prepareSignOut(accountId) {
      return store.prepareLogout(accountId)
    },
    purgeAccount(accountId, reason) {
      return store.purgeAccount(accountId, reason)
    },
  }
}
