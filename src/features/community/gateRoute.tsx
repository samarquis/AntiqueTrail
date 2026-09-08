import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { CommunityGateClient, CommunityGatePacket } from './gateClient'

export function CommunityGateRoute({ client }: { client: CommunityGateClient }) {
  const { runId = '' } = useParams()
  const location = useLocation()
  const [packet, setPacket] = useState<CommunityGatePacket | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [notice, setNotice] = useState('')
  const load = useCallback(
    () =>
      client
        .packet(runId)
        .then(setPacket)
        .catch(() => setError(true)),
    [client, runId],
  )
  useEffect(() => void load(), [load])
  async function decide(decision: 'pass' | 'reject') {
    setPending(true)
    setError(false)
    try {
      if (!packet) return
      const challenge = await client.request(runId, decision)
      await client.decide({
        runId,
        challengeId: challenge.challengeId,
        payloadDigest: challenge.payloadDigest,
        decision,
        expectedRunVersion: packet.version,
        idempotencyKey: crypto.randomUUID(),
      })
      setNotice(
        decision === 'pass'
          ? 'Current-area gate passed.'
          : 'Current-area gate rejected; failed evidence remains recorded.',
      )
      await load()
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <main>
      <section className="page-card" aria-labelledby="community-gate-heading">
        <Link to={`/admin/communities/${runId}${location.search}`}>Back to run</Link>
        <p className="eyebrow">Current-area evidence</p>
        <h1 id="community-gate-heading">Community Expansion Gate</h1>
        {error && <p role="alert">The evidence gate is unavailable. No decision was recorded.</p>}
        {!packet ? (
          <p role="status">Loading frozen evidence packet…</p>
        ) : (
          <>
            <p>
              Area: {packet.areaName}. Frozen evidence: {packet.frozenEvidenceDigest}
            </p>
            <ul aria-label="Gate predicate outcomes">
              {Object.entries(packet.predicateOutcomes).map(([name, value]) => (
                <li key={name}>
                  {name}: {String(value)}
                </li>
              ))}
            </ul>
            {packet.failureCodes.length > 0 && (
              <p role="status">Failed predicates: {packet.failureCodes.join(', ')}</p>
            )}
            <div role="group" aria-label="Primary Internal Tester decision">
              <button type="button" disabled={pending} onClick={() => void decide('pass')}>
                Pass gate
              </button>
              <button type="button" disabled={pending} onClick={() => void decide('reject')}>
                Reject gate
              </button>
            </div>
            {notice && <p role="status">{notice}</p>}
          </>
        )}
      </section>
    </main>
  )
}
