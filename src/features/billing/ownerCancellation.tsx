import { useEffect, useRef, useState } from 'react'
import { GENERIC_BILLING_ERROR } from './billingClient'

const states = ['pending', 'reconciliation_pending', 'scheduled', 'completed', 'failed'] as const
type State = (typeof states)[number]
export interface OwnerCancellationContext {
  storeName: string
  paidThrough: string
  snapshot: string
  state: State | 'available'
  scheduledChanges: readonly { tier: 'free' | 'gallery' | 'full_gallery'; effectiveAt: string }[]
}
export interface OwnerCancellationClient {
  getContext(): Promise<OwnerCancellationContext | null>
  cancel(snapshot: string, consentKey: string, requestKey: string): Promise<{ state: State }>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isState(value: unknown): value is State {
  return states.some((state) => state === value)
}
export function createOwnerCancellationClient(
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): OwnerCancellationClient {
  async function call(name: string, args: Record<string, unknown>) {
    try {
      const result = await rpc(name, args)
      if (result.error) throw new Error(GENERIC_BILLING_ERROR)
      return result.data
    } catch {
      throw new Error(GENERIC_BILLING_ERROR)
    }
  }
  return {
    async getContext() {
      const value = await call('billing_get_owner_cancellation', {})
      if (value === null) return null
      if (
        !record(value) ||
        typeof value.storeName !== 'string' ||
        !value.storeName.trim() ||
        typeof value.paidThrough !== 'string' ||
        !Number.isFinite(Date.parse(value.paidThrough)) ||
        typeof value.snapshot !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.snapshot) ||
        (value.state !== 'available' && !isState(value.state)) ||
        !Array.isArray(value.scheduledChanges) ||
        value.scheduledChanges.some(
          (change: unknown) =>
            !record(change) ||
            !['free', 'gallery', 'full_gallery'].includes(String(change.tier)) ||
            typeof change.effectiveAt !== 'string' ||
            !Number.isFinite(Date.parse(change.effectiveAt)),
        )
      )
        throw new Error(GENERIC_BILLING_ERROR)
      return {
        storeName: value.storeName,
        paidThrough: value.paidThrough,
        snapshot: value.snapshot,
        state: value.state,
        scheduledChanges: value.scheduledChanges,
      }
    },
    async cancel(snapshot, consentKey, requestKey) {
      const receipt = await call('billing_record_owner_cancel_consent', {
        p_snapshot: snapshot,
        p_idempotency_key: consentKey,
      })
      if (
        !record(receipt) ||
        typeof receipt.consentId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(receipt.consentId) ||
        typeof receipt.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(receipt.expiresAt))
      )
        throw new Error(GENERIC_BILLING_ERROR)
      const result = await call('billing_request_owner_cancellation', {
        p_consent_id: receipt.consentId,
        p_idempotency_key: requestKey,
      })
      if (!record(result) || !isState(result.state)) throw new Error(GENERIC_BILLING_ERROR)
      return { state: result.state }
    },
  }
}

const messages: Record<State, string> = {
  pending: 'Cancellation requested. Your current paid access remains. Confirmation is pending.',
  reconciliation_pending:
    'Cancellation is being reconciled. The provider outcome is not confirmed. Your current paid access remains.',
  scheduled:
    'Renewal cancellation is confirmed. Your paid access continues through the date shown.',
  completed: 'The paid subscription has ended.',
  failed: 'Cancellation did not take effect. Refresh billing and try again, or contact support.',
}
export function OwnerCancellation({ client }: { client: OwnerCancellationClient }) {
  const [context, setContext] = useState<OwnerCancellationContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const keys = useRef({ consent: crypto.randomUUID(), request: crypto.randomUUID() })
  useEffect(() => {
    let active = true
    setLoading(true)
    setContext(null)
    setReviewing(false)
    setAgreed(false)
    setError(false)
    client
      .getContext()
      .then((value) => {
        if (active) setContext(value)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [client, attempt])
  async function confirm() {
    if (!context || !agreed || busy) return
    setBusy(true)
    setError(false)
    try {
      const result = await client.cancel(
        context.snapshot,
        keys.current.consent,
        keys.current.request,
      )
      setContext({ ...context, state: result.state })
      setReviewing(false)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  if (loading) return <p role="status">Checking cancellation availability…</p>
  if (!context && !error) return <p>No billing actions are available in this workspace.</p>
  return (
    <section aria-label="Renewal cancellation">
      {error && (
        <p role="alert">{GENERIC_BILLING_ERROR} Refresh billing before confirming again.</p>
      )}
      {context && (
        <>
          {context.state !== 'available' && <p role="status">{messages[context.state]}</p>}
          {context.state === 'available' && !reviewing && (
            <button
              className="button"
              onClick={() => {
                keys.current = { consent: crypto.randomUUID(), request: crypto.randomUUID() }
                setReviewing(true)
              }}
            >
              Cancel renewal
            </button>
          )}
          {reviewing && (
            <>
              <h2>Confirm cancellation for {context.storeName}</h2>
              {context.scheduledChanges.map((change, index) => (
                <p key={index}>
                  Scheduled change to{' '}
                  {change.tier === 'free'
                    ? 'Free'
                    : change.tier === 'gallery'
                      ? 'Gallery'
                      : 'Full Gallery'}{' '}
                  on{' '}
                  {new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
                    new Date(change.effectiveAt),
                  )}{' '}
                  will be superseded.
                </p>
              ))}
              <p>
                Renewal will stop at the end of your paid period on{' '}
                {new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
                  new Date(context.paidThrough),
                )}
                . Your paid access continues until then. Any scheduled plan change will be
                superseded. This action does not request a refund.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={agreed}
                  disabled={busy}
                  onChange={(event) => setAgreed(event.target.checked)}
                />{' '}
                I confirm cancellation at the end of this paid period.
              </label>
              <button
                className="button"
                disabled={!agreed || busy || error}
                onClick={() => void confirm()}
              >
                {busy ? 'Requesting cancellation…' : 'Confirm cancellation'}
              </button>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  setReviewing(false)
                  setAgreed(false)
                }}
              >
                Keep renewal
              </button>
            </>
          )}
        </>
      )}
      {(error || (context && context.state !== 'available')) && (
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Refresh billing
        </button>
      )}
    </section>
  )
}
