import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dispatchSubscriptionChange,
  recordServicingEvent,
  cancellationPortal,
  refundCharge,
} from '../../../supabase/functions/_shared/billing-servicing-provider'

afterEach(() => vi.unstubAllGlobals())

describe('durable paid servicing boundary', () => {
  it('attaches a downgrade schedule to the same subscription immediately and keeps current price until renewal', async () => {
    const context = {
      state: 'pending',
      subscriptionId: 'sub_servicing178',
      customerId: 'cus_servicing178',
      priceCents: 1200,
      currency: 'usd',
      sourceTier: 'full_gallery',
      targetTier: 'gallery',
      request: null,
    }
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => ({
      data:
        name === 'billing_bind_provider_mutation'
          ? { path: args.p_path, parameters: args.p_parameters }
          : context,
      error: null,
    }))
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...subscription('price_full178999'), current_period_end: 200 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'price_gallery178',
          product: 'prod_servicing178',
          unit_amount: 1200,
          currency: 'usd',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'sub_sched_servicing178',
          subscription: 'sub_servicing178',
          customer: 'cus_servicing178',
          status: 'active',
          end_behavior: 'release',
          current_phase: { start_date: 100, end_date: 200 },
          phases: [
            { start_date: 100, end_date: 200, items: [{ price: 'price_full178999', quantity: 1 }] },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: 'sub_sched_servicing178', subscription: 'sub_servicing178' }),
      )
    vi.stubGlobal('fetch', fetch)
    expect(
      await dispatchSubscriptionChange(
        rpc,
        { providerGateAccepted: true, secretKey: 'fixture' },
        changeId,
      ),
    ).toBe(true)
    expect(fetch.mock.calls[2][1].body).toBe('from_subscription=sub_servicing178')
    const form = new URLSearchParams(fetch.mock.calls[3][1].body)
    expect(form.get('phases[0][items][0][price]')).toBe('price_full178999')
    expect(form.get('phases[0][end_date]')).toBe('200')
    expect(form.get('phases[1][items][0][price]')).toBe('price_gallery178')
    expect(form.get('proration_behavior')).toBe('none')
    expect(rpc.mock.calls.some(([name]) => name === 'billing_record_change_event')).toBe(false)
  })

  it('opening cancellation for an attached schedule only returns the application confirmation', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ...subscription(), schedule: 'sub_sched_servicing178' }))
    vi.stubGlobal('fetch', fetch)
    expect(
      await cancellationPortal(
        { providerGateAccepted: true, secretKey: 'fixture', appOrigin: 'https://trail.test' },
        { subscriptionId: 'sub_servicing178', customerId: 'cus_servicing178' },
        undefined,
      ),
    ).toEqual({ url: 'https://trail.test/store-portal/billing' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].method).toBe('GET')
  })

  it('recovers an already-successful full refund after response loss without creating another refund', async () => {
    const id = '17800000-0000-4000-8000-000000000055'
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === 'billing_prepare_charge_refund'
          ? {
              state: 'pending',
              chargeId: 'ch_servicing178',
              amount: 1200,
              attempt: 1,
              providerRefundId: null,
            }
          : 'succeeded',
      error: null,
    }))
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        has_more: false,
        data: [
          {
            id: 're_servicing178',
            charge: 'ch_servicing178',
            amount: 1200,
            status: 'succeeded',
            metadata: { servicing_refund_id: id },
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetch)
    expect(await refundCharge(rpc, { providerGateAccepted: true, secretKey: 'fixture' }, id)).toBe(
      true,
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].method).toBe('GET')
  })

  const changeId = '17800000-0000-4000-8000-000000000041'
  const compensation = {
    state: 'compensation_pending',
    changeId,
    subscriptionId: 'sub_servicing178',
    customerId: 'cus_servicing178',
    targetPriceId: 'price_increment178',
    compensationItems: null,
    currentSubscriptionVersion: 4,
    currentPriceId: 'price_original178',
    request: { sourcePriceId: 'price_original178' },
  }
  function subscription(price = 'price_increment178', marker = changeId) {
    return {
      id: 'sub_servicing178',
      customer: 'cus_servicing178',
      status: 'active',
      schedule: null,
      metadata: { paid_change_id: marker },
      items: {
        has_more: false,
        data: [
          {
            id: 'si_servicing178',
            quantity: 1,
            price: { id: price, product: 'prod_servicing178' },
          },
        ],
      },
    }
  }
  function prorations(invoice: string | null = null) {
    return {
      has_more: false,
      data: [
        {
          id: 'ii_increment178',
          subscription: 'sub_servicing178',
          customer: 'cus_servicing178',
          proration: true,
          price: { id: 'price_increment178' },
          amount: 1000,
          period: { start: 100, end: 200 },
          invoice,
        },
        {
          id: 'ii_credit178999',
          subscription: 'sub_servicing178',
          customer: 'cus_servicing178',
          proration: true,
          price: { id: 'price_original178' },
          amount: -500,
          period: { start: 100, end: 200 },
          invoice,
        },
      ],
    }
  }
  function compensationRpc(currentPriceId = 'price_original178') {
    return vi.fn(async (name: string, args: Record<string, unknown>) => ({
      data:
        name === 'billing_prepare_subscription_change'
          ? { ...compensation, currentPriceId }
          : name === 'billing_bind_compensation_items'
            ? args.p_items
            : 'compensated',
      error: null,
    }))
  }

  it('removes exactly the bound pending prorations and restores the existing subscription without canceling it', async () => {
    const rpc = compensationRpc()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(subscription()))
      .mockResolvedValueOnce(Response.json(prorations()))
      .mockResolvedValueOnce(Response.json({ id: 'ii_increment178', deleted: true }))
      .mockResolvedValueOnce(Response.json({ id: 'ii_credit178999', deleted: true }))
      .mockResolvedValueOnce(Response.json(subscription('price_original178')))
      .mockResolvedValueOnce(Response.json(subscription('price_original178')))
      .mockResolvedValueOnce(Response.json({ has_more: false, data: [] }))
    vi.stubGlobal('fetch', fetch)
    expect(
      await dispatchSubscriptionChange(
        rpc,
        { providerGateAccepted: true, secretKey: 'fixture' },
        changeId,
      ),
    ).toBe(true)
    expect(rpc).toHaveBeenCalledWith('billing_bind_compensation_items', {
      p_change_id: changeId,
      p_items: ['ii_increment178', 'ii_credit178999'],
    })
    expect(fetch.mock.calls[4][1].body).toContain('proration_behavior=none')
    expect(fetch.mock.calls.some(([, init]) => String(init.body).includes('cancel'))).toBe(false)
    expect(rpc).toHaveBeenCalledWith(
      'billing_record_change_compensation',
      expect.objectContaining({
        p_observation: expect.objectContaining({ currentSubscriptionVersion: 4 }),
      }),
    )
  })

  it('refunds the exact charged increment with tax and preserves a later valid provider change', async () => {
    const rpc = compensationRpc('price_later178999')
    const later = subscription('price_later178999', 'later-valid-change')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(later))
      .mockResolvedValueOnce(Response.json(prorations('in_servicing178')))
      .mockResolvedValueOnce(
        Response.json({
          id: 'in_servicing178',
          customer: 'cus_servicing178',
          subscription: 'sub_servicing178',
          status: 'paid',
          charge: 'ch_servicing178',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          has_more: false,
          data: [
            {
              invoice_item: 'ii_increment178',
              amount_excluding_tax: 1000,
              tax_amounts: [{ amount: 100 }],
            },
            {
              invoice_item: 'ii_credit178999',
              amount_excluding_tax: -500,
              tax_amounts: [{ amount: -50 }],
            },
            { invoice_item: 'ii_unrelated178', amount_excluding_tax: 3000, tax_amounts: [] },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ has_more: false, data: [] }))
      .mockResolvedValueOnce(Response.json({ has_more: false, data: [] }))
      .mockResolvedValueOnce(
        Response.json({
          id: 're_compensate178',
          charge: 'ch_servicing178',
          amount: 550,
          status: 'succeeded',
        }),
      )
      .mockResolvedValueOnce(Response.json(later))
      .mockResolvedValueOnce(Response.json(prorations('in_servicing178')))
    vi.stubGlobal('fetch', fetch)
    expect(
      await dispatchSubscriptionChange(
        rpc,
        { providerGateAccepted: true, secretKey: 'fixture' },
        changeId,
      ),
    ).toBe(true)
    expect(fetch.mock.calls[6][1].body).toContain('amount=550')
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
  })

  it('credits an unpaid incremental invoice without cancelling the subscription', async () => {
    const rpc = compensationRpc('price_later178999')
    const later = subscription('price_later178999', 'later-valid-change')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(later))
      .mockResolvedValueOnce(Response.json(prorations('in_servicing178')))
      .mockResolvedValueOnce(
        Response.json({
          id: 'in_servicing178',
          customer: 'cus_servicing178',
          subscription: 'sub_servicing178',
          status: 'open',
          amount_remaining: 3500,
          charge: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          has_more: false,
          data: [
            { invoice_item: 'ii_increment178', amount_excluding_tax: 1000, tax_amounts: [] },
            { invoice_item: 'ii_credit178999', amount_excluding_tax: -500, tax_amounts: [] },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ has_more: false, data: [] }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'cn_servicing178',
          invoice: 'in_servicing178',
          customer: 'cus_servicing178',
          status: 'issued',
          amount: 500,
          pre_payment_amount: 500,
          post_payment_amount: 0,
        }),
      )
      .mockResolvedValueOnce(Response.json(later))
      .mockResolvedValueOnce(Response.json(prorations('in_servicing178')))
    vi.stubGlobal('fetch', fetch)
    expect(
      await dispatchSubscriptionChange(
        rpc,
        { providerGateAccepted: true, secretKey: 'fixture' },
        changeId,
      ),
    ).toBe(true)
    expect(fetch.mock.calls[5][0]).toContain('/credit_notes')
    expect(fetch.mock.calls[5][1].body).toContain('amount=500')
    expect(fetch.mock.calls[5][1].body).toContain('refund_amount=0')
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
  })

  it('keeps unknown financial state pending and cannot attest compensation', async () => {
    const rpc = compensationRpc()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(subscription()))
        .mockResolvedValueOnce(new Response('outage', { status: 503 })),
    )
    expect(
      await dispatchSubscriptionChange(
        rpc,
        { providerGateAccepted: true, secretKey: 'fixture' },
        changeId,
      ),
    ).toBe(false)
    expect(rpc.mock.calls.some(([name]) => name === 'billing_record_change_compensation')).toBe(
      false,
    )
  })

  it('makes no provider or database call while the provider gate is off', async () => {
    const rpc = vi.fn()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(
      await dispatchSubscriptionChange(
        rpc,
        { providerGateAccepted: false, secretKey: 'unused' },
        'change',
      ),
    ).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('replays the exact persisted provider form after a lost response, without allocating another price or schedule', async () => {
    const parameters = { 'phases[0][end_date]': '200', 'metadata[paid_change_id]': 'change178' }
    const rpc = vi.fn(async () => ({
      data: {
        state: 'pending',
        dispatchedAt: new Date().toISOString(),
        mutation: { path: 'subscription_schedules/sub_sched_servicing178', parameters },
      },
      error: null,
    }))
    const fetch = vi.fn(async () => Response.json({ id: 'sub_sched_servicing178' }))
    vi.stubGlobal('fetch', fetch)
    expect(
      await dispatchSubscriptionChange(
        rpc,
        { providerGateAccepted: true, secretKey: 'sk_test_fixture' },
        'change178',
      ),
    ).toBe(true)
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://api.stripe.com/v1/subscription_schedules/sub_sched_servicing178',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams(parameters).toString(),
        headers: expect.objectContaining({ 'Idempotency-Key': 'change178-modify' }),
      }),
    )
    expect(rpc.mock.calls).toHaveLength(1)
  })

  it('passes only verified subscription price and provider clock to the bound entitlement command', async () => {
    const rpc = vi.fn(async () => ({ data: 'applied', error: null }))
    const result = await recordServicingEvent(rpc, {
      id: 'evt_servicing178',
      type: 'customer.subscription.updated',
      created: 200,
      data: {
        object: {
          id: 'sub_servicing178',
          customer: 'cus_servicing178',
          status: 'active',
          current_period_end: 300,
          metadata: { paid_change_id: '17800000-0000-4000-8000-000000000041' },
          items: {
            has_more: false,
            data: [
              {
                id: 'si_servicing178',
                quantity: 1,
                price: { id: 'price_servicing178', product: 'prod_servicing178' },
              },
            ],
          },
        },
      },
    })
    expect(result).toBe('applied')
    expect(rpc).toHaveBeenCalledWith(
      'billing_record_change_event',
      expect.objectContaining({
        p_price_id: 'price_servicing178',
        p_event_time: '1970-01-01T00:03:20.000Z',
        p_subscription_id: 'sub_servicing178',
      }),
    )
  })

  it.each(['canceled', 'past_due', 'unpaid'])(
    'preserves %s lifecycle events during upgrade compensation',
    async (status) => {
      const rpc = vi.fn(async () => ({ data: 'compensation_pending', error: null }))
      expect(
        await recordServicingEvent(rpc, {
          id: 'evt_servicing178',
          type:
            status === 'canceled'
              ? 'customer.subscription.deleted'
              : 'customer.subscription.updated',
          created: 200,
          data: {
            object: {
              ...subscription('price_upgrade178', changeId),
              current_period_end: 300,
              status,
            },
          },
        }),
      ).toBeUndefined()
    },
  )

  it('does not swallow ordinary renewal or payment-failure events after a change completes', async () => {
    const rpc = vi.fn(async () => ({ data: 'change_complete', error: null }))
    expect(
      await recordServicingEvent(rpc, {
        id: 'evt_servicing178',
        type: 'customer.subscription.deleted',
        created: 200,
        data: {
          object: {
            id: 'sub_servicing178',
            customer: 'cus_servicing178',
            status: 'canceled',
            metadata: { paid_change_id: '17800000-0000-4000-8000-000000000041' },
          },
        },
      }),
    ).toBeUndefined()
  })
})
