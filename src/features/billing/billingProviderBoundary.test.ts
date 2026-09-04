import { afterEach, describe, expect, it, vi } from 'vitest'
import { stripeFormPost } from '../../../supabase/functions/_shared/billing-provider'

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
})
