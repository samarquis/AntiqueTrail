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

export const GENERIC_OFFLINE_TRIP_ERROR = 'The offline trip could not be prepared safely.'
export const BACKGROUND_PLAINTEXT_TTL_MS = 15 * 60_000

/** UUID v4 that also works in non-secure contexts (plain-HTTP LAN), where crypto.randomUUID is unavailable. */
function randomUuid(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

interface VisibilityTarget {
  visibilityState: string
  addEventListener(name: 'visibilitychange', listener: () => void): void
  removeEventListener(name: 'visibilitychange', listener: () => void): void
}

/** Clears mounted private trip plaintext after a bounded background interval. */
export function installBackgroundPlaintextClearer(
  target: VisibilityTarget,
  clear: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const changed = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (target.visibilityState === 'hidden') timer = setTimeout(clear, BACKGROUND_PLAINTEXT_TTL_MS)
  }
  target.addEventListener('visibilitychange', changed)
  changed()
  return () => {
    if (timer) clearTimeout(timer)
    target.removeEventListener('visibilitychange', changed)
  }
}

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
    action: {
      kind: 'mark_arrived' | 'complete_stop' | 'skip_stop' | 'mark_observed_closed' | 'restore_stop'
      stopId: string
    },
  ): Promise<OfflineQueueSnapshot>
  replay?(accountId: string, tripId: string, client: TripClient): Promise<OfflineReplayResult>
  recordCompleted?(accountId: string, trip: Trip): Promise<void>
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
  const installId = options.installId ?? `install-${randomUuid()}`
  const deviceKeyId = options.deviceKeyId ?? `device-key-${randomUuid()}`
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
          if (
            mutation.kind !== 'mark_arrived' &&
            mutation.kind !== 'complete_stop' &&
            mutation.kind !== 'skip_stop' &&
            mutation.kind !== 'mark_observed_closed' &&
            mutation.kind !== 'restore_stop'
          )
            return { state: 'conflict', summary: 'The offline action is no longer supported.' }
          if (client.replayOfflineMutation)
            return await client.replayOfflineMutation({ ...mutation, kind: mutation.kind, stopId })
          const next =
            mutation.kind === 'mark_arrived'
              ? await client.markArrived(tripId, stopId)
              : mutation.kind === 'complete_stop'
                ? await client.completeStop(tripId, stopId)
                : mutation.kind === 'skip_stop'
                  ? await client.skipStop(tripId, stopId)
                  : mutation.kind === 'mark_observed_closed'
                    ? await client.markObservedClosed?.(tripId, stopId)
                    : await client.restoreStop?.(tripId, stopId)
          return next
            ? { state: 'accepted', trip: next }
            : { state: 'conflict', summary: 'The offline action is no longer supported.' }
        } catch {
          return { state: 'conflict', summary: 'This change conflicts with the saved trip.' }
        }
      })
    },
    recordCompleted(accountId, trip) {
      return store.recordCompleted(accountId, trip)
    },
    prepareSignOut(accountId) {
      return store.prepareLogout(accountId)
    },
    purgeAccount(accountId, reason) {
      return store.purgeAccount(accountId, reason)
    },
  }
}
