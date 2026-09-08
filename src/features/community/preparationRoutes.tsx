import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CommunityPreparationError, type CommunityPreparationClient } from './preparationClient'

export function CommunityPreparationRoutes({ client }: { client: CommunityPreparationClient }) {
  const { runId } = useParams()
  return runId ? (
    <CommunityPreparationDetail client={client} runId={runId} />
  ) : (
    <CommunityPreparationList client={client} />
  )
}

function CommunityPreparationList({ client }: { client: CommunityPreparationClient }) {
  const [search, setSearch] = useSearchParams()
  const [projection, setProjection] = useState<Awaited<
    ReturnType<CommunityPreparationClient['list']>
  > | null>(null)
  const [error, setError] = useState(false)
  const filter = search.get('state') ?? 'all'
  const load = useCallback(
    () =>
      client
        .list()
        .then(setProjection)
        .catch(() => setError(true)),
    [client],
  )
  useEffect(() => void load(), [load])
  const runs = projection?.runs.filter((run) => filter === 'all' || run.state === filter) ?? []
  return (
    <main>
      <section className="page-card" aria-labelledby="community-preparation-heading">
        <p className="eyebrow">Community operations</p>
        <h1 id="community-preparation-heading">Communities</h1>
        <p>Prepare one selected area at a time. Nothing here activates public visibility.</p>
        {error && <p role="alert">{new CommunityPreparationError().message}</p>}
        {!projection ? (
          <p role="status">Loading community readiness…</p>
        ) : projection.status === 'blocked' ? (
          <p role="status">
            Community preparation is blocked until server-verified RG-01 and area selection evidence
            is available.
          </p>
        ) : (
          <>
            <label htmlFor="community-state-filter">Filter runs</label>
            <select
              id="community-state-filter"
              value={filter}
              onChange={(event) => {
                const value = event.target.value
                if (value === 'all') setSearch({})
                else setSearch({ state: value })
              }}
            >
              <option value="all">All states</option>
              <option value="prepared">Prepared</option>
              <option value="readiness_signed">Readiness signed</option>
              <option value="live">Live</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <ul aria-label="Community preparation runs">
              {runs.map((run) => (
                <li key={run.runId}>
                  <Link
                    to={`/admin/communities/${run.runId}${search.toString() ? `?${search}` : ''}`}
                  >
                    {run.areaName}
                  </Link>{' '}
                  — ordinal {run.targetOrdinal}, attempt {run.attemptSequence}, {run.state}
                </li>
              ))}
            </ul>
            {runs.length === 0 && <p role="status">No runs match this filter.</p>}
          </>
        )}
      </section>
    </main>
  )
}

function CommunityPreparationDetail({
  client,
  runId,
}: {
  client: CommunityPreparationClient
  runId: string
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [projection, setProjection] = useState<Awaited<
    ReturnType<CommunityPreparationClient['detail']>
  > | null>(null)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const load = useCallback(
    () =>
      client
        .detail(runId)
        .then(setProjection)
        .catch(() => setError(true)),
    [client, runId],
  )
  useEffect(() => void load(), [load])
  const run = projection?.runs[0]
  async function command(action: () => Promise<unknown>, message: string) {
    setPending(true)
    setError(false)
    try {
      await action()
      setNotice(message)
      await load()
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  function value(name: string) {
    return fields[name] ?? ''
  }
  function update(name: string, next: string) {
    setFields((current) => ({ ...current, [name]: next }))
  }
  function common() {
    return {
      runId,
      expectedRootVersion: Number(value('expectedRootVersion') || run?.expectedRootVersion),
      expectedRunVersion: Number(value('expectedRunVersion') || run?.version),
      idempotencyKey: value('idempotencyKey') || crypto.randomUUID(),
    }
  }
  return (
    <main>
      <section className="page-card" aria-labelledby="community-detail-heading">
        <Link to={`/admin/communities${location.search}`}>Back to Communities</Link>
        <p className="eyebrow">Selected-area readiness</p>
        <h1 id="community-detail-heading">{run?.areaName ?? 'Community run'}</h1>
        {error && (
          <p role="alert">
            Community preparation is unavailable. Retry without changing public visibility.
          </p>
        )}
        {!run ? (
          <p role="status">Loading exact run projection…</p>
        ) : (
          <>
            <dl>
              <dt>State</dt>
              <dd>{run.state}</dd>
              <dt>Ordinal / attempt</dt>
              <dd>
                {run.targetOrdinal} / {run.attemptSequence}
              </dd>
              <dt>Version</dt>
              <dd>{run.version}</dd>
              <dt>Frozen artifact</dt>
              <dd>{run.artifactDigest ?? 'Not frozen'}</dd>
              <dt>Store-set digest</dt>
              <dd>{run.storeSetDigest ?? 'Not frozen'}</dd>
              <dt>Readiness</dt>
              <dd>{run.readinessStatus}</dd>
            </dl>
            {run.state === 'prepared' && (
              <>
                <h2>Freeze evidence</h2>
                {(['freezeReceiptId', 'artifactDigest', 'storeSetDigest', 'storeIds'] as const).map(
                  (name) => (
                    <label key={name}>
                      {name}
                      <input
                        value={value(name)}
                        onChange={(event) => update(name, event.target.value)}
                      />
                    </label>
                  ),
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void command(
                      () =>
                        client.freeze({
                          ...common(),
                          freezeReceiptId: value('freezeReceiptId'),
                          artifactDigest: value('artifactDigest'),
                          storeSetDigest: value('storeSetDigest'),
                          storeIds: value('storeIds')
                            .split(',')
                            .map((item) => item.trim())
                            .filter(Boolean),
                        }),
                      'Evidence frozen privately.',
                    )
                  }
                >
                  Freeze selected store set
                </button>
              </>
            )}
            {run.state === 'prepared' && run.artifactDigest && (
              <>
                <label>
                  Readiness receipt ID
                  <input
                    value={value('readinessReceiptId')}
                    onChange={(event) => update('readinessReceiptId', event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void command(async () => {
                      const input = {
                        runId,
                        readinessReceiptId: value('readinessReceiptId'),
                        expectedRootVersion: Number(
                          value('expectedRootVersion') || run.expectedRootVersion,
                        ),
                        expectedRunVersion: Number(value('expectedRunVersion') || run.version),
                      }
                      const capability = await client.requestSign(input)
                      return client.sign({
                        ...input,
                        ...capability,
                        idempotencyKey: value('idempotencyKey') || crypto.randomUUID(),
                      })
                    }, 'Product Owner readiness signature recorded.')
                  }
                >
                  Sign readiness as Product Owner
                </button>
              </>
            )}
            {['prepared', 'readiness_signed'].includes(run.state) && (
              <>
                <label>
                  Cancellation receipt ID
                  <input
                    value={value('cancellationReceiptId')}
                    onChange={(event) => update('cancellationReceiptId', event.target.value)}
                  />
                </label>
                <label>
                  Reason
                  <input
                    value={value('reason')}
                    onChange={(event) => update('reason', event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void command(
                      () =>
                        client.cancel({
                          ...common(),
                          cancellationReceiptId: value('cancellationReceiptId'),
                          reason: value('reason'),
                        }),
                      'Preparation cancelled; the area reservation was released.',
                    )
                  }
                >
                  Cancel preparation
                </button>
              </>
            )}
            {run.state === 'live' && (
              <Link to={`/admin/communities/${run.runId}/gate`}>
                Review current-area evidence gate
              </Link>
            )}
            {notice && <p role="status">{notice}</p>}
            <button type="button" onClick={() => navigate(`/admin/communities${location.search}`)}>
              Return to filtered list
            </button>
          </>
        )}
      </section>
    </main>
  )
}
