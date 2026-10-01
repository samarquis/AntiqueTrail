import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_BILLING_ERROR } from './billingClient'

type Tier = 'free' | 'gallery' | 'full_gallery'
type SubscriptionState = 'none' | 'active' | 'past_due' | 'grace' | 'canceled'

export interface OwnerBillingStatus {
  tier: Tier
  subscriptionState: SubscriptionState
  paidThrough: string | null
  salesOpen: boolean
  availableActions: readonly []
}

export interface OwnerBillingStatusClient {
  getStatus(): Promise<OwnerBillingStatus>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStatus(value: unknown): value is OwnerBillingStatus {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort().join(',')
  return (
    keys === 'availableActions,paidThrough,salesOpen,subscriptionState,tier' &&
    (value.tier === 'free' || value.tier === 'gallery' || value.tier === 'full_gallery') &&
    (value.subscriptionState === 'none' ||
      value.subscriptionState === 'active' ||
      value.subscriptionState === 'past_due' ||
      value.subscriptionState === 'grace' ||
      value.subscriptionState === 'canceled') &&
    (value.paidThrough === null ||
      (typeof value.paidThrough === 'string' && Number.isFinite(Date.parse(value.paidThrough)))) &&
    typeof value.salesOpen === 'boolean' &&
    Array.isArray(value.availableActions) &&
    value.availableActions.length === 0
  )
}

export function createOwnerBillingStatusClient(
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): OwnerBillingStatusClient {
  return {
    async getStatus() {
      try {
        const result = await rpc('billing_get_owner_status', {})
        if (result.error || !isStatus(result.data)) throw new Error(GENERIC_BILLING_ERROR)
        return result.data
      } catch {
        throw new Error(GENERIC_BILLING_ERROR)
      }
    },
  }
}

function tierLabel(value: Tier) {
  if (value === 'free') return 'Free'
  return value === 'gallery' ? 'Gallery' : 'Full Gallery'
}

function stateLabel(value: SubscriptionState) {
  if (value === 'none') return 'No paid subscription'
  if (value === 'past_due') return 'Past due'
  if (value === 'grace') return 'Grace period'
  return value === 'canceled' ? 'Canceled' : 'Active'
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  )
}

export function OwnerBillingStatusPage({ client }: { client: OwnerBillingStatusClient }) {
  const [status, setStatus] = useState<OwnerBillingStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    setStatus(null)
    setFailed(false)
    client.getStatus().then(
      (next) => {
        if (current) setStatus(next)
      },
      () => {
        if (current) setFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [client, attempt])

  return (
    <main>
      <section className="page-card" aria-labelledby="owner-billing-heading">
        <h1 id="owner-billing-heading">Billing status</h1>
        {!status && !failed && <p role="status">Checking billing status…</p>}
        {failed && (
          <>
            <p role="alert">{GENERIC_BILLING_ERROR}</p>
            <button className="button" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </button>
          </>
        )}
        {status && (
          <>
            <dl>
              <div>
                <dt>Plan</dt>
                <dd>{tierLabel(status.tier)}</dd>
              </div>
              <div>
                <dt>Subscription status</dt>
                <dd>{stateLabel(status.subscriptionState)}</dd>
              </div>
              {status.paidThrough && (
                <div>
                  <dt>Paid through</dt>
                  <dd>{dateLabel(status.paidThrough)}</dd>
                </div>
              )}
              <div>
                <dt>Paid plan sales</dt>
                <dd>{status.salesOpen ? 'Open' : 'Closed'}</dd>
              </div>
            </dl>
            {!status.salesOpen && <p>Paid plan sales are closed.</p>}
            <p>No billing actions are available in this workspace.</p>
          </>
        )}
        <p>
          <Link to="/owner/stores">Back to your stores</Link>
        </p>
      </section>
    </main>
  )
}
