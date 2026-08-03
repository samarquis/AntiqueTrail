import { describe, expect, it } from 'vitest'
import { InMemoryAuthStore, InMemorySessionRegistry, toAuthSession } from './authClient'

const providerSession = {
  userId: 'user-1',
  accessToken: 'secret-token',
  expiresAt: Date.now() + 60_000,
}

describe('in-memory auth boundary', () => {
  it('keeps access tokens out of browser storage and clears on sign out', () => {
    const store = new InMemoryAuthStore()
    store.setSession(toAuthSession(providerSession))
    expect(store.getSession()?.accessToken).toBe('secret-token')
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    store.clearSession()
    expect(store.getSession()).toBeNull()
  })

  it('registers and revokes one exact session', async () => {
    const registry = new InMemorySessionRegistry()
    const session = toAuthSession(providerSession)
    await registry.registerCurrentSession(session)
    expect(await registry.isActive(session)).toBe(true)
    await registry.revoke(session)
    expect(await registry.isActive(session)).toBe(false)
  })
})
