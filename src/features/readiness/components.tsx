import { useEffect, useState } from 'react'
import { GENERIC_READINESS_ERROR, unavailableReadinessClient } from './readinessApi'
import type {
  DurableReadinessClient,
  DurableReadinessStatus,
  ReadinessSigningChallenge,
} from './types'

export function ReadinessStatusPage({
  runId,
  client = unavailableReadinessClient,
}: {
  runId: string
  client?: DurableReadinessClient
}) {
  const [status, setStatus] = useState<DurableReadinessStatus | null>(null)
  const [challenge, setChallenge] = useState<ReadinessSigningChallenge | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    client
      .getStatus(runId)
      .then((result) => {
        if (!cancelled) setStatus(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, runId])

  async function requestChallenge() {
    setError(false)
    try {
      setChallenge(await client.requestSigningChallenge(runId))
    } catch {
      setChallenge(null)
      setError(true)
    }
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="readiness-heading">
        <p className="eyebrow">Private readiness evidence</p>
        <h1 id="readiness-heading">Readiness status</h1>
        <p className="lede">
          Evidence is frozen from append-only service facts, and decisions are calculated and stored
          by protected services. This page cannot upload facts, totals, or mark a signature as
          verified.
        </p>
        {loading && <p role="status">Loading server-owned evidence…</p>}
        {error && <p role="alert">{GENERIC_READINESS_ERROR}</p>}
        {status && (
          <>
            <p role="status">Decision state: {status.state}.</p>
            {status.blockers.length ? (
              <section aria-label="Readiness blockers">
                <h2>Signing blocked</h2>
                <ul>
                  {status.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </section>
            ) : status.state === 'frozen' ? (
              <button className="button" type="button" onClick={() => void requestChallenge()}>
                Request signing challenge
              </button>
            ) : null}
          </>
        )}
        {challenge && (
          <p role="status">
            One-use challenge created. Complete verification through the configured signing provider
            before {challenge.expiresAt}.
          </p>
        )}
      </section>
    </main>
  )
}
