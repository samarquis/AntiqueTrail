import {
  EncryptedTripOfflineStore,
  IndexedDbOfflineDatabase,
  type OfflineGrantVerifier,
  type OfflineRestoreResult,
  type OfflineTripDatabase,
  type SignedOfflineGrant,
} from './offlineTripStore'
import type { Trip } from './types'

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
    prepareSignOut(accountId) {
      return store.prepareLogout(accountId)
    },
    purgeAccount(accountId, reason) {
      return store.purgeAccount(accountId, reason)
    },
  }
}
