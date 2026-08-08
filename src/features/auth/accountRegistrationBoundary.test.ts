import { describe, expect, it, vi } from 'vitest'
import {
  handleAccountRegistration,
  type AccountRegistrationDependencies,
} from '../../../supabase/functions/_shared/account-registration'

const requestId = '00000000-0000-4000-8000-000000000001'
const request = () =>
  new Request('https://app.test/register', {
    method: 'POST',
    body: JSON.stringify({
      email: 'shopper@example.test',
      password: 'long-safe-password',
      ageAttested: true,
      requestId,
    }),
  })

function dependencies(
  overrides: Partial<AccountRegistrationDependencies> = {},
): AccountRegistrationDependencies {
  return {
    reserve: vi.fn(async () => ({
      state: 'reserved' as const,
      admissionId: 'admission-1',
      providerOperationId: 'provider-op-1',
    })),
    begin: vi.fn(async () => ({ state: 'calling' as const })),
    generate: vi.fn(async () => ({
      outcome: 'confirmed_generated' as const,
      appCallbackUrl: 'https://app.test/auth/callback#token_hash=opaque&type=verify',
      providerUserId: 'user-1',
    })),
    settleGenerate: vi.fn(async () => ({
      state: 'delivery_reserved' as const,
      deliveryOperationId: 'delivery-op-1',
    })),
    deliver: vi.fn(async () => 'confirmed_delivered' as const),
    settleDelivery: vi.fn(async () => ({ state: 'pending_verification' as const })),
    reconcile: vi.fn(async () => ({ state: 'reconciliation_required' as const })),
    ...overrides,
  }
}

describe('authoritative registration operation', () => {
  it('claims pending verification only after confirmed callback delivery', async () => {
    const deps = dependencies()
    const response = await handleAccountRegistration(request(), deps)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({ state: 'pending_verification' })
    expect(deps.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        appCallbackUrl: expect.stringContaining('/auth/callback#token_hash='),
      }),
    )
    expect(body.toLowerCase()).not.toContain('password')
  })

  it('fails closed on unknown delivery finality and does not claim check-email', async () => {
    const deps = dependencies({
      deliver: vi.fn(async () => 'unknown' as const),
      settleDelivery: vi.fn(async () => ({ state: 'reconciliation_required' as const })),
    })
    const response = await handleAccountRegistration(request(), deps)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ state: 'error' })
  })

  it('does not repeat provider creation when the same key requires reconciliation', async () => {
    const generate = vi.fn()
    const reconcile = vi.fn(async () => ({ state: 'blocked' as const }))
    const response = await handleAccountRegistration(
      request(),
      dependencies({
        reserve: vi.fn(async () => ({
          state: 'reconciliation_required' as const,
          admissionId: 'admission-1',
          operationId: 'provider-op-1',
          kind: 'generate_link' as const,
        })),
        generate,
        reconcile,
      }),
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ state: 'blocked' })
    expect(generate).not.toHaveBeenCalled()
    expect(reconcile).toHaveBeenCalledOnce()
  })

  it('returns a settled same-key delivery without another provider call', async () => {
    const generate = vi.fn()
    const response = await handleAccountRegistration(
      request(),
      dependencies({
        reserve: vi.fn(async () => ({ state: 'pending_verification' as const })),
        generate,
      }),
    )
    expect(await response.json()).toEqual({ state: 'pending_verification' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('reconciles delivery status on retry without repeating send or provider creation', async () => {
    const generate = vi.fn()
    const deliver = vi.fn()
    const reconcile = vi.fn(async () => ({ state: 'pending_verification' as const }))
    const response = await handleAccountRegistration(
      request(),
      dependencies({
        reserve: vi.fn(async () => ({
          state: 'reconciliation_required' as const,
          admissionId: 'admission-1',
          operationId: 'delivery-op-1',
          kind: 'send_verification' as const,
        })),
        generate,
        deliver,
        reconcile,
      }),
    )
    expect(await response.json()).toEqual({ state: 'pending_verification' })
    expect(generate).not.toHaveBeenCalled()
    expect(deliver).not.toHaveBeenCalled()
    expect(reconcile).toHaveBeenCalledOnce()
  })
})
