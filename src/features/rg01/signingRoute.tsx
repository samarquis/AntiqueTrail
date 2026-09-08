import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { GENERIC_RG01_ERROR, type RG01Client } from './rg01Client'
import { projectRG01Status, type RG01RunProjection } from './operationsProjection'

function errorMessage() {
  return GENERIC_RG01_ERROR
}

export function RG01SigningPage({ client }: { client: RG01Client }) {
  const { runId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const filter = searchParams.get('state') ?? 'all'
  const [run, setRun] = useState<RG01RunProjection | null>(null)
  const [canSign, setCanSign] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [working, setWorking] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const projection = projectRG01Status(await client.status(runId))
      setRun(projection.run)
      setCanSign(projection.permissions.sign)
    } catch {
      setRun(null)
      setCanSign(false)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [client, runId])
  useEffect(() => void load(), [load])

  async function decide(decision: 'pass' | 'reject') {
    if (!run) return
    setWorking(true)
    setFailed(false)
    setOutcome(null)
    try {
      const challenge = (await client.requestDecision(
        run.runId,
        decision,
        crypto.randomUUID(),
      )) as {
        challengeId?: string
        payloadDigest?: string
      }
      if (!challenge.challengeId || !challenge.payloadDigest) throw new Error(errorMessage())
      const result = (await client.consumeDecision(
        challenge.challengeId,
        challenge.payloadDigest,
        crypto.randomUUID(),
      )) as { receiptId?: string; state?: string }
      if (!result.receiptId || result.state !== 'settled') throw new Error(errorMessage())
      setOutcome(`${decision === 'pass' ? 'Signed' : 'Rejected'} receipt recorded.`)
      await load()
    } catch {
      setFailed(true)
    } finally {
      setWorking(false)
    }
  }

  if (loading)
    return (
      <main>
        <p role="status">Loading frozen evidence…</p>
      </main>
    )
  return (
    <main>
      <Link to={`/admin/evidence/rg-01/${runId}?state=${encodeURIComponent(filter)}`}>
        Back to run
      </Link>
      <header>
        <p className="eyebrow">Product Owner decision</p>
        <h1>Review frozen RG-01 evidence</h1>
      </header>
      {failed || !run ? (
        <section className="page-card" aria-live="polite">
          <h2>Decision is unavailable</h2>
          <p>{errorMessage()}</p>
          <button className="button" type="button" onClick={() => void load()}>
            Retry
          </button>
        </section>
      ) : (
        <>
          <dl className="rg01-facts">
            <div>
              <dt>State</dt>
              <dd>{run.state}</dd>
            </div>
            <div>
              <dt>Current source</dt>
              <dd>{run.currentSource ? 'Current' : 'Stale'}</dd>
            </div>
            <div>
              <dt>Frozen manifest digest</dt>
              <dd>{run.manifestDigest ?? 'Unavailable'}</dd>
            </div>
          </dl>
          <p>
            {run.blockers.length
              ? 'This run has blockers and cannot pass.'
              : 'No blockers are recorded for this frozen digest.'}
          </p>
          {outcome && <p role="status">{outcome}</p>}
          {canSign && run.state === 'frozen' && run.currentSource && (
            <div className="memory-delete-actions">
              <button
                className="button"
                type="button"
                disabled={working}
                onClick={() => void decide('pass')}
              >
                Sign
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={working}
                onClick={() => void decide('reject')}
              >
                Reject
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
