type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>

/** Only the server-owned synthetic gate admits this path. No network/provider client. */
export async function runOwnerCancellationWorker(rpc: Rpc): Promise<{ pending: number } | null> {
  const due = await rpc('billing_due_owner_cancellation', {})
  if (due.error || typeof due.data !== 'object' || due.data === null)
    throw new Error('Cancellation worker unavailable')
  const value = due.data as { enabled?: unknown; intentIds?: unknown }
  if (value.enabled === false) return null
  if (
    value.enabled !== true ||
    !Array.isArray(value.intentIds) ||
    value.intentIds.some((id: unknown) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
  )
    throw new Error('Cancellation worker unavailable')
  let pending = 0
  for (const id of value.intentIds) {
    const executed = await rpc('billing_execute_owner_fake_cancellation', { p_intent_id: id })
    // Lost execution response is an unresolved durable obligation; next run reuses its key.
    if (executed.error) {
      pending++
      continue
    }
    const reconciled = await rpc('billing_reconcile_owner_cancellation', { p_intent_id: id })
    const state = (reconciled.data as { state?: unknown } | null)?.state
    if (reconciled.error || !['scheduled', 'completed', 'failed'].includes(String(state))) pending++
  }
  return { pending }
}
