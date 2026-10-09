// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import { createPublicCatalogHandler } from '../../../supabase/functions/_shared/public-catalog'

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
      require: (name: string) =>
        name === '../_shared/public-catalog.ts' ? { createPublicCatalogHandler } : { createClient },
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

const invalidCatalogEnvelopes = [
  { name: 'malformed JSON', body: '{', code: 'INVALID_REQUEST' },
  { name: 'null envelope', body: 'null', code: 'INVALID_REQUEST' },
  { name: 'array envelope', body: '[]', code: 'INVALID_REQUEST' },
  { name: 'string envelope', body: '"request"', code: 'INVALID_REQUEST' },
  { name: 'number envelope', body: '1', code: 'INVALID_REQUEST' },
  { name: 'boolean envelope', body: 'true', code: 'INVALID_REQUEST' },
  { name: 'null args', body: '{"operation":"list","args":null}', code: 'INVALID_REQUEST' },
  { name: 'array args', body: '{"operation":"list","args":[]}', code: 'INVALID_REQUEST' },
  { name: 'string args', body: '{"operation":"list","args":"args"}', code: 'INVALID_REQUEST' },
  { name: 'number args', body: '{"operation":"list","args":1}', code: 'INVALID_REQUEST' },
  { name: 'boolean args', body: '{"operation":"list","args":true}', code: 'INVALID_REQUEST' },
  { name: 'omitted operation', body: '{}', code: 'INVALID_OPERATION' },
  { name: 'unknown operation', body: '{"operation":"other"}', code: 'INVALID_OPERATION' },
  { name: 'non-string operation', body: '{"operation":1}', code: 'INVALID_OPERATION' },
]

it.each(invalidCatalogEnvelopes)(
  'rejects $name before calling backend dependencies',
  async ({ body, code }) => {
    const rpc = vi.fn(async () => ({ data: [], error: null }))
    const gateway = vi.fn(() => ({ rpc }))
    const verify = vi.fn(async () => null)
    const handler = createPublicCatalogHandler(
      {
        url: 'https://backend.invalid',
        anonKey: 'anon',
        gatewayJwt: 'gateway',
        allowedOrigin: 'https://review.invalid',
        rateSalt: 'salt',
        publicTest: false,
      },
      { gateway, verify },
    )
    const response = await handler(
      new Request('https://backend.invalid/functions/v1/public-catalog', {
        method: 'POST',
        headers: { origin: 'https://review.invalid', 'content-type': 'application/json' },
        body,
      }),
      { remoteAddr: { hostname: '127.0.0.1' } },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code } })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://review.invalid')
    expect(gateway).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  },
)

it('accepts omitted and object args through the handler', async () => {
  const rpc = vi.fn(async () => ({ data: [], error: null }))
  const gateway = vi.fn(() => ({ rpc }))
  const verify = vi.fn(async () => null)
  const handler = createPublicCatalogHandler(
    {
      url: 'https://backend.invalid',
      anonKey: 'anon',
      gatewayJwt: 'gateway',
      allowedOrigin: 'https://review.invalid',
      rateSalt: 'salt',
      publicTest: false,
    },
    { gateway, verify },
  )

  for (const [body, args] of [
    [{ operation: 'list' }, {}],
    [{ operation: 'list', args: { p_limit: 5 } }, { p_limit: 5 }],
  ] as const) {
    const response = await handler(
      new Request('https://backend.invalid/functions/v1/public-catalog', {
        method: 'POST',
        headers: { origin: 'https://review.invalid', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { remoteAddr: { hostname: '127.0.0.1' } },
    )
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenLastCalledWith(
      'synthetic_catalog_gateway_request',
      expect.objectContaining({ p_args: args }),
    )
  }
})
