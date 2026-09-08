import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GENERIC_OWN_CONSENT_ERROR,
  type OwnConsentAvailable,
  type OwnConsentClient,
} from './ownConsentClient'

function unavailablePage() {
  return (
    <main>
      <section className="page-card" aria-labelledby="rg01-unavailable-heading">
        <p className="eyebrow">Research participation</p>
        <h1 id="rg01-unavailable-heading">Research participation unavailable</h1>
        <p role="alert">{GENERIC_OWN_CONSENT_ERROR}</p>
        <Link className="button" to="/more">
          Back to More
        </Link>
      </section>
    </main>
  )
}

function consented(status: OwnConsentAvailable) {
  return status.consentState === 'consented'
}

export function OwnConsentPage({ client }: { client: OwnConsentClient }) {
  const [status, setStatus] = useState<OwnConsentAvailable | null>(null)
  const [draftConsent, setDraftConsent] = useState(false)
  const [withdrawConfirmation, setWithdrawConfirmation] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [message, setMessage] = useState('')
  const [unavailable, setUnavailable] = useState(false)

  async function load() {
    setLoading(true)
    setError(false)
    setMessage('')
    try {
      const next = await client.getStatus()
      if (next.kind !== 'available') {
        setUnavailable(true)
        setStatus(null)
        return
      }
      setUnavailable(false)
      setStatus(next)
      setDraftConsent(consented(next))
      setWithdrawConfirmation(false)
    } catch {
      setError(true)
      setMessage(GENERIC_OWN_CONSENT_ERROR)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let current = true
    void client
      .getStatus()
      .then((next) => {
        if (!current) return
        if (next.kind !== 'available') {
          setUnavailable(true)
          return
        }
        setStatus(next)
        setDraftConsent(consented(next))
      })
      .catch(() => {
        if (current) {
          setError(true)
          setMessage(GENERIC_OWN_CONSENT_ERROR)
        }
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [client])

  async function save(nextConsent: boolean) {
    const previous = status
    setPending(true)
    setError(false)
    setMessage('')
    try {
      const next = await client.setConsent(nextConsent)
      if (next.kind !== 'available') throw new Error(GENERIC_OWN_CONSENT_ERROR)
      setStatus(next)
      setDraftConsent(consented(next))
      setWithdrawConfirmation(false)
      setMessage(nextConsent ? 'Your consent is saved.' : 'Your consent is withdrawn.')
    } catch {
      if (previous) setDraftConsent(consented(previous))
      setError(true)
      setMessage(GENERIC_OWN_CONSENT_ERROR)
    } finally {
      setPending(false)
    }
  }

  if (loading && !status && !unavailable)
    return (
      <main>
        <section className="page-card" aria-labelledby="rg01-loading-heading">
          <h1 id="rg01-loading-heading">Research participation</h1>
          <p role="status">Checking availability…</p>
        </section>
      </main>
    )
  if (unavailable) return unavailablePage()
  if (!status) {
    return (
      <main>
        <section className="page-card" aria-labelledby="rg01-error-heading">
          <h1 id="rg01-error-heading">Research participation</h1>
          <p role="alert">{message || GENERIC_OWN_CONSENT_ERROR}</p>
          <button className="button" type="button" onClick={() => void load()}>
            Retry
          </button>
          <p>
            <Link to="/more">Back to More</Link>
          </p>
        </section>
      </main>
    )
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="rg01-heading">
        <p className="eyebrow">Research participation</p>
        <h1 id="rg01-heading">RG-01 consent</h1>
        <p className="lede">
          Help us understand whether Antique Trail is useful for local shoppers. Participation is
          voluntary and does not change what you can browse or save.
        </p>
        <p>
          We use your consent and qualifying trip activity for the private RG-01 evidence review. We
          do not show you totals, other participants, or private activity here.
        </p>
        <p>
          You can withdraw at any time. Withdrawal stops your future inclusion; existing evidence
          follows the project&apos;s retention and linkage-purge rules.
        </p>
        <p role={error ? 'alert' : 'status'} aria-live="polite">
          {message || (consented(status) ? 'Consent is active.' : 'No current consent.')}
        </p>
        {error && (
          <p>
            <button className="button" type="button" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}
        {!consented(status) ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (draftConsent) void save(true)
            }}
          >
            <label htmlFor="rg01-consent">
              <input
                id="rg01-consent"
                type="checkbox"
                checked={draftConsent}
                disabled={pending}
                onChange={(event) => setDraftConsent(event.target.checked)}
              />
              I agree to participate in RG-01.
            </label>
            <button className="button" type="submit" disabled={pending || !draftConsent}>
              {pending ? 'Saving…' : 'Give consent'}
            </button>
          </form>
        ) : withdrawConfirmation ? (
          <section aria-labelledby="rg01-withdraw-heading">
            <h2 id="rg01-withdraw-heading">Withdraw your consent?</h2>
            <p>Your consent will stop future inclusion in RG-01 collection.</p>
            <button
              className="button"
              type="button"
              disabled={pending}
              onClick={() => void save(false)}
            >
              {pending ? 'Withdrawing…' : 'Withdraw consent'}
            </button>{' '}
            <button type="button" disabled={pending} onClick={() => setWithdrawConfirmation(false)}>
              Keep consent
            </button>
          </section>
        ) : (
          <button
            className="button"
            type="button"
            disabled={pending}
            onClick={() => setWithdrawConfirmation(true)}
          >
            Withdraw consent
          </button>
        )}
        <p>
          <Link to="/more">Back to More</Link>
        </p>
      </section>
    </main>
  )
}
