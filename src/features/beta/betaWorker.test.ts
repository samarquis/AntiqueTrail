import { describe, expect, it, vi } from 'vitest'
import { runBetaLatchWorker } from '../../../supabase/functions/_shared/beta-latch-worker'
import betaWorkerSource from '../../../supabase/functions/beta-latch-worker/index.ts?raw'

describe('Controlled Private Beta operational latch worker', () => {
  it('reports the server-owned blocked state without creating evidence or admissions', async () => {
    const refresh = vi.fn(async () => ({
      state: 'blocked' as const,
      pausedCohorts: 1,
      hiddenStores: 1,
    }))

    await expect(
      runBetaLatchWorker({ refresh }, new Date('2026-08-05T12:00:00Z')),
    ).resolves.toEqual({
      status: 'blocked',
      pausedCohorts: 1,
      hiddenStores: 1,
    })
    expect(refresh).toHaveBeenCalledWith('2026-08-05T12:00:00.000Z')
  })

  it('deploys only the bounded latch refresh RPC', () => {
    expect(betaWorkerSource).toContain("admin.rpc('beta_refresh_operational_latch'")
    expect(betaWorkerSource).not.toContain('beta_record_evidence')
    expect(betaWorkerSource).not.toContain('beta_admit_next_store')
    expect(betaWorkerSource).not.toContain('console.')
  })
})
