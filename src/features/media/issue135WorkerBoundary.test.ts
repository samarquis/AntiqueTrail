import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import * as pipeline from '../../../supabase/functions/_shared/media-pipeline'

function worker(denied: boolean) {
  let handler: ((request: Request) => Promise<Response>) | undefined
  const storage = vi.fn()
  const rpc = vi.fn(async (name: string) => ({
    data: name.includes('list') ? [] : null,
    error: denied ? new Error('private job, wrong scope or stage') : null,
  }))
  const source = ts.transpileModule(
    readFileSync('supabase/functions/media-lifecycle-worker/index.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  runInNewContext(source, {
    exports: {},
    Request,
    Response,
    Uint8Array,
    TextEncoder,
    crypto,
    require: (name: string) =>
      name.startsWith('npm:')
        ? { createClient: () => ({ rpc, storage: { from: storage } }) }
        : pipeline,
    Deno: {
      env: { get: () => 'synthetic-config' },
      serve: (value: typeof handler) => {
        handler = value
      },
    },
  })
  if (!handler) throw new Error('Worker handler missing')
  return { handler, rpc, storage }
}

for (const operation of ['publish', 'purge', 'sweep']) {
  it(`${operation} cannot bypass scheduler authorization with an application bearer`, async () => {
    const { handler, rpc, storage } = worker(false)
    const response = await handler(
      new Request('https://worker.test', {
        method: 'POST',
        headers: { authorization: 'Bearer representative' },
        body: JSON.stringify({ operation, jobId: '13500000-0000-4000-8000-000000000001' }),
      }),
    )
    expect(response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(storage).not.toHaveBeenCalled()
  })

  it(`${operation} makes no Storage call when the database denies the job or stage`, async () => {
    const { handler, rpc, storage } = worker(true)
    const response = await handler(
      new Request('https://worker.test', {
        method: 'POST',
        headers: { 'x-antique-trail-scheduler': 'synthetic-config' },
        body: JSON.stringify({ operation, jobId: '13500000-0000-4000-8000-000000000001' }),
      }),
    )
    expect(response.status).toBe(503)
    expect(await response.text()).toBe('Unavailable')
    expect(rpc).toHaveBeenCalled()
    expect(storage).not.toHaveBeenCalled()
  })
}
