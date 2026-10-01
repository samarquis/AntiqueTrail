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
  ): Promise<{ state: 'calling' | 'reconciliation_required' | 'blocked' }>
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

const commandErrors = new Set([
  'authentication_required',
  'not_allowed',
  'validation_failed',
  'provider_unavailable',
  'internal_error',
  'conflict',
])

export function registrationCleanupErrorCode(error: unknown): string {
  const details =
    error && typeof error === 'object' ? (error as { message?: unknown; code?: unknown }) : {}
  const message = typeof details.message === 'string' ? details.message : ''
  if (commandErrors.has(message)) return message
  if (message === 'unavailable' || message.endsWith('_unavailable')) return 'provider_unavailable'
  const code = typeof details.code === 'string' ? details.code : ''
  if (code.startsWith('40')) return 'conflict'
  if (code.startsWith('08') || code.startsWith('53') || code.startsWith('57'))
    return 'provider_unavailable'
  if (error instanceof TypeError && /fetch|network|connection|socket|timed? out/i.test(message))
    return 'provider_unavailable'
  return 'internal_error'
}

export async function runRegistrationCleanup(
  dependencies: RegistrationCleanupDependencies,
): Promise<string> {
  try {
    const claim = await dependencies.claim()
    if (claim.state === 'empty' || claim.state === 'completed') return claim.state
    if (claim.state !== 'pending' && claim.state !== 'reconciliation_required')
      throw new Error('internal_error')
    let needsReconciliation = claim.state === 'reconciliation_required'
    if (!needsReconciliation) {
      const begun = await dependencies.begin(claim.cleanupTicketId, claim.providerUserId)
      if (begun.state === 'blocked') return 'blocked'
      if (begun.state !== 'calling' && begun.state !== 'reconciliation_required')
        throw new Error('internal_error')
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
        if (settled.state !== 'reconciliation_required') throw new Error('internal_error')
        needsReconciliation = true
      }
    }
    if (!needsReconciliation) throw new Error('internal_error')
    const result = await dependencies.reconcile(claim.cleanupTicketId, claim.providerUserId)
    if (
      result.state !== 'completed_terminal_cleanup' &&
      result.state !== 'retry' &&
      result.state !== 'escalated' &&
      result.state !== 'reconciliation_required'
    )
      throw new Error('internal_error')
    return result.state
  } catch (error) {
    throw new Error(registrationCleanupErrorCode(error))
  }
}
