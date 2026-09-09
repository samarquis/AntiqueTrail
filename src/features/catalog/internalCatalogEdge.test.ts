import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'

it('forwards only the configured allowed origin and provider-verified actor to the gateway', async () => {
  let handler:
    | ((request: Request, info: { remoteAddr: { hostname: string } }) => Promise<Response>)
    | undefined
  const rpc = vi.fn(async () => ({ data: [], error: null }))
  const createClient = vi.fn<
    (url: string, key: string, options?: { accessToken?: () => Promise<string> }) => unknown
  >(() => ({
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } } }) },
  }))
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://backend.invalid',
    SUPABASE_ANON_KEY: 'anon',
    PUBLIC_CATALOG_GATEWAY_JWT: 'gateway',
    PUBLIC_APP_ORIGIN: 'https://review.invalid',
    PUBLIC_CATALOG_RATE_SALT: 'salt',
  }
  runInNewContext(
    ts.transpileModule(readFileSync('supabase/functions/public-catalog/index.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports: {},
      Request,
      Response,
      TextEncoder,
      crypto: webcrypto,
      atob,
      require: () => ({ createClient }),
      Deno: {
        env: { get: (name: string) => values[name] },
        serve: (callback: typeof handler) => {
          handler = callback
        },
      },
    },
  )
  if (!handler) throw new Error('Missing catalog handler')
  const token = `header.${btoa(JSON.stringify({ session_id: '99000000-0000-4000-8000-000000000011' }))}.signature`
  const request = (origin: string) =>
    new Request('https://backend.invalid/functions/v1/public-catalog', {
      method: 'POST',
      headers: { origin, authorization: `Bearer ${token}` },
      body: JSON.stringify({ operation: 'list', args: { p_actor_user_id: 'forged-user' } }),
    })
  expect(
    (await handler(request('https://foreign.invalid'), { remoteAddr: { hostname: '127.0.0.1' } }))
      .status,
  ).toBe(503)
  expect(createClient).not.toHaveBeenCalled()
  expect(
    (await handler(request('https://review.invalid'), { remoteAddr: { hostname: '127.0.0.1' } }))
      .status,
  ).toBe(200)
  expect(createClient).toHaveBeenCalledWith(
    'https://backend.invalid',
    'anon',
    expect.objectContaining({
      global: { headers: { Origin: 'https://review.invalid' } },
      accessToken: expect.any(Function),
    }),
  )
  expect(await createClient.mock.calls[0]?.[2]?.accessToken?.()).toBe('gateway')
  expect(rpc).toHaveBeenCalledWith(
    'synthetic_catalog_gateway_request',
    expect.objectContaining({
      p_user_id: 'verified-user',
      p_session_id: '99000000-0000-4000-8000-000000000011',
      p_args: {},
    }),
  )
})
