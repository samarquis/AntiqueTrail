import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_BILLING_ERROR } from './billingClient'

type Tier = 'free' | 'gallery' | 'full_gallery'
interface ServicingContext {
  storeId: string
  subscriptionVersion: number
  tierVersion: number
  tier: Tier
  salesOpen: boolean
  state: string
  paidThrough: string
  configVersion: number
  configDigest: string
  galleryPriceCents: number
  fullGalleryPriceCents: number
  currency: string
  terms: string[]
  scheduledTier: Tier | null
  scheduledChangeId: string | null
  pending: boolean
  charges: {
    refundRequestId: string
    chargedAt: string
    amount: number
    currency: string
    state: string
  }[]
}

export interface ServicingClient {
  getContext(): Promise<ServicingContext | null>
  change(
    context: ServicingContext,
    target: Tier,
    consentKey: string,
    changeKey: string,
  ): Promise<void>
  refund(context: ServicingContext, refundRequestId: string, key: string): Promise<void>
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function tier(value: unknown): value is Tier {
  return value === 'free' || value === 'gallery' || value === 'full_gallery'
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}
function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}
function isContext(value: unknown): value is ServicingContext {
  return (
    record(value) &&
    uuid(value.storeId) &&
    integer(value.subscriptionVersion) &&
    integer(value.tierVersion) &&
    tier(value.tier) &&
    typeof value.salesOpen === 'boolean' &&
    typeof value.state === 'string' &&
    date(value.paidThrough) &&
    integer(value.configVersion) &&
    typeof value.configDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(value.configDigest) &&
    integer(value.galleryPriceCents) &&
    integer(value.fullGalleryPriceCents) &&
    typeof value.currency === 'string' &&
    /^[A-Z]{3}$/.test(value.currency) &&
    Array.isArray(value.terms) &&
    value.terms.every((term) => typeof term === 'string' && term.length > 0) &&
    (value.scheduledTier === null || tier(value.scheduledTier)) &&
    (value.scheduledChangeId === null || uuid(value.scheduledChangeId)) &&
    typeof value.pending === 'boolean' &&
    Array.isArray(value.charges) &&
    value.charges.every(
      (charge) =>
        record(charge) &&
        uuid(charge.refundRequestId) &&
        date(charge.chargedAt) &&
        integer(charge.amount) &&
        typeof charge.currency === 'string' &&
        /^[a-z]{3}$/.test(charge.currency) &&
        typeof charge.state === 'string',
    )
  )
}

export function createServicingClient(
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): ServicingClient {
  async function call(name: string, args: Record<string, unknown>) {
    const result = await rpc(name, args)
    if (result.error) throw new Error(GENERIC_BILLING_ERROR)
    return result.data
  }
  return {
    async getContext() {
      const value = await call('billing_get_servicing_context', {})
      if (value === null) return null
      if (!isContext(value)) throw new Error(GENERIC_BILLING_ERROR)
      return value
    },
    async change(context, target, consentKey, changeKey) {
      let consentId: string | null = null
      if (target === 'full_gallery') {
        const receipt = await call('billing_record_paid_change_consent', {
          p_store_id: context.storeId,
          p_subscription_version: context.subscriptionVersion,
          p_tier_version: context.tierVersion,
          p_config_version: context.configVersion,
          p_config_digest: context.configDigest,
          p_idempotency_key: consentKey,
          p_expected_future_change_id: context.scheduledChangeId,
        })
        if (!record(receipt) || !uuid(receipt.consentId)) throw new Error(GENERIC_BILLING_ERROR)
        consentId = receipt.consentId
      }
      const result = await call('billing_request_subscription_change', {
        p_store_id: context.storeId,
        p_target_tier: target,
        p_consent_id: consentId,
        p_subscription_version: context.subscriptionVersion,
        p_idempotency_key: changeKey,
      })
      if (!record(result) || !uuid(result.changeId)) throw new Error(GENERIC_BILLING_ERROR)
    },
    async refund(context, refundRequestId, key) {
      const result = await call('billing_request_charge_refund', {
        p_store_id: context.storeId,
        p_charge_id: refundRequestId,
        p_idempotency_key: key,
      })
      if (!record(result) || result.refundRequestId !== refundRequestId)
        throw new Error(GENERIC_BILLING_ERROR)
    },
  }
}

function label(value: Tier) {
  return value === 'free' ? 'Free' : value === 'gallery' ? 'Gallery' : 'Full Gallery'
}

export function PaidServicingPage({ client }: { client: ServicingClient }) {
  const [context, setContext] = useState<ServicingContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [target, setTarget] = useState<Tier | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const keys = useRef({
    consent: crypto.randomUUID(),
    change: crypto.randomUUID(),
    refunds: new Map<string, string>(),
  })
  useEffect(() => {
    let current = true
    client
      .getContext()
      .then((value) => {
        if (current) setContext(value)
      })
      .catch(() => {
        if (current) setError(GENERIC_BILLING_ERROR)
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [client])
  if (loading) return <p role="status">Loading membership…</p>
  if (!context) return error ? <p role="alert">{error}</p> : null
  const through = new Date(context.paidThrough).toLocaleDateString('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  })
  function review(next: Tier) {
    setTarget(next)
    setAgreed(false)
    setError('')
    setMessage('')
    keys.current.consent = crypto.randomUUID()
    keys.current.change = crypto.randomUUID()
  }
  async function confirm() {
    if (!context || !target || busy || (target === 'full_gallery' && !agreed)) return
    setBusy(true)
    setError('')
    try {
      await client.change(context, target, keys.current.consent, keys.current.change)
      setMessage(
        'Request recorded. Your current entitlement stays in place until the change is verified.',
      )
      setTarget(null)
      setContext(await client.getContext())
    } catch {
      setError(GENERIC_BILLING_ERROR)
    } finally {
      setBusy(false)
    }
  }
  async function refund(id: string) {
    if (!context || busy) return
    const key = keys.current.refunds.get(id) ?? crypto.randomUUID()
    keys.current.refunds.set(id, key)
    setBusy(true)
    setError('')
    try {
      await client.refund(context, id, key)
      setMessage(
        'Refund requested. Processing may take time. Your membership has not been canceled.',
      )
      setContext(await client.getContext())
    } catch {
      setError(GENERIC_BILLING_ERROR)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main>
      <section className="page-card" aria-labelledby="membership-heading">
        <h1 id="membership-heading">Photo membership</h1>
        <p>
          Current plan: {label(context.tier)} · Paid through {through} (UTC)
        </p>
        {context.scheduledTier && (
          <p>
            Scheduled change: {label(context.scheduledTier)} on {through}.
          </p>
        )}
        {context.pending && (
          <p role="status">A change is awaiting verification or reconciliation.</p>
        )}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        {!target && !context.pending && (
          <div>
            {context.salesOpen && context.state === 'active' && context.tier === 'gallery' && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => review('full_gallery')}
              >
                Review Full Gallery upgrade
              </button>
            )}
            {context.tier === 'full_gallery' && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => review('gallery')}
              >
                Review Gallery downgrade
              </button>
            )}
            {context.state !== 'canceled' && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => review('free')}
              >
                Cancel paid membership
              </button>
            )}
          </div>
        )}
        {target && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            <h2>{target === 'free' ? 'Confirm cancellation' : `Confirm ${label(target)}`}</h2>
            {target === 'full_gallery' ? (
              <>
                <p>
                  Full Gallery includes one cover and no plan-count cap on gallery photos. Published
                  file, upload, quota, and moderation rules still apply. Payment does not buy
                  publication, ranking, shopper data, or other rights.
                </p>
                <p>
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: context.currency,
                  }).format(context.fullGalleryPriceCents / 100)}{' '}
                  per month. The verified upgrade takes effect immediately with proration.
                </p>
                <ul>
                  {context.terms.map((term, index) => (
                    <li key={index}>{term}</li>
                  ))}
                </ul>
                {context.scheduledTier && (
                  <p>
                    Your accepted change to {label(context.scheduledTier)} on {through} remains
                    scheduled.
                  </p>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={agreed}
                    disabled={busy}
                    onChange={(event) => setAgreed(event.target.checked)}
                  />{' '}
                  I agree to this paid change and the displayed terms.
                </label>
              </>
            ) : (
              <p>
                Your current paid entitlement continues through {through}. Then{' '}
                {target === 'free'
                  ? 'the paid subscription ends and your listing moves to Free'
                  : 'your plan changes to Gallery without downgrade proration'}
                .{' '}
                {context.scheduledTier
                  ? `This replaces the scheduled change to ${label(context.scheduledTier)}.`
                  : ''}
              </p>
            )}
            <button
              type="submit"
              className="button"
              disabled={busy || (target === 'full_gallery' && !agreed)}
            >
              Confirm {target === 'free' ? 'cancellation' : 'change'}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setTarget(null)}
            >
              Keep current arrangement
            </button>
          </form>
        )}
        <h2>Recent charges</h2>
        <p>
          A full refund may be requested within 48 hours of a charge. Requesting a refund does not
          cancel your subscription.
        </p>
        {context.charges.map((charge) => (
          <div key={charge.refundRequestId}>
            <p>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: charge.currency,
              }).format(charge.amount / 100)}{' '}
              · {new Date(charge.chargedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC ·{' '}
              {charge.state}
            </p>
            {charge.state === 'available' && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void refund(charge.refundRequestId)}
              >
                Request full refund
              </button>
            )}
          </div>
        ))}
        <Link to="/store-portal/support">Get help or appeal</Link>
      </section>
    </main>
  )
}
