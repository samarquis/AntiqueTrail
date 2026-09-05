import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  providerIdHmac,
  stripeCancelAndRefundSubscription,
  stripeFormPost,
} from '../../../supabase/functions/_shared/billing-provider'

afterEach(() => vi.unstubAllGlobals())

describe('commercial research provider boundary', () => {
  it('returns before network access even when Stripe credentials are present', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      stripeFormPost(
        { secretKey: 'sk_test_not_real', providerGateAccepted: true },
        '/v1/checkout/sessions',
        { mode: 'subscription' },
        'research-attempt',
        'commercial_research',
      ),
    ).resolves.toEqual({ ok: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns only a validated hosted Checkout identity and URL', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: 'cs_issue177valid01', url: 'https://checkout.stripe.test/session' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    )
    vi.stubGlobal('fetch', fetch)
    await expect(
      stripeFormPost(
        { secretKey: 'sk_test_not_real', providerGateAccepted: true },
        '/v1/checkout/sessions',
        { 'line_items[0][price_data][unit_amount]': '1200' },
        '17700000-0000-4000-8000-000000000041',
      ),
    ).resolves.toEqual({
      ok: true,
      id: 'cs_issue177valid01',
      url: 'https://checkout.stripe.test/session',
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('binds provider sessions with a versioned purpose HMAC', async () => {
    const first = await providerIdHmac(
      {
        providerIdHmacSecret: 'environment-specific-test-key',
        providerIdHmacKeyVersion: 3,
        providerGateAccepted: true,
      },
      'cs_issue177valid01',
    )
    const wrongKey = await providerIdHmac(
      {
        providerIdHmacSecret: 'different-environment-key',
        providerIdHmacKeyVersion: 3,
        providerGateAccepted: true,
      },
      'cs_issue177valid01',
    )
    expect(first).toMatchObject({ keyVersion: 3 })
    expect(first?.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(wrongKey?.digest).not.toBe(first?.digest)
  })

  it('idempotently cancels and confirms a full subscription refund', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          status: 'active',
          latest_invoice: { payment_intent: { id: 'pi_issue177payment01' } },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'sub_issue177stale', status: 'canceled' }))
      .mockResolvedValueOnce(Response.json({ id: 're_issue177refund01', status: 'succeeded' }))
    vi.stubGlobal('fetch', fetch)
    await expect(
      stripeCancelAndRefundSubscription(
        { secretKey: 'sk_test_not_real', providerGateAccepted: true },
        'sub_issue177stale',
        'evt_issue177stale01',
        'cs_issue177stale01',
      ),
    ).resolves.toEqual({ ok: true, refundId: 're_issue177refund01', status: 'succeeded' })
    expect(fetch.mock.calls.map((call) => [String(call[0]), call[1]?.method ?? 'GET'])).toEqual([
      [
        'https://api.stripe.com/v1/subscriptions/sub_issue177stale?expand[]=latest_invoice.payment_intent',
        'GET',
      ],
      ['https://api.stripe.com/v1/subscriptions/sub_issue177stale', 'DELETE'],
      ['https://api.stripe.com/v1/refunds', 'POST'],
    ])
  })

  it('returns durable pending refund identity for later verified updates', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          status: 'canceled',
          latest_invoice: { payment_intent: 'pi_issue177payment02' },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: 're_issue177refund02', status: 'pending' }))
    vi.stubGlobal('fetch', fetch)
    await expect(
      stripeCancelAndRefundSubscription(
        { secretKey: 'sk_test_not_real', providerGateAccepted: true },
        'sub_issue177stale',
        'evt_issue177stale01',
        'cs_issue177stale01',
      ),
    ).resolves.toEqual({ ok: true, refundId: 're_issue177refund02', status: 'pending' })
  })

  it('verifies the webhook before allowing servicing reconciliation', () => {
    const source = readFileSync('supabase/functions/store-billing-webhook/index.ts', 'utf8')
    expect(source.indexOf('verifyStripeSignature')).toBeLessThan(
      source.indexOf('billing_get_webhook_mode'),
    )
    expect(source).toContain("webhookMode.data !== 'servicing_only'")
    expect(source).toContain('reconcileCheckoutRefund')
    expect(source).toContain('billing_record_checkout_refund_state')
    expect(source).toContain("checkout.payment_status !== 'paid'")
    expect(source).toContain('checkout.session.async_payment_succeeded')
    expect(source).toContain('checkout.session.async_payment_failed')
    expect(source).toContain('refund.updated')
  })
})
