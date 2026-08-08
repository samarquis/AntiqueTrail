export type CleanupClaim =
  | { state: 'empty' }
  | { state: 'completed' }
  | {
      state: 'pending' | 'reconciliation_required'
      cleanupTicketId: string
      providerUserId: string
    }

export interface RegistrationCleanupDependencies {
  claim(): Promise<CleanupClaim>
  begin(
    cleanupTicketId: string,
    providerUserId: string,
  ): Promise<{ state: 'calling' | 'reconciliation_required' }>
  deleteExact(
    providerUserId: string,
  ): Promise<'confirmed_deleted' | 'confirmed_not_deleted' | 'unknown'>
  settle(
    cleanupTicketId: string,
    providerUserId: string,
    outcome: 'confirmed_deleted' | 'confirmed_not_deleted' | 'unknown',
  ): Promise<{ state: string }>
  reconcile(cleanupTicketId: string, providerUserId: string): Promise<{ state: string }>
}

export async function runRegistrationCleanup(
  dependencies: RegistrationCleanupDependencies,
): Promise<string> {
  const claim = await dependencies.claim()
  if (claim.state === 'empty' || claim.state === 'completed') return claim.state
  let needsReconciliation = claim.state === 'reconciliation_required'
  if (!needsReconciliation) {
    const begun = await dependencies.begin(claim.cleanupTicketId, claim.providerUserId)
    needsReconciliation = begun.state === 'reconciliation_required'
    if (!needsReconciliation) {
      let outcome: 'confirmed_deleted' | 'confirmed_not_deleted' | 'unknown' = 'unknown'
      try {
        outcome = await dependencies.deleteExact(claim.providerUserId)
      } catch {
        outcome = 'unknown'
      }
      const settled = await dependencies.settle(
        claim.cleanupTicketId,
        claim.providerUserId,
        outcome,
      )
      if (settled.state === 'retry' || settled.state === 'escalated') return settled.state
      needsReconciliation = settled.state === 'reconciliation_required'
    }
  }
  if (!needsReconciliation) return 'blocked'
  const result = await dependencies.reconcile(claim.cleanupTicketId, claim.providerUserId)
  return result.state
}
