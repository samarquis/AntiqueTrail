import { describe, expect, it, vi } from 'vitest'
import { createAuthProvider, createConfiguredTripTransport } from './configuredComposition'
import { toAuthSession } from '../features/auth/authClient'

const settleNotification = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('configured authoritative account operations', () => {
  it('bypasses the SDK token lock for trips and denies requests after token clearing', async () => {
    let accessToken: string | null = 'access-one'
    const setHeader = vi.fn(async () => ({ data: { state: 'ok' }, error: null }))
    const lockedSdkRequest = {
      setHeader,
      then: () => new Promise<never>(() => undefined),
    }
    const rpc = vi.fn(() => lockedSdkRequest)
    const transport = createConfiguredTripTransport(rpc, () => accessToken)

    await expect(transport.invoke('list_trips', {})).resolves.toEqual({ state: 'ok' })
    expect(setHeader).toHaveBeenLastCalledWith('Authorization', 'Bearer access-one')

    accessToken = 'access-two'
    await expect(transport.invoke('list_trips', {})).resolves.toEqual({ state: 'ok' })
    expect(setHeader).toHaveBeenLastCalledWith('Authorization', 'Bearer access-two')

    accessToken = null
    await expect(transport.invoke('list_trips', {})).rejects.toThrow(
      'Authenticated trip session unavailable.',
    )
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('uses one server registration operation and never calls browser provider signup', async () => {
    const invoke = vi.fn(async () => ({
      data: { state: 'pending_verification' },
      error: null,
    }))
    const signUp = vi.fn()
    const provider = createAuthProvider({
      functions: { invoke },
      auth: { signUp },
    } as never)
    await expect(
      provider.register?.({
        email: 'shopper@example.test',
        password: 'long-safe-password',
        ageAttested: true,
        requestId: '00000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ kind: 'pending_verification' })
    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith(
      'account-registration',
      expect.objectContaining({ body: expect.objectContaining({ ageAttested: true }) }),
    )
    expect(signUp).not.toHaveBeenCalled()
  })

  it('redeems callbacks through the server latch and never directly through browser verifyOtp', async () => {
    const invoke = vi.fn(async () => ({ data: { state: 'blocked' }, error: null }))
    const verifyOtp = vi.fn()
    const provider = createAuthProvider({
      functions: { invoke },
      auth: { verifyOtp },
    } as never)
    await expect(provider.verifyCallback?.('verify', 'opaque-hash')).resolves.toEqual({
      kind: 'blocked',
    })
    expect(invoke).toHaveBeenCalledWith('account-registration-callback', {
      body: { kind: 'verify', tokenHash: 'opaque-hash' },
    })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('submits recovery only to the dedicated server function and does not install a session', async () => {
    const invoke = vi.fn(async () => ({ data: { state: 'completed' }, error: null }))
    const updateUser = vi.fn()
    const signOut = vi.fn(async () => ({ error: null }))
    const provider = createAuthProvider({
      functions: { invoke },
      auth: { updateUser, signOut },
    } as never)
    await expect(
      provider.completePasswordRecovery?.({
        tokenHash: 'opaque-token',
        password: 'new-password-123',
        requestId: '00000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ kind: 'completed' })
    expect(invoke).toHaveBeenCalledWith('auth-recovery-complete', {
      body: {
        token_hash: 'opaque-token',
        password: 'new-password-123',
        request_id: '00000000-0000-4000-8000-000000000001',
      },
    })
    expect(updateUser).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('installs verified email sessions into the configured SDK before returning authenticated', async () => {
    const session = {
      access_token: 'verified-access',
      refresh_token: 'verified-refresh',
      expires_at: 1_900_000_000,
      token_type: 'bearer',
      user: {
        id: 'verified-user',
        email: 'verified@example.test',
        email_confirmed_at: '2026-09-07T00:00:00Z',
        app_metadata: { role: 'Shopper' },
        user_metadata: {},
      },
    }
    const invoke = vi.fn(async () => ({ data: { state: 'authenticated', session }, error: null }))
    const setSession = vi.fn(async () => ({ data: { session }, error: null }))
    const signOut = vi.fn(async () => ({ error: null }))
    const provider = createAuthProvider({
      functions: { invoke },
      auth: { setSession, signOut },
    } as never)
    await expect(provider.verifyCallback?.('verify', 'opaque-hash')).resolves.toMatchObject({
      kind: 'authenticated',
      session: { userId: 'verified-user' },
    })
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'verified-access',
      refresh_token: 'verified-refresh',
    })
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('sign-out refresh races', () => {
  it('publishes remembered and cleared access tokens for authenticated transports', async () => {
    const tokens: Array<string | null> = []
    const session = {
      access_token: 'current-access',
      refresh_token: 'current-refresh',
      expires_at: 1900000000,
      user: { id: 'user-1', app_metadata: {}, user_metadata: {} },
    }
    const provider = createAuthProvider(
      {
        auth: {
          signInWithPassword: vi.fn(async () => ({ data: { session }, error: null })),
          mfa: {
            getAuthenticatorAssuranceLevel: vi.fn(async () => ({
              data: { currentLevel: 'aal1', nextLevel: 'aal1' },
              error: null,
            })),
          },
        },
      } as never,
      { read: async () => null, write: async () => undefined, clear: async () => undefined },
      (token) => tokens.push(token),
    )

    await expect(provider.signIn('shopper@example.test', 'password')).resolves.toMatchObject({
      kind: 'authenticated',
    })
    await provider.clearSessionMaterial!()
    expect(tokens).toEqual(['current-access', null])
  })

  it('revokes a replaced account without clearing the new provider session or refresh material', async () => {
    let event!: (kind: string, session: unknown) => void
    const clear = vi.fn(async () => undefined)
    const write = vi.fn(async () => undefined)
    const currentSignOut = vi.fn(async () => ({ error: null }))
    const oldSignOut = vi.fn(async () => ({ error: null }))
    const provider = createAuthProvider(
      {
        auth: {
          signOut: currentSignOut,
          admin: { signOut: oldSignOut },
          onAuthStateChange: (listener: typeof event) => {
            event = listener
            return { data: { subscription: { unsubscribe: vi.fn() } } }
          },
        },
      } as never,
      { read: async () => null, write, clear },
    )
    const listener = vi.fn()
    provider.onSessionChange!(listener)
    const next = {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_at: 1900000000,
      user: { id: 'new-user', app_metadata: {}, user_metadata: {} },
    }
    event('SIGNED_IN', next)
    await settleNotification()
    await provider.signOut(
      toAuthSession({ userId: 'old-user', accessToken: 'old-token', expiresAt: 1900000000000 }),
    )
    expect(oldSignOut).toHaveBeenCalledWith('old-token', 'local')
    expect(currentSignOut).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    event('TOKEN_REFRESHED', next)
    await settleNotification()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenCalledWith({ userId: 'new-user', refreshToken: 'new-refresh' })
  })

  it('drains a pending refresh write and ignores late provider refresh events', async () => {
    let event!: (kind: string, session: unknown) => void
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let material: unknown = null
    const storage = {
      read: vi.fn(async () => null),
      write: vi.fn(async (next: unknown) => {
        await pending
        material = next
      }),
      clear: vi.fn(async () => {
        material = null
      }),
    }
    const provider = createAuthProvider(
      {
        auth: {
          onAuthStateChange: (listener: typeof event) => {
            event = listener
            return { data: { subscription: { unsubscribe: vi.fn() } } }
          },
        },
      } as never,
      storage,
    )
    const listener = vi.fn()
    provider.onSessionChange!(listener)
    const refreshed = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: 1900000000,
      user: { id: 'user-1', app_metadata: {}, user_metadata: {} },
    }
    event('TOKEN_REFRESHED', refreshed)
    await settleNotification()
    const clearing = provider.clearSessionMaterial!()
    event('TOKEN_REFRESHED', refreshed)
    release()
    await clearing
    expect(material).toBeNull()
    expect(storage.write).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies application listeners only after the provider callback releases control', async () => {
    let event!: (kind: string, session: unknown) => void
    let insideProviderCallback = false
    const provider = createAuthProvider(
      {
        auth: {
          onAuthStateChange: (listener: typeof event) => {
            event = (kind, session) => {
              insideProviderCallback = true
              listener(kind, session)
              insideProviderCallback = false
            }
            return { data: { subscription: { unsubscribe: vi.fn() } } }
          },
        },
      } as never,
      { read: async () => null, write: async () => undefined, clear: async () => undefined },
    )
    const listener = vi.fn(() => expect(insideProviderCallback).toBe(false))
    provider.onSessionChange!(listener)

    event('TOKEN_REFRESHED', {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: 1900000000,
      user: { id: 'user-1', app_metadata: {}, user_metadata: {} },
    })
    expect(listener).not.toHaveBeenCalled()
    await settleNotification()
    expect(listener).toHaveBeenCalledOnce()
  })
})
