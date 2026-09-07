import { describe, expect, it, vi } from 'vitest'
import { handlePasswordRecoveryCompletion } from '../../../supabase/functions/_shared/password-recovery-completion'
import type { PasswordRecoveryCompletionDependencies } from '../../../supabase/functions/_shared/password-recovery-completion'

function request(body: Record<string, unknown>) {
  return new Request('https://antique-trail.invalid/functions/v1/auth-recovery-complete', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function dependencies(overrides: Partial<PasswordRecoveryCompletionDependencies> = {}) {
  const order: string[] = []
  const defaults: PasswordRecoveryCompletionDependencies = {
    status: async () => 'unknown',
    verifyToken: async () => ({ userId: 'user-a', sessionId: 'session-a', accessToken: 'bearer' }),
    invalidateApplicationSessions: async () => {
      order.push('invalidate')
      return 'ready'
    },
    updatePassword: async () => {
      order.push('update')
    },
    revokeProviderSessions: async () => {
      order.push('provider-revoke')
    },
    complete: async () => {
      order.push('complete')
      return 'completed'
    },
    markUncertain: async () => {
      order.push('uncertain')
    },
    markProviderPending: async () => {
      order.push('provider-pending')
    },
  }
  return { order, dependencies: { ...defaults, ...overrides } }
}

const valid = {
  token_hash: 't'.repeat(32),
  password: 'new-password-123',
  request_id: '00000000-0000-4000-8000-000000000001',
}

describe('password recovery completion boundary', () => {
  it('validates before consuming a token', async () => {
    const boundary = dependencies()
    const response = await handlePasswordRecoveryCompletion(
      request({ ...valid, password: 'short' }),
      boundary.dependencies,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ state: 'error' })
    expect(boundary.order).toEqual([])
  })

  it('invalidates application sessions before changing the provider password', async () => {
    const boundary = dependencies()
    const response = await handlePasswordRecoveryCompletion(request(valid), boundary.dependencies)
    expect(await response.json()).toEqual({ state: 'completed' })
    expect(boundary.order).toEqual(['invalidate', 'update', 'provider-revoke', 'complete'])
  })

  it('does not replay a consumed or uncertain operation', async () => {
    const verifyToken = vi.fn(async () => ({
      userId: 'user-a',
      sessionId: 'session-a',
      accessToken: 'bearer',
    }))
    const invalidatedVerify = vi.fn(async () => ({
      userId: 'user-a',
      sessionId: 'session-a',
      accessToken: 'bearer',
    }))
    const invalidated = dependencies({
      status: async () => 'invalidated',
      verifyToken: invalidatedVerify,
    })
    await handlePasswordRecoveryCompletion(request(valid), invalidated.dependencies)
    expect(invalidatedVerify).not.toHaveBeenCalled()

    const completed = dependencies({
      status: async () => 'completed',
      verifyToken,
    })
    const response = await handlePasswordRecoveryCompletion(request(valid), completed.dependencies)
    expect(await response.json()).toEqual({ state: 'completed' })
    expect(completed.order).toEqual([])
  })

  it('keeps the application fence when the provider update is uncertain', async () => {
    const boundary = dependencies({
      updatePassword: async () => {
        throw new Error('provider timeout')
      },
    })
    const response = await handlePasswordRecoveryCompletion(request(valid), boundary.dependencies)
    expect(await response.json()).toEqual({ state: 'error' })
    expect(boundary.order).toEqual(['invalidate', 'uncertain'])
  })

  it('records provider failure for a safe retry without replaying the password update', async () => {
    const first = dependencies({
      revokeProviderSessions: async () => {
        throw new Error('provider timeout')
      },
    })
    const firstResponse = await handlePasswordRecoveryCompletion(request(valid), first.dependencies)
    expect(await firstResponse.json()).toEqual({ state: 'error' })
    expect(first.order).toEqual(['invalidate', 'update', 'provider-pending'])

    const retry = dependencies({
      status: async () => 'provider_pending',
      invalidateApplicationSessions: async () => {
        retry.order.push('provider-retry')
        return 'provider_retry'
      },
    })
    const retryResponse = await handlePasswordRecoveryCompletion(request(valid), retry.dependencies)
    expect(await retryResponse.json()).toEqual({ state: 'completed' })
    expect(retry.order).toEqual(['provider-retry', 'provider-revoke', 'complete'])
  })
})
