import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { afterEach, expect, it, vi } from 'vitest'
import * as provider from '../../../supabase/functions/_shared/billing-provider'

afterEach(() => vi.unstubAllGlobals())

const env: provider.BillingProviderEnv = {
  referenceKeys: { v1: 'ab'.repeat(32) },
  referenceKeyVersion: 'v1',
  appOrigin: 'https://trail.test',
  secretKey: 'sk_test_fixture',
  webhookSecret: 'fixture-webhook',
  providerGateAccepted: true,
  providerIdHmacSecret: 'fixture-hmac',
  providerIdHmacKeyVersion: 1,
}
type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>

function edge(name: string, rpc: Rpc) {
  let handler: ((request: Request) => Promise<Response>) | undefined
  const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(compiled, {
    exports: {},
    Request,
    Response,
    URL,
    Date,
    require: (module: string) =>
      module.startsWith('npm:')
        ? { createClient: () => ({ rpc }) }
        : { ...provider, loadBillingProviderEnv: () => env },
    Deno: {
      env: { get: () => 'fixture-config' },
      serve: (callback: typeof handler) => {
        handler = callback
      },
    },
  })
  if (!handler) throw new Error('Edge handler missing')
  return handler
}

function signed(type: string, object: Record<string, unknown>, valid = true) {
  const created = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({ id: 'evt_issue177edge01', created, type, data: { object } })
  const signature = createHmac('sha256', valid ? 'fixture-webhook' : 'wrong-key')
    .update(`${created}.${body}`)
    .digest('hex')
  return new Request('https://edge.test', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': `t=${created},v1=${signature}` },
  })
}

it('executes signed servicing webhooks and denies unpaid or invalid signatures', async () => {
  const rpc = vi.fn<Rpc>(async (name) => ({
    data: name === 'billing_get_webhook_mode' ? 'servicing_only' : 'applied',
    error: null,
  }))
  const handler = edge('store-billing-webhook', rpc)
  const checkout = {
    id: 'cs_issue177edge01',
    customer: 'cus_issue177edge',
    subscription: 'sub_issue177edge',
    payment_status: 'unpaid',
    metadata: { hmac_key_version: '1' },
  }
  expect((await handler(signed('checkout.session.completed', checkout, false))).status).toBe(400)
  expect(rpc).not.toHaveBeenCalled()
  expect(
    await (await handler(signed('checkout.session.completed', checkout))).json(),
  ).toMatchObject({ result: 'payment_pending' })
  expect(rpc.mock.calls.some(([name]) => name === 'billing_record_checkout_event')).toBe(false)
  await handler(
    signed('checkout.session.async_payment_succeeded', { ...checkout, payment_status: 'paid' }),
  )
  expect(rpc.mock.calls.some(([name]) => name === 'billing_record_checkout_event')).toBe(true)
})

it('retries the real Checkout endpoint with the identical frozen provider request', async () => {
  let frozen: unknown
  const rpc: Rpc = async (name, args) => {
    if (name === 'billing_get_capability') return { data: { enabled: true }, error: null }
    if (name === 'billing_create_checkout_session')
      return {
        data: {
          checkoutSessionId: '17700000-0000-4000-8000-000000000001',
          priceCents: 1200,
          currency: 'USD',
          state: 'open',
          expiresAt: new Date(Date.now() + 1800000).toISOString(),
        },
        error: null,
      }
    if (name === 'billing_prepare_checkout_provider') {
      frozen ??= args?.p_request
      return { data: frozen, error: null }
    }
    return { data: true, error: null }
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ id: 'cs_issue177edge01', url: 'https://checkout.stripe.com/session' }),
  )
  vi.stubGlobal('fetch', fetch)
  const handler = edge('store-billing-checkout', rpc)
  const request = () =>
    new Request('https://edge.test', {
      method: 'POST',
      headers: { origin: env.appOrigin!, authorization: 'Bearer fixture' },
      body: JSON.stringify({
        storeId: '17700000-0000-4000-8000-000000000001',
        idempotencyKey: '17700000-0000-4000-8000-000000000002',
        consentId: '17700000-0000-4000-8000-000000000003',
        tier: 'gallery',
        commercialConfigVersion: 177,
      }),
    })
  expect((await handler(request())).status).toBe(200)
  expect((await handler(request())).status).toBe(200)
  expect(fetch.mock.calls).toHaveLength(2)
  expect(fetch.mock.calls[0][1]?.body).toEqual(fetch.mock.calls[1][1]?.body)
  expect(fetch.mock.calls[0][1]?.headers).toEqual(fetch.mock.calls[1][1]?.headers)
})

it('recovers response loss on one refund key, then a failed refund on a new key', async () => {
  let attempt = 1
  let failed = false
  const rpc: Rpc = async (name, args) => {
    if (name === 'billing_reserve_refund_attempt') {
      if (failed) {
        attempt++
        failed = false
      }
      return {
        data: {
          state: 'queued',
          attempt,
          eventId: 'evt_issue177edge01',
          subscriptionId: 'sub_issue177edge',
        },
        error: null,
      }
    }
    failed = args?.p_provider_state === 'failed'
    return { data: failed ? 'refund_failed' : 'refunded', error: null }
  }
  let lost = true
  const keys: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/subscriptions/'))
        return Response.json({
          status: 'canceled',
          latest_invoice: { payment_intent: 'pi_issue177edge01' },
        })
      const key = (init?.headers as Record<string, string>)['Idempotency-Key']
      keys.push(key)
      if (lost) {
        lost = false
        throw new Error('response lost')
      }
      return Response.json({
        id: `re_issue177edge0${attempt}`,
        status: attempt === 1 ? 'failed' : 'succeeded',
      })
    }),
  )
  const binding = { digest: 'ab'.repeat(32), keyVersion: 1 }
  expect(await provider.reconcileCheckoutRefund(rpc, env, 'cs_issue177edge01', binding)).toBeNull()
  expect(await provider.reconcileCheckoutRefund(rpc, env, 'cs_issue177edge01', binding)).toBe(
    'refunded',
  )
  expect(keys).toEqual([
    'evt_issue177edge01-refund-1',
    'evt_issue177edge01-refund-1',
    'evt_issue177edge01-refund-2',
  ])
})

it('retains historical provider bindings after key rotation', async () => {
  const before = await provider.providerIdHmac(env, 'cs_issue177edge01')
  const after = await provider.providerIdHmac(
    {
      ...env,
      providerIdHmacSecret: 'new-key',
      providerIdHmacKeyVersion: 2,
      providerIdHmacKeys: { '1': 'fixture-hmac' },
    },
    'cs_issue177edge01',
    1,
  )
  expect(after).toEqual(before)
})

it('encrypts provider references and expires hosted sessions only with provider confirmation', async () => {
  const encrypted = await provider.checkoutReference(env, 'cs_issue177edge01')
  expect(encrypted).not.toContain('cs_issue177edge01')
  expect(await provider.checkoutReference(env, encrypted!, true)).toBe('cs_issue177edge01')
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ status: 'open' }))
    .mockRejectedValueOnce(new Error('response lost'))
    .mockResolvedValueOnce(Response.json({ status: 'expired' }))
  vi.stubGlobal('fetch', fetch)
  expect(await provider.expireProviderCheckout(env, 'cs_issue177edge01')).toBe(false)
  expect(await provider.expireProviderCheckout(env, 'cs_issue177edge01')).toBe(true)
  expect(fetch.mock.calls.filter(([, args]) => args?.method === 'POST')).toHaveLength(1)
})

it('executes the expiry worker and records only confirmed provider expiry', async () => {
  const ciphertext = await provider.checkoutReference(env, 'cs_issue177edge01')
  const rpc = vi.fn<Rpc>(async (name) => ({
    data:
      name === 'billing_due_checkout_expiry'
        ? [{ ciphertext, hmac: 'ab'.repeat(32), keyVersion: 1 }]
        : 'expired',
    error: null,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'expired' })),
  )
  const handler = edge('store-billing-expiry', rpc)
  expect(
    (
      await handler(
        new Request('https://edge.test', {
          method: 'POST',
          headers: { 'x-scheduler-secret': 'fixture-config' },
        }),
      )
    ).status,
  ).toBe(200)
  expect(rpc.mock.calls.some(([name]) => name === 'billing_record_checkout_expired')).toBe(true)
})
