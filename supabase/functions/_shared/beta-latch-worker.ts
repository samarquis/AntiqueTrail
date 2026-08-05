export interface BetaLatchResult {
  state: 'current' | 'blocked'
  pausedCohorts: number
  hiddenStores: number
}

export interface BetaLatchWorkerDependencies {
  refresh(now: string): Promise<BetaLatchResult>
}

export async function runBetaLatchWorker(
  dependencies: BetaLatchWorkerDependencies,
  now = new Date(),
): Promise<{ status: 'current' | 'blocked'; pausedCohorts: number; hiddenStores: number }> {
  const result = await dependencies.refresh(now.toISOString())
  return {
    status: result.state,
    pausedCohorts: result.pausedCohorts,
    hiddenStores: result.hiddenStores,
  }
}
