// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import { validateRegistrationEndpoints } from '../../../supabase/functions/_shared/registration-config'

const origin = 'https://antique-trail.vercel.app'
const providerUserId = 'fbdf5a53-161e-4460-98ad-0e39408d8689'
const admissionId = '11111111-1111-4111-8111-111111111111'

function setup(user: {
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
}) {
  let handler: (request: Request) => Promise<Response>
  const rpc = vi.fn(async (name: string) => {
    if (name === 'complete_account_registration_callback') return { data: true, error: null }
    if (name === 'enqueue_account_registration_cleanup')
      return {
        data: {
          cleanupTicketId: '00000000-0000-4000-8000-000000000099',
          providerUserId,
          state: 'pending',
        },
        error: null,
      }
    return { data: null, error: new Error(`unexpected rpc ${name}`) }
  })
  const verifyOtp = vi.fn(async () => ({
    data: {
      session: {
        access_token: 'fixture-access',
        refresh_token: 'fixture-refresh',
        expires_at: 4_102_444_800,
        user: { id: providerUserId },
      },
      user: {
        id: providerUserId,
        app_metadata: user.app_metadata ?? {},
        user_metadata: user.user_metadata ?? {},
      },
    },
    error: null,
  }))
  const createClient = vi.fn(() => ({ auth: { verifyOtp }, rpc }))
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://uaupykgpegbseboklubv.supabase.co',
    SUPABASE_ANON_KEY: 'fixture-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    APP_ORIGIN: origin,
    REGISTRATION_APPROVED_APP_ORIGIN: origin,
    REGISTRATION_MAIL_ENDPOINT: 'https://mail.example.test/send',
    REGISTRATION_APPROVED_MAIL_ENDPOINT: 'https://mail.example.test/send',
    REGISTRATION_APPROVED_SUPABASE_ORIGIN: 'https://uaupykgpegbseboklubv.supabase.co',
    PUBLIC_TEST_MODE: 'false',
  }
  runInNewContext(
    ts.transpileModule(
      readFileSync('supabase/functions/account-registration-callback/index.ts', 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    {
      exports: {},
      Request,
      Response,
      Headers,
      URL,
      fetch: vi.fn(),
      require: (name: string) =>
        name.includes('registration-config') ? { validateRegistrationEndpoints } : { createClient },
      Deno: {
        env: { get: (name: string) => values[name] },
        serve: (callback: typeof handler) => {
          handler = callback
        },
      },
    },
  )
  return { handler: (request: Request) => handler(request), rpc, verifyOtp }
}

function request() {
  return new Request(
    'https://uaupykgpegbseboklubv.supabase.co/functions/v1/account-registration-callback',
    {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'verify', tokenHash: 'tk_hashed' }),
    },
  )
}

it('completes a verified registration whose admission id landed in user_metadata', async () => {
  const { handler, rpc, verifyOtp } = setup({
    user_metadata: { antique_trail_admission_id: admissionId },
  })
  const response = await handler(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ state: 'authenticated' })
  expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'tk_hashed', type: 'email' })
  expect(rpc).toHaveBeenCalledWith('complete_account_registration_callback', {
    p_admission_id: admissionId,
    p_provider_user_id: providerUserId,
  })
  expect(rpc).not.toHaveBeenCalledWith('enqueue_account_registration_cleanup', expect.anything())
})

it('still completes when the admission id sits in app_metadata', async () => {
  const { handler, rpc } = setup({ app_metadata: { antique_trail_admission_id: admissionId } })
  expect((await handler(request())).status).toBe(200)
  expect(rpc).toHaveBeenCalledWith('complete_account_registration_callback', {
    p_admission_id: admissionId,
    p_provider_user_id: providerUserId,
  })
})

it('blocks and enqueues cleanup when no admission metadata is readable', async () => {
  const { handler, rpc } = setup({})
  const response = await handler(request())
  expect(await response.json()).toEqual({ state: 'blocked' })
  expect(rpc).toHaveBeenCalledWith('enqueue_account_registration_cleanup', {
    p_admission_id: null,
    p_provider_user_id: providerUserId,
  })
  expect(rpc).not.toHaveBeenCalledWith('complete_account_registration_callback', expect.anything())
})
