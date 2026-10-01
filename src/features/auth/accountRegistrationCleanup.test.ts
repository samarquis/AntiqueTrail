import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import {
  registrationCleanupErrorCode,
  runRegistrationCleanup,
  type RegistrationCleanupDependencies,
} from '../../../supabase/functions/_shared/account-registration-cleanup'
import {
  validateRegistrationEndpoints,
  withDeadline,
} from '../../../supabase/functions/_shared/registration-config'

function deps(
  overrides: Partial<RegistrationCleanupDependencies> = {},
): RegistrationCleanupDependencies {
  return {
    claim: vi.fn(async () => ({
      state: 'pending' as const,
      cleanupTicketId: 'delete-1',
      providerUserId: 'user-1',
    })),
    begin: vi.fn(async () => ({ state: 'calling' as const })),
    deleteExact: vi.fn(async () => 'confirmed_deleted' as const),
    settle: vi.fn(async () => ({ state: 'reconciliation_required' })),
    reconcile: vi.fn(async () => ({ state: 'completed_terminal_cleanup' })),
    ...overrides,
  }
}

describe('durable registration cleanup', () => {
  it('deletes by exact provider id and completes only after confirmed absence', async () => {
    const d = deps()
    await expect(runRegistrationCleanup(d)).resolves.toBe('completed_terminal_cleanup')
    expect(d.deleteExact).toHaveBeenCalledWith('user-1')
    expect(d.reconcile).toHaveBeenCalledWith('delete-1', 'user-1')
  })
  it('reconciles response loss without repeating delete', async () => {
    const d = deps({
      claim: vi.fn(async () => ({
        state: 'reconciliation_required' as const,
        cleanupTicketId: 'delete-1',
        providerUserId: 'user-1',
      })),
    })
    await expect(runRegistrationCleanup(d)).resolves.toBe('completed_terminal_cleanup')
    expect(d.deleteExact).not.toHaveBeenCalled()
  })
  it('never deletes an account when the database blocks cleanup', async () => {
    const d = deps({ begin: vi.fn(async () => ({ state: 'blocked' as const })) })
    await expect(runRegistrationCleanup(d)).resolves.toBe('blocked')
    expect(d.deleteExact).not.toHaveBeenCalled()
    expect(d.settle).not.toHaveBeenCalled()
  })
  it('schedules retry when provider remains present', async () => {
    await expect(
      runRegistrationCleanup(
        deps({
          reconcile: vi.fn(async () => ({ state: 'retry' })),
        }),
      ),
    ).resolves.toBe('retry')
  })
  it('surfaces permanent provider denial exhaustion for operator action', async () => {
    const d = deps({
      deleteExact: vi.fn(async () => 'confirmed_not_deleted' as const),
      settle: vi.fn(async () => ({ state: 'escalated' })),
    })
    await expect(runRegistrationCleanup(d)).resolves.toBe('escalated')
    expect(d.reconcile).not.toHaveBeenCalled()
  })
  it('keeps timeout and unknown finality in reconciliation', async () => {
    await expect(
      runRegistrationCleanup(
        deps({
          deleteExact: vi.fn(async () => {
            throw new Error('timeout')
          }),
          reconcile: vi.fn(async () => ({ state: 'reconciliation_required' })),
        }),
      ),
    ).resolves.toBe('reconciliation_required')
  })
  it('makes no provider call for an empty queue', async () => {
    const d = deps({ claim: vi.fn(async () => ({ state: 'empty' as const })) })
    await expect(runRegistrationCleanup(d)).resolves.toBe('empty')
    expect(d.deleteExact).not.toHaveBeenCalled()
  })
  it('reports impossible worker states as internal_error', async () => {
    await expect(
      runRegistrationCleanup(deps({ settle: vi.fn(async () => ({ state: 'unexpected' })) })),
    ).rejects.toThrow('internal_error')
  })
  it.each([
    [new TypeError('fetch failed'), 'provider_unavailable'],
    [new Error('registration_cleanup_unavailable'), 'provider_unavailable'],
    [new Error('not_allowed'), 'not_allowed'],
    [new Error('private database details'), 'internal_error'],
    [new Error('conflict'), 'conflict'],
  ])('maps worker dependency failure to %s', async (failure, code) => {
    await expect(
      runRegistrationCleanup(
        deps({
          claim: vi.fn(async () => {
            throw failure
          }),
        }),
      ),
    ).rejects.toThrow(code)
  })
})

function cleanupEdge(overrides: Record<string, string> = {}, rpcError?: Error) {
  let handler: ((request: Request) => Promise<Response>) | undefined
  const rpc = vi.fn(async () => ({ data: null, error: rpcError ?? null }))
  const createClient = vi.fn(() => ({ rpc }))
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://trail.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role-key',
    REGISTRATION_CLEANUP_SCHEDULER_SECRET: 'fixture-scheduler-secret-32-characters',
    APP_ORIGIN: 'https://trail.example',
    REGISTRATION_APPROVED_APP_ORIGIN: 'https://trail.example',
    REGISTRATION_MAIL_ENDPOINT: 'https://mail.example/send',
    REGISTRATION_APPROVED_MAIL_ENDPOINT: 'https://mail.example/send',
    REGISTRATION_APPROVED_SUPABASE_ORIGIN: 'https://trail.supabase.co',
    ...overrides,
  }
  const compiled = ts.transpileModule(
    readFileSync('supabase/functions/account-registration-cleanup/index.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  runInNewContext(compiled, {
    exports: {},
    Request,
    Response,
    URL,
    TextEncoder,
    fetch: vi.fn(),
    require: (name: string) =>
      name.startsWith('npm:')
        ? { createClient }
        : name.includes('registration-config')
          ? { validateRegistrationEndpoints, withDeadline }
          : { registrationCleanupErrorCode, runRegistrationCleanup },
    Deno: {
      env: { get: (name: string) => values[name] },
      serve: (callback: typeof handler) => {
        handler = callback
      },
    },
  })
  return {
    handle(request: Request) {
      if (!handler) throw new Error('Cleanup Edge handler missing')
      return handler(request)
    },
    createClient,
  }
}

describe('registration cleanup Edge responses', () => {
  it('returns a private 401 command error for an invalid scheduler credential', async () => {
    const edge = cleanupEdge()
    const response = await edge.handle(
      new Request('https://trail.supabase.co/functions/v1/account-registration-cleanup', {
        method: 'POST',
      }),
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ state: 'error', error: 'authentication_required' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(edge.createClient).not.toHaveBeenCalled()
  })

  it.each([
    ['authentication_required', 401],
    ['not_allowed', 403],
    ['validation_failed', 400],
    ['conflict', 409],
    ['provider_unavailable', 503],
    ['internal_error', 500],
  ])('maps %s to its HTTP response', async (errorCode, status) => {
    const secret = 'fixture-scheduler-secret-32-characters'
    const edge = cleanupEdge({}, new Error(errorCode))
    const response = await edge.handle(
      new Request('https://trail.supabase.co/functions/v1/account-registration-cleanup', {
        method: 'POST',
        headers: { 'x-antique-trail-scheduler': secret },
      }),
    )
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ state: 'error', error: errorCode })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns provider_unavailable when scheduler configuration is invalid', async () => {
    const edge = cleanupEdge({ REGISTRATION_CLEANUP_SCHEDULER_SECRET: 'short' })
    const response = await edge.handle(
      new Request('https://trail.supabase.co/functions/v1/account-registration-cleanup', {
        method: 'POST',
        headers: { 'x-antique-trail-scheduler': 'short' },
      }),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ state: 'error', error: 'provider_unavailable' })
    expect(edge.createClient).not.toHaveBeenCalled()
  })
})
