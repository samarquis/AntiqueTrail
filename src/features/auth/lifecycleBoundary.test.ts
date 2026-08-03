import { describe, expect, it, vi } from 'vitest'
import { InMemoryAuthStore, toAuthSession } from './authClient'
import { canAccessOwnedResource, canRequestExport, exportDownloadAllowed, GENERIC_ADMISSION_FAILURE, IdempotencyLedger } from './lifecycleBoundary'

const session = toAuthSession({ userId: 'owner-1', accessToken: 'memory-only', expiresAt: 2_000_000 })

describe('account lifecycle privacy boundary', () => {
  it('isolates account-owned resources and requires recent reauthentication for privacy actions', () => {
    expect(canAccessOwnedResource(session, 'owner-1', 1_000)).toBe(true)
    expect(canAccessOwnedResource(session, 'owner-2', 1_000)).toBe(false)
    expect(canRequestExport(session, 1_500, 2_000)).toBe(true)
    expect(canRequestExport(session, 1_499 - 10 * 60_000, 2_000)).toBe(false)
  })

  it('allows downloads only for ready, unexpired exports', () => {
    expect(exportDownloadAllowed('ready', 2_001, 2_000)).toBe(true)
    expect(exportDownloadAllowed('building', 2_001, 2_000)).toBe(false)
    expect(exportDownloadAllowed('ready', 2_000, 2_000)).toBe(false)
  })

  it('does not persist bearer tokens and returns a generic admission failure', () => {
    const store = new InMemoryAuthStore()
    store.setSession(session)
    expect(window.localStorage.getItem('memory-only')).toBeNull()
    expect(window.sessionStorage.getItem('memory-only')).toBeNull()
    expect(GENERIC_ADMISSION_FAILURE).not.toMatch(/email|account|user|exists/i)
  })
})

describe('lifecycle idempotency boundary', () => {
  it('returns the same result on replay and rejects changed input', () => {
    const ledger = new IdempotencyLedger<{ state: string }>()
    const operation = vi.fn(() => ({ state: 'queued' }))
    expect(ledger.execute('key-1', { owner: 'owner-1' }, operation)).toEqual({ state: 'queued' })
    expect(ledger.execute('key-1', { owner: 'owner-1' }, operation)).toEqual({ state: 'queued' })
    expect(operation).toHaveBeenCalledTimes(1)
    expect(() => ledger.execute('key-1', { owner: 'owner-2' }, operation)).toThrow('idempotency_mismatch')
  })
})
