import { describe, expect, it, vi } from 'vitest'
import { createAuthProvider } from './configuredComposition'

function session(refreshToken = 'rotated-refresh-token') {
  return {
    access_token: 'access-token-never-persisted',
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1_000) + 3_600,
    user: {
      id: 'shopper-1',
      email: 'shopper@example.test',
      email_confirmed_at: '2026-09-01T00:00:00.000Z',
      app_metadata: { role: 'Shopper' },
      factors: [],
    },
  }
}

function provider(storage: {
  readRefreshToken: () => Promise<string | null>
  writeRefreshToken: (token: string) => Promise<void>
  clear: () => Promise<void>
}) {
  const refreshSession = vi.fn(async () => ({ data: { session: session() }, error: null }))
  const supabase = {
    auth: {
      refreshSession,
      signOut: vi.fn(async () => ({ error: null })),
    },
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  }
  return {
    adapter: createAuthProvider(supabase as never, { refreshSessionStorage: storage }),
    refreshSession,
  }
}

describe('configured session restoration', () => {
  it('exchanges only stored refresh material and keeps the access token out of browser storage', async () => {
    const stored = { refreshToken: 'stored-refresh-token' }
    const storage = {
      readRefreshToken: vi.fn(async () => stored.refreshToken),
      writeRefreshToken: vi.fn(async (token: string) => {
        stored.refreshToken = token
      }),
      clear: vi.fn(async () => undefined),
    }
    const { adapter, refreshSession } = provider(storage)

    const restored = await adapter.restoreSession?.()

    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: 'stored-refresh-token' })
    expect(restored?.accessToken).toBe('access-token-never-persisted')
    expect(storage.writeRefreshToken).toHaveBeenCalledWith('rotated-refresh-token')
    expect(JSON.stringify(stored)).not.toContain('access-token')
    expect(window.localStorage.length).toBe(0)
  })

  it('clears corrupt or rejected refresh material and fails to public browsing', async () => {
    const storage = {
      readRefreshToken: vi.fn(async () => 'revoked-refresh-token'),
      writeRefreshToken: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    }
    const supabase = {
      auth: {
        refreshSession: vi.fn(async () => ({
          data: { session: null },
          error: new Error('revoked'),
        })),
        signOut: vi.fn(async () => ({ error: null })),
      },
      functions: { invoke: vi.fn() },
      rpc: vi.fn(),
    }
    const adapter = createAuthProvider(supabase as never, { refreshSessionStorage: storage })

    await expect(adapter.restoreSession?.()).resolves.toBeNull()
    expect(storage.clear).toHaveBeenCalledOnce()
  })
})
