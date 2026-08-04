import {
  runCandidateCleanupCycle,
  type CandidateCleanupClaim,
  type CandidateCleanupStorage,
  type CandidateCleanupWorkerQueue,
} from './candidateCleanupWorker'

export interface CandidateCleanupRpc {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<{ data: T; error: Error | null }>
}

export function createCandidateCleanupQueue(rpc: CandidateCleanupRpc): CandidateCleanupWorkerQueue {
  return {
    expireDue: async ({ now, limit }) =>
      call<number>(rpc, 'expire_candidate_shares', {
        p_now: new Date(now).toISOString(),
        p_limit: limit,
      }),
    claimDue: async ({ now, limit }) => {
      const rows = await call<
        Array<{ share_id: string; claim_token: string; storage_keys: string[] }>
      >(rpc, 'claim_candidate_cleanup', { p_now: new Date(now).toISOString(), p_limit: limit })
      return rows.map(
        (row): CandidateCleanupClaim => ({
          shareId: row.share_id,
          claimToken: row.claim_token,
          storageKeys: row.storage_keys,
        }),
      )
    },
    complete: async (input) => {
      await call<null>(rpc, 'complete_candidate_cleanup', {
        p_share_id: input.shareId,
        p_claim_token: input.claimToken,
        p_receipt_id: input.receiptId,
        p_provider_receipt: input.providerReceipt,
        p_storage_keys_digest: input.deletedKeysDigest,
        p_completed_at: new Date(input.completedAt).toISOString(),
      })
    },
    fail: async (input) =>
      call<'pending' | 'exhausted'>(rpc, 'fail_candidate_cleanup', {
        p_share_id: input.shareId,
        p_claim_token: input.claimToken,
        p_now: new Date(input.failedAt).toISOString(),
        p_error_code: input.errorCode,
      }),
  }
}

export interface CandidateCleanupScheduler {
  runOnce(now?: number): ReturnType<typeof runCandidateCleanupCycle>
  start(): () => void
}

export function createCandidateCleanupScheduler(input: {
  rpc: CandidateCleanupRpc
  storage: CandidateCleanupStorage
  limit?: number
  intervalMs?: number
}): CandidateCleanupScheduler {
  const limit = input.limit ?? 100
  const intervalMs = input.intervalMs ?? 60_000
  if (!Number.isInteger(limit) || limit < 1 || limit > 500 || intervalMs < 10_000) {
    throw new Error('candidate_cleanup_scheduler_config_invalid')
  }
  const dependencies = { queue: createCandidateCleanupQueue(input.rpc), storage: input.storage }
  const runOnce = (now = Date.now()) => runCandidateCleanupCycle(dependencies, { now, limit })
  return {
    runOnce,
    start: () => {
      let stopped = false
      let running = false
      const timer = setInterval(() => {
        if (stopped || running) return
        running = true
        void runOnce().finally(() => {
          running = false
        })
      }, intervalMs)
      void runOnce()
      return () => {
        stopped = true
        clearInterval(timer)
      }
    },
  }
}

async function call<T>(rpc: CandidateCleanupRpc, name: string, args: Record<string, unknown>) {
  const { data, error } = await rpc.rpc<T>(name, args)
  if (error) throw new Error(`candidate_cleanup_${name}_failed`)
  return data
}
