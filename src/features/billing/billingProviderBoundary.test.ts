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
})
