import { syntheticPaidOffer } from './paidOffer'
import type { SalesClient } from '../features/billing/sales'
import type { ServicingClient } from '../features/billing/servicing'

/** Local review composition only; no RPC, provider calls, or activation changes. */
export function billingServicingReviewClients(url: string): {
  billingServicing?: ServicingClient
  billingSales?: SalesClient
} {
  const mode = new URL(url, 'http://127.0.0.1').searchParams.get('reviewBilling')
  if (mode !== 'sales_open' && mode !== 'servicing_only' && mode !== 'off_prelaunch') return {}
  let pending = false
  const context: Awaited<ReturnType<ServicingClient['getContext']>> = {
    storeId: '17800000-0000-4000-8000-000000000001',
    subscriptionVersion: 3,
    tierVersion: 2,
    tier: 'gallery',
    salesOpen: mode === 'sales_open',
    state: 'active',
    paidThrough: '2026-10-01T00:00:00Z',
    configVersion: 178,
    configDigest: 'a'.repeat(64),
    galleryPriceCents: 1200,
    fullGalleryPriceCents: 1900,
    currency: 'USD',
    terms: [
      'Tax is calculated by the provider.',
      'Renews monthly until canceled.',
      'Request a full refund within 48 hours of a charge.',
      'Upgrade immediately with proration after verification.',
      'Downgrades apply at the cycle boundary.',
      'Failed payments retain access for 14 days.',
      'Photos beyond the new limit hide for 30 days before deletion.',
    ],
    scheduledTier: 'free',
    scheduledChangeId: '17800000-0000-4000-8000-000000000099',
    pending: false,
    charges: [],
  }
  return {
    billingSales: {
      async getOffer() {
        return mode === 'sales_open' ? syntheticPaidOffer : null
      },
      async getPurchase() {
        return mode === 'sales_open' &&
          new URL(url, 'http://localhost').searchParams.get('reviewPurchase') === 'free'
          ? { storeId: context.storeId, storeVersion: 0, offer: syntheticPaidOffer }
          : null
      },
      async checkout() {
        throw new Error('Synthetic review does not call Stripe.')
      },
    },
    billingServicing: {
      async getContext() {
        return mode === 'off_prelaunch' ? null : { ...context, pending }
      },
      async change() {
        pending = true
      },
      async refund() {
        pending = true
      },
    },
  }
}
