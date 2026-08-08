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
})
