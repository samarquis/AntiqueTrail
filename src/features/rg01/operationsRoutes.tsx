import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { GENERIC_RG01_ERROR, type RG01Client } from './rg01Client'
import {
  projectRG01Status,
  type RG01MetricCode,
  type RG01OperationalProjection,
  type RG01RunProjection,
} from './operationsProjection'

const FILTERS = ['all', 'collecting', 'frozen', 'signed', 'rejected'] as const
type Filter = (typeof FILTERS)[number]

function newIdempotencyKey() {
  return crypto.randomUUID()
}

function errorMessage() {
  return GENERIC_RG01_ERROR
}

function stateLabel(state: RG01RunProjection['state']) {
  return state === 'collecting' ? 'Calculating' : state[0].toUpperCase() + state.slice(1)
}

function MetricList({ metrics }: { metrics: RG01RunProjection['metrics'] }) {
  const labels: Partial<Record<RG01MetricCode, string>> = {
    first_trip_shoppers: 'First qualifying trips',
    second_trip_shoppers: 'Second qualifying trips',
    active_listings: 'Active listings',
    current_listings: 'Current listings',
    flyer_locations: 'Flyer locations',
    open_critical_defects: 'Open critical defects',
    new_support_cases: 'New support cases',
    qualifying_trips: 'Qualifying trips',
    claim_approved: 'Approved claims',
    claim_rejected: 'Rejected claims',
    claim_abusive: 'Abusive claims',
  }
  return (
    <dl className="rg01-metrics">
      {Object.entries(metrics).map(([code, value]) => (
        <div key={code}>
          <dt>{labels[code as RG01MetricCode] ?? code}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function RunSummary({ run }: { run: RG01RunProjection }) {
  return (
    <>
      <dl className="rg01-facts">
        <div>
          <dt>State</dt>
          <dd>{stateLabel(run.state)}</dd>
        </div>
        <div>
          <dt>Evidence window</dt>
          <dd>
            {run.windowStart} to {run.windowEnd}
          </dd>
        </div>
        <div>
          <dt>Current source</dt>
          <dd>{run.currentSource ? 'Current' : 'Stale'}</dd>
        </div>
        <div>
          <dt>Manifest digest</dt>
          <dd>{run.manifestDigest ?? 'Not frozen'}</dd>
        </div>
        <div>
          <dt>Receipt</dt>
          <dd>{run.receiptStatus}</dd>
        </div>
        <div>
          <dt>Supersession</dt>
          <dd>{run.supersessionStatus}</dd>
        </div>
        <div>
          <dt>Linkage purge</dt>
          <dd>{run.purgeStatus}</dd>
        </div>
      </dl>
      <section aria-labelledby="rg01-blockers-heading">
        <h2 id="rg01-blockers-heading">Blockers</h2>
        {run.blockers.length ? (
          <ul>
            {run.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : (
          <p>None recorded.</p>
        )}
      </section>
      {Object.keys(run.metrics).length > 0 && (
        <section aria-labelledby="rg01-metrics-heading">
          <h2 id="rg01-metrics-heading">Allowed aggregate metrics</h2>
          <MetricList metrics={run.metrics} />
        </section>
      )}
    </>
  )
}

function useRG01Projection(client: RG01Client, runId?: string) {
  const [projection, setProjection] = useState<RG01OperationalProjection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setProjection(projectRG01Status(await client.status(runId)))
    } catch {
      setProjection(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [client, runId])
  useEffect(() => void load(), [load])
  return { projection, loading, error, retry: load }
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <section className="page-card" aria-live="polite">
      <h2>Evidence is unavailable</h2>
      <p>{errorMessage()}</p>
      <button className="button" type="button" onClick={() => void retry()}>
        Retry
      </button>
    </section>
  )
}

export function RG01OperationsListPage({ client }: { client: RG01Client }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = FILTERS.includes((searchParams.get('state') ?? 'all') as Filter)
    ? ((searchParams.get('state') ?? 'all') as Filter)
    : 'all'
  const { projection, loading, error, retry } = useRG01Projection(client)
  const visibleRuns = useMemo(
    () => projection?.runs.filter((run) => filter === 'all' || run.state === filter) ?? [],
    [filter, projection],
  )
  if (loading)
    return (
      <main>
        <p role="status">Loading RG-01 evidence…</p>
      </main>
    )
  if (error || !projection)
    return (
      <main>
        <ErrorState retry={retry} />
      </main>
    )
  return (
    <main>
      <header>
        <p className="eyebrow">Package 11 · RG-01</p>
        <h1>Evidence runs</h1>
        <p>
          Operations prepares source-backed calculations. Only the exact Product Owner
          responsibility can decide a frozen digest.
        </p>
      </header>
      {!projection.collectionEnabled && (
        <p role="status">
          RG-01 collection is currently staged off. No calculation can change evidence.
        </p>
      )}
      {projection.permissions.prepare && projection.collectionEnabled && (
        <PrepareRun client={client} onComplete={retry} />
      )}
      <label htmlFor="rg01-state-filter">Filter runs</label>{' '}
      <select
        id="rg01-state-filter"
        value={filter}
        onChange={(event) =>
          setSearchParams(event.target.value === 'all' ? {} : { state: event.target.value })
        }
      >
        {FILTERS.map((value) => (
          <option key={value} value={value}>
            {value === 'all' ? 'All states' : stateLabel(value as RG01RunProjection['state'])}
          </option>
        ))}
      </select>
      {visibleRuns.length === 0 ? (
        <p role="status">No RG-01 runs match this filter.</p>
      ) : (
        <ul aria-label="RG-01 evidence runs">
          {visibleRuns.map((run) => (
            <li key={run.runId}>
              <Link to={`/admin/evidence/rg-01/${run.runId}?state=${filter}`}>{run.runId}</Link>{' '}
              <span>{stateLabel(run.state)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function PrepareRun({ client, onComplete }: { client: RG01Client; onComplete: () => void }) {
  const now = new Date()
  const end = now.toISOString().slice(0, 16)
  const start = new Date(now.getTime() - 180 * 86_400_000).toISOString().slice(0, 16)
  const [windowStart, setWindowStart] = useState(start)
  const [windowEnd, setWindowEnd] = useState(end)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)
  async function prepare(event: FormEvent) {
    event.preventDefault()
    setWorking(true)
    setFailed(false)
    try {
      await client.begin({
        runId: newIdempotencyKey(),
        idempotencyKey: newIdempotencyKey(),
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
      })
      onComplete()
    } catch {
      setFailed(true)
    } finally {
      setWorking(false)
    }
  }
  return (
    <form onSubmit={(event) => void prepare(event)} aria-labelledby="rg01-prepare-heading">
      <h2 id="rg01-prepare-heading">Prepare or recalculate</h2>
      <label htmlFor="rg01-window-start">Window starts</label>
      <input
        id="rg01-window-start"
        type="datetime-local"
        value={windowStart}
        onChange={(event) => setWindowStart(event.target.value)}
        required
      />
      <label htmlFor="rg01-window-end">Window ends</label>
      <input
        id="rg01-window-end"
        type="datetime-local"
        value={windowEnd}
        onChange={(event) => setWindowEnd(event.target.value)}
        required
      />
      {failed && (
        <section role="alert">
          <p>{errorMessage()}</p>
          <button className="button" type="submit" disabled={working}>
            Retry
          </button>
        </section>
      )}
      <button className="button" type="submit" disabled={working}>
        {working ? 'Preparing…' : 'Prepare / Recalculate'}
      </button>
    </form>
  )
}

export function RG01OperationsRunPage({ client }: { client: RG01Client }) {
  const { runId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const filter = searchParams.get('state') ?? 'all'
  const { projection, loading, error, retry } = useRG01Projection(client, runId)
  const run = projection?.run
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)
  async function freeze() {
    setWorking(true)
    setFailed(false)
    try {
      await client.freeze(runId, newIdempotencyKey())
      await retry()
    } catch {
      setFailed(true)
    } finally {
      setWorking(false)
    }
  }
  if (loading)
    return (
      <main>
        <p role="status">Loading RG-01 run…</p>
      </main>
    )
  if (error || !projection || !run)
    return (
      <main>
        <ErrorState retry={retry} />
      </main>
    )
  return (
    <main>
      <Link to={`/admin/evidence/rg-01?state=${encodeURIComponent(filter)}`}>
        Back to evidence runs
      </Link>
      <header>
        <p className="eyebrow">RG-01 exact run</p>
        <h1>{run.runId}</h1>
      </header>
      <RunSummary run={run} />
      {failed && (
        <section role="alert">
          <p>{errorMessage()}</p>
          <button className="button" type="button" onClick={() => void freeze()} disabled={working}>
            Retry
          </button>
        </section>
      )}
      {run.state === 'collecting' && projection.permissions.freeze && (
        <button className="button" type="button" onClick={() => void freeze()} disabled={working}>
          {working ? 'Freezing…' : 'Freeze current calculation'}
        </button>
      )}
      {run.state === 'frozen' && run.currentSource && projection.permissions.sign && (
        <button
          className="button"
          type="button"
          onClick={() =>
            navigate(`/admin/evidence/rg-01/${run.runId}/sign?state=${encodeURIComponent(filter)}`)
          }
        >
          Review frozen digest
        </button>
      )}
      {run.state === 'frozen' && !run.currentSource && (
        <p role="status">
          This frozen result is stale and cannot be signed. Prepare a new calculation.
        </p>
      )}
    </main>
  )
}
