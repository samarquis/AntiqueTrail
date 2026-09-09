import { describe, expect, it, vi } from 'vitest'
import { createAuthProvider } from './configuredComposition'

describe('configured authoritative account operations', () => {
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
