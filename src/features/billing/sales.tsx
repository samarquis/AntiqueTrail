import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_BILLING_ERROR, parseCommercialResearchConfig } from './billingClient'
import type { CommercialResearchConfig } from './types'

interface PurchaseContext {
  storeId: string
  storeVersion: number
  offer: CommercialResearchConfig
}
export interface SalesClient {
  getOffer(): Promise<CommercialResearchConfig | null>
  getPurchase(): Promise<PurchaseContext | null>
  checkout(
    context: PurchaseContext,
    tier: 'gallery' | 'full_gallery',
    consentKey: string,
    checkoutKey: string,
  ): Promise<string>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function createSalesClient(
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
  edge: (
    name: string,
    body: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): SalesClient {
  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await rpc(name, args)
    if (result.error) throw new Error(GENERIC_BILLING_ERROR)
    return result.data
  }
  return {
    async getOffer() {
      const value = await call('billing_get_sales_offer')
      return value === null ? null : parseCommercialResearchConfig(value, 'active')
    },
    async getPurchase() {
      const value = await call('billing_get_purchase_context')
      if (value === null) return null
      if (
        !record(value) ||
        typeof value.storeId !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(value.storeId) ||
        !Number.isSafeInteger(value.storeVersion) ||
        Number(value.storeVersion) < 0
      )
        throw new Error(GENERIC_BILLING_ERROR)
      return {
        storeId: value.storeId,
        storeVersion: Number(value.storeVersion),
        offer: parseCommercialResearchConfig(value.offer, 'active'),
      }
    },
    async checkout(context, tier, consentKey, checkoutKey) {
      const receipt = await call('billing_record_paid_tier_consent', {
        p_store_id: context.storeId,
        p_target_tier: tier,
        p_commercial_config_version: context.offer.version,
        p_disclosure_digest: context.offer.digest,
        p_expected_store_version: context.storeVersion,
        p_idempotency_key: consentKey,
      })
      if (!record(receipt) || typeof receipt.consentId !== 'string')
        throw new Error(GENERIC_BILLING_ERROR)
      const result = await edge('store-billing-checkout', {
        storeId: context.storeId,
        tier,
        consentId: receipt.consentId,
        commercialConfigVersion: context.offer.version,
        idempotencyKey: checkoutKey,
      })
      if (result.error || !record(result.data) || typeof result.data.url !== 'string')
        throw new Error(GENERIC_BILLING_ERROR)
      const destination = new URL(result.data.url)
      if (
        destination.origin !== 'https://checkout.stripe.com' ||
        destination.username ||
        destination.password
      )
        throw new Error(GENERIC_BILLING_ERROR)
      return destination.href
    },
  }
}
function OfferDetails({ offer }: { offer: CommercialResearchConfig }) {
  const price = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: offer.currency }).format(
      amount / 100,
    )
  return (
    <>
      <p>
        Free: cover plus five approved gallery photos, at no charge indefinitely for an eligible,
        current listing.
      </p>
      <p>
        Gallery: cover plus 15 approved gallery photos · {price(offer.galleryPriceCents)} per month.
      </p>
      <p>
        Full Gallery: cover plus no plan-count cap on approved gallery photos ·{' '}
        {price(offer.fullGalleryPriceCents)} per month.
      </p>
      <ul>
        {[
          offer.taxMode,
          offer.firstChargeRule,
          offer.renewalRule,
          offer.cancelAnytimeRule,
          offer.refundWindowRule,
          offer.upgradeProrationRule,
          offer.downgradeRule,
          offer.failedPaymentGraceRule,
          offer.hiddenPhotoDeletionRule,
        ].map((term, i) => (
          <li key={i}>{term}</li>
        ))}
      </ul>
      <p>
        Accepted files: {offer.fullGalleryLimits.acceptedFileTypes.join(', ')}; maximum{' '}
        {offer.fullGalleryLimits.maxFileBytes} bytes and {offer.fullGalleryLimits.maxWidthPixels} ×{' '}
        {offer.fullGalleryLimits.maxHeightPixels} pixels.
      </p>
      <ul>
        {[
          offer.fullGalleryLimits.uploadRateRule,
          offer.fullGalleryLimits.quotaOutageRule,
          offer.fullGalleryLimits.moderationAbuseRule,
          offer.fullGalleryLimits.reasonRecoveryAppealRule,
          offer.fullGalleryLimits.paidServiceRemedy,
        ].map((term, i) => (
          <li key={i}>{term}</li>
        ))}
      </ul>
      <p>
        Terms: {offer.termsVersion}; privacy: {offer.privacyVersion}; refunds:{' '}
        {offer.refundPolicyVersion}; support: {offer.supportPolicyVersion}; limits:{' '}
        {offer.fullGalleryLimitsVersion}.
      </p>
      <p>
        Payment buys photo capacity only. It does not buy publication, placement, ratings,
        verification, moderation outcomes, or shopper data.
      </p>
    </>
  )
}
export function PublicPaidPlans({ client }: { client?: SalesClient }) {
  const [offer, setOffer] = useState<CommercialResearchConfig | null>(null)
  useEffect(() => {
    let current = true
    let request = 0
    const refresh = () => {
      const id = ++request
      setOffer(null)
      client
        ?.getOffer()
        .then((next) => current && id === request && setOffer(next))
        .catch(() => {})
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      window.removeEventListener('focus', refresh)
    }
  }, [client])
  if (!offer) return null
  return (
    <section className="owner-acquisition__section" aria-labelledby="paid-plans-heading">
      <h2 id="paid-plans-heading">Optional photo memberships</h2>
      <OfferDetails offer={offer} />
      <Link to="/store-portal/plans">Review photo plans</Link>
    </section>
  )
}
export function PaidPurchasePage({
  client,
  servicing,
}: {
  client: SalesClient
  servicing?: ReactNode
}) {
  const [context, setContext] = useState<PurchaseContext | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [target, setTarget] = useState<'gallery' | 'full_gallery'>('gallery')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const keys = useRef({ consent: crypto.randomUUID(), checkout: crypto.randomUUID() })
  useEffect(() => {
    let current = true
    client
      .getPurchase()
      .then((next) => current && setContext(next))
      .catch(() => current && setError(GENERIC_BILLING_ERROR))
    return () => {
      current = false
    }
  }, [client])
  async function checkout() {
    if (!context || !agreed || busy) return
    setBusy(true)
    setError('')
    try {
      window.location.assign(
        await client.checkout(context, target, keys.current.consent, keys.current.checkout),
      )
    } catch {
      setError(GENERIC_BILLING_ERROR)
      const next = await client.getPurchase().catch(() => null)
      if (
        next &&
        (next.offer.digest !== context.offer.digest || next.storeVersion !== context.storeVersion)
      )
        keys.current = { consent: crypto.randomUUID(), checkout: crypto.randomUUID() }
      setContext(next)
      setAgreed(false)
    } finally {
      setBusy(false)
    }
  }
  if (!context)
    return (
      <>
        {error && <p role="alert">{error}</p>}
        {servicing}
      </>
    )
  return (
    <main>
      <section className="page-card" aria-labelledby="purchase-heading">
        <h1 id="purchase-heading">Photo plans</h1>
        <OfferDetails offer={context.offer} />
        <label>
          Photo plan
          <select
            value={target}
            disabled={busy}
            onChange={(event) => {
              setTarget(event.target.value === 'full_gallery' ? 'full_gallery' : 'gallery')
              setAgreed(false)
              keys.current = { consent: crypto.randomUUID(), checkout: crypto.randomUUID() }
            }}
          >
            <option value="gallery">Gallery</option>
            <option value="full_gallery">Full Gallery</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={agreed}
            disabled={busy}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          I agree to the exact prices, recurring charges, and terms shown above.
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="button" disabled={!agreed || busy} onClick={() => void checkout()}>
          Continue to secure Checkout
        </button>
        <p>
          <Link to="/store-portal/billing">Manage an existing membership</Link>
        </p>
      </section>
    </main>
  )
}
