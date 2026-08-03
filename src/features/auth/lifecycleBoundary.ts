import type { AuthSession } from './types'

export type ExportState = 'queued' | 'building' | 'ready' | 'failed' | 'expired'
export type DeletionState = 'none' | 'scheduled' | 'cancelled' | 'completed'

export const GENERIC_ADMISSION_FAILURE = 'We could not complete registration. Check the link or try again.'

export function canAccessOwnedResource(session: AuthSession | null, ownerId: string, now = Date.now()): boolean {
  return Boolean(session && session.userId === ownerId && session.expiresAt > now)
}

export function canRequestExport(session: AuthSession | null, reauthenticatedAt: number, now = Date.now()): boolean {
  return Boolean(session && session.expiresAt > now && reauthenticatedAt > now - 10 * 60_000)
}

export function canScheduleDeletion(session: AuthSession | null, reauthenticatedAt: number, now = Date.now()): boolean {
  return canRequestExport(session, reauthenticatedAt, now)
}

export function exportDownloadAllowed(state: ExportState, signedUrlExpiresAt: number, now = Date.now()): boolean {
  return state === 'ready' && signedUrlExpiresAt > now
}

/** Replaying an idempotency key with identical input is safe; changing its input denies. */
export class IdempotencyLedger<T> {
  #entries = new Map<string, { fingerprint: string; result: T }>()

  execute(key: string, input: unknown, operation: () => T): T {
    const fingerprint = JSON.stringify(input)
    const prior = this.#entries.get(key)
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('idempotency_mismatch')
      return prior.result
    }
    const result = operation()
    this.#entries.set(key, { fingerprint, result })
    return result
  }
}
