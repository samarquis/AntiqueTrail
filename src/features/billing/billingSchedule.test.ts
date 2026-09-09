import { describe, expect, it } from 'vitest'
import { scheduleChangeForm } from '../../../supabase/functions/_shared/billing-schedule'

function schedule() {
  return {
    status: 'active',
    end_behavior: 'cancel',
    current_phase: { start_date: 100, end_date: 200 },
    phases: [
      { start_date: 1, end_date: 100, items: [] },
      {
        start_date: 100,
        end_date: 200,
        currency: 'usd',
        items: [
          {
            price: 'price_original178',
            plan: 'price_original178',
            quantity: 1,
            tax_rates: ['txr_existing178'],
          },
        ],
        default_payment_method: 'pm_existing178',
        metadata: { retained: 'yes' },
        discounts: [{ coupon: 'coupon_existing178' }],
        proration_behavior: 'none',
      },
      {
        start_date: 200,
        end_date: 300,
        items: [{ price: 'price_future178', quantity: 1 }],
        metadata: { paid_change_id: 'accepted-future' },
        invoice_settings: { days_until_due: 7 },
        proration_behavior: 'none',
      },
    ],
  }
}

describe('same-subscription schedule changes', () => {
  it.each(['upgrade', 'restore'] as const)(
    'preserves future phases, cancellation and settings during %s',
    (kind) => {
      const before = schedule()
      const result = scheduleChangeForm(before, {
        kind,
        priceId: 'price_replacement178',
        periodEnd: 200,
        changeId: 'change178',
      })
      expect(result).toMatchObject({
        end_behavior: 'cancel',
        proration_behavior: kind === 'upgrade' ? 'create_prorations' : 'none',
        'phases[0][start_date]': '100',
        'phases[0][end_date]': '200',
        'phases[0][items][0][price]': 'price_replacement178',
        'phases[0][items][0][tax_rates][0]': 'txr_existing178',
        'phases[0][default_payment_method]': 'pm_existing178',
        'phases[0][discounts][0][coupon]': 'coupon_existing178',
        'phases[0][metadata][retained]': 'yes',
        'phases[1][items][0][price]': 'price_future178',
        'phases[1][metadata][paid_change_id]': 'accepted-future',
        'phases[1][invoice_settings][days_until_due]': '7',
        'phases[1][start_date]': '200',
        'phases[1][end_date]': '300',
      })
      expect(result).not.toHaveProperty('phases[0][items][0][plan]')
      expect(before).toEqual(schedule())
    },
  )

  it('replaces future target only on an explicit downgrade and retains current billing through cycle end', () => {
    const result = scheduleChangeForm(schedule(), {
      kind: 'downgrade',
      priceId: 'price_gallery178',
      periodEnd: 200,
      changeId: 'new-downgrade',
    })
    expect(result).toMatchObject({
      end_behavior: 'release',
      proration_behavior: 'none',
      'phases[0][items][0][price]': 'price_original178',
      'phases[0][end_date]': '200',
      'phases[1][start_date]': '200',
      'phases[1][iterations]': '1',
      'phases[1][items][0][price]': 'price_gallery178',
      'phases[1][items][0][tax_rates][0]': 'txr_existing178',
      'phases[1][metadata][paid_change_id]': 'new-downgrade',
      'phases[1][proration_behavior]': 'none',
    })
    expect(result).not.toHaveProperty('phases[1][end_date]')
  })

  it('ends Free at the boundary without a zero-price phase', () => {
    const result = scheduleChangeForm(schedule(), {
      kind: 'cancel',
      periodEnd: 200,
      changeId: 'cancel178',
    })
    expect(result).toMatchObject({
      end_behavior: 'cancel',
      proration_behavior: 'none',
      'phases[0][end_date]': '200',
      'phases[0][items][0][price]': 'price_original178',
    })
    expect(Object.keys(result ?? {}).some((key) => key.startsWith('phases[1]'))).toBe(false)
  })

  it('fails closed instead of erasing an unsupported provider setting', () => {
    const provider = schedule()
    Object.assign(provider.phases[2], { new_billing_setting: 'preserve-me' })
    expect(
      scheduleChangeForm(provider, {
        kind: 'upgrade',
        priceId: 'price_full178999',
        periodEnd: 200,
        changeId: 'change178',
      }),
    ).toBeNull()
  })

  it('rejects a stale current-phase boundary', () => {
    expect(
      scheduleChangeForm(schedule(), { kind: 'cancel', periodEnd: 100, changeId: 'cancel178' }),
    ).toBeNull()
  })
})
