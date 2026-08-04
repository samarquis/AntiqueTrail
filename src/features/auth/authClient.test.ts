import { describe, expect, it, vi } from 'vitest'
import {
  InMemoryAuthStore,
  InMemorySessionRegistry,
  createRpcSessionRegistry,
  toAuthSession,
} from './authClient'

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

  it('carries fail-closed provider authentication metadata for privileged composition', () => {
    const session = toAuthSession({
      ...providerSession,
      role: 'Administrator',
      passwordAuthenticatedAt: '2026-08-04T12:00:00Z',
      mfaEnrolled: true,
      mfaVerifiedAt: '2026-08-04T12:01:00Z',
    })
    expect(session).toMatchObject({
      role: 'Administrator',
      passwordAuthenticatedAt: '2026-08-04T12:00:00Z',
      mfaEnrolled: true,
      mfaVerifiedAt: '2026-08-04T12:01:00Z',
    })
  })

  it('registers and revokes one exact session', async () => {
    const registry = new InMemorySessionRegistry()
    const session = toAuthSession(providerSession)
    await registry.registerCurrentSession(session)
    expect(await registry.isActive(session)).toBe(true)
    await registry.revoke(session)
    expect(await registry.isActive(session)).toBe(false)
  })

  it('uses the server session registry without sending access tokens', async () => {
    const invoke = vi.fn(async () => true)
    const registry = createRpcSessionRegistry({ invoke })
    const session = toAuthSession(providerSession)
    await registry.registerCurrentSession(session)
    await expect(registry.isActive(session)).resolves.toBe(true)
    await registry.revoke(session, 'user_sign_out')
    expect(invoke.mock.calls).toEqual([
      ['register_current_session', { access_token_expires_at: session.expiresAt }],
      ['current_session_is_active', {}],
      ['revoke_current_session', { reason: 'user_sign_out' }],
    ])
    expect(JSON.stringify(invoke.mock.calls)).not.toContain(session.accessToken)
  })
})
