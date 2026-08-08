import { describe, expect, it, vi } from 'vitest'
import {
  runRegistrationCleanup,
  type RegistrationCleanupDependencies,
} from '../../../supabase/functions/_shared/account-registration-cleanup'

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
})
