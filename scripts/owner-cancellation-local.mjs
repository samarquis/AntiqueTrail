import { readFileSync } from 'node:fs'
import ts from 'typescript'

// CI uses Node 20; compile the same dependency-free worker rather than relying on type stripping.
const source = readFileSync(
  new URL('../supabase/functions/_shared/owner-cancellation-worker.ts', import.meta.url),
  'utf8',
)
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
})
const { runOwnerCancellationWorker } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

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
