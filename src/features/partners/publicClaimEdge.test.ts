import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import * as payload from '../../../supabase/functions/_shared/partner-command-payload'
import * as cors from '../../../supabase/functions/_shared/partner-cors'

it('passes a 32-byte PostgreSQL bytea digest through the real public-signal Edge handler', async () => {
  let handler: ((request: Request) => Promise<Response>) | undefined
  const rpc = vi.fn(async () => ({ data: { state: 'verification_pending' }, error: null }))
  const source = readFileSync('supabase/functions/partner-provider-command/index.ts', 'utf8')
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports: {},
      Request,
      Response,
      require: (name: string) =>
        name.startsWith('npm:') ? { createClient: () => ({ rpc }) } : { ...payload, ...cors },
      Deno: {
        env: { get: (name: string) => (name === 'APP_ORIGIN' ? 'https://trail.test' : 'fixture') },
        serve: (callback: typeof handler) => {
          handler = callback
        },
      },
    },
  )
  if (!handler) throw new Error('Missing Edge handler')
  const result = await handler(
    new Request('https://edge.test', {
      method: 'POST',
      headers: { origin: 'https://trail.test', authorization: 'Bearer fixture' },
      body: JSON.stringify({
        operation: 'submit_authority_signal',
        payload: {
          input: {
            claimId: '17000000-0000-4000-8000-000000000010',
            channelClass: 'callback',
            evidenceReference: 'transient reference',
            idempotencyKey: 'edge-signal-170',
          },
        },
      }),
    }),
  )
  expect(result.status).toBe(200)
  expect(rpc).toHaveBeenCalledWith('public_listing_claim_signal_command', {
    p_claim_id: '17000000-0000-4000-8000-000000000010',
    p_channel_class: 'callback',
    p_evidence_ref_hmac: expect.stringMatching(/^\\x[0-9a-f]{64}$/),
    p_idempotency_key: 'edge-signal-170',
  })
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('transient reference')
})
