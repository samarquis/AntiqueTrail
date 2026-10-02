import { runOwnerCancellationWorker } from '../supabase/functions/_shared/owner-cancellation-worker.ts'

/** Uses only a run-owned local service. Never accepts an endpoint or credential. */
export async function runLocalOwnerCancellation(service) {
  return runOwnerCancellationWorker(async (name, args) => {
    if (
      ![
        'billing_due_owner_cancellation',
        'billing_execute_owner_fake_cancellation',
        'billing_reconcile_owner_cancellation',
      ].includes(name)
    )
      throw new Error('Unknown local worker command')
    const id = args.p_intent_id
    if (id !== undefined && (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)))
      throw new Error('Invalid local intent')
    try {
      const result = await service.sql(
        `set role billing_automation; select app_public.${name}(${id === undefined ? '' : "'" + id + "'"});`,
      )
      return { data: JSON.parse(result.trim().split('\n').at(-1)), error: null }
    } catch (error) {
      return { data: null, error }
    }
  })
}
