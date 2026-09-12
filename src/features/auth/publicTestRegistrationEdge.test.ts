// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import { handleAccountRegistration } from '../../../supabase/functions/_shared/account-registration'
import {
  validateRegistrationEndpoints,
  withDeadline,
} from '../../../supabase/functions/_shared/registration-config'

const origin = 'https://antique-trail.vercel.app'
function setup(overrides: Record<string, string> = {}) {
  let handler: (request: Request) => Promise<Response>
  const rpc = vi.fn().mockResolvedValue({ data: { state: 'blocked' }, error: null })
  const createClient = vi.fn(() => ({ rpc }))
  const fetch = vi.fn()
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://uaupykgpegbseboklubv.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    APP_ORIGIN: origin,
    REGISTRATION_APPROVED_APP_ORIGIN: origin,
    REGISTRATION_APPROVED_SUPABASE_ORIGIN: 'https://uaupykgpegbseboklubv.supabase.co',
    REGISTRATION_EMAIL_HMAC_SECRET: 'fixture-only-secret-at-least-32-characters',
    REGISTRATION_MAIL_ENDPOINT: 'https://mail.example.test/send',
    REGISTRATION_APPROVED_MAIL_ENDPOINT: 'https://mail.example.test/send',
    REGISTRATION_MAIL_TOKEN: 'fixture-mail',
    PUBLIC_TEST_MODE: 'true',
    ...overrides,
  }
  runInNewContext(
    ts.transpileModule(readFileSync('supabase/functions/account-registration/index.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports: {},
      Request,
      Response,
      Headers,
      URL,
      TextEncoder,
      crypto: webcrypto,
      fetch,
      require: (name: string) =>
        name.includes('registration-config')
          ? { validateRegistrationEndpoints, withDeadline }
          : name.includes('_shared/account-registration')
            ? { handleAccountRegistration }
            : { createClient },
      Deno: {
        env: { get: (name: string) => values[name] },
        serve: (callback: typeof handler) => {
          handler = callback
        },
      },
    },
  )
  return { handler: (request: Request) => handler(request), rpc, createClient, fetch }
}
function request(requestOrigin: string | null, method = 'POST') {
  return new Request('https://uaupykgpegbseboklubv.supabase.co/functions/v1/account-registration', {
    method,
    headers: requestOrigin ? { Origin: requestOrigin } : {},
    ...(method === 'POST'
      ? {
          body: JSON.stringify({
            email: 'tester@example.test',
            password: 'fixture-long-password',
            ageAttested: true,
            requestId: '37600000-0000-4000-8000-000000000001',
          }),
        }
      : {}),
  })
}
it.each([null, 'https://evil.example'])(
  'rejects %s origin before any reservation/provider/mail work',
  async (badOrigin) => {
    const { handler, rpc, createClient, fetch } = setup()
    expect((await handler(request(badOrigin))).status).toBe(403)
    expect(createClient).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  },
)
it('rejects other methods before creating a service client', async () => {
  const { handler, createClient } = setup()
  expect((await handler(request(origin, 'GET'))).status).toBe(403)
  expect(createClient).not.toHaveBeenCalled()
})
it('rejects another configured backend in public-test mode', async () => {
  const { handler, rpc, createClient, fetch } = setup({ SUPABASE_URL: 'https://other.supabase.co' })
  expect((await handler(request(origin))).status).toBe(503)
  expect(createClient).not.toHaveBeenCalled()
  expect(rpc).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it('allows the exact origin to reach the existing registration reservation protocol', async () => {
  const { handler, rpc, fetch } = setup()
  await handler(request(origin))
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    'begin_account_registration',
    expect.objectContaining({ p_age_18_attestation: true }),
  )
  expect(fetch).not.toHaveBeenCalled()
})
