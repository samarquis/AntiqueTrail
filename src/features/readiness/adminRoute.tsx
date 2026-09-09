import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_READINESS_ADMIN_ERROR, unavailableReadinessAdminClient } from './adminClient'
import type {
  ReadinessAdminClient,
  ReadinessAdminDecisionInput,
  ReadinessAdminInvitationResult,
  ReadinessAdminSigningCapability,
  ReadinessAdminWorkspace,
} from './adminTypes'

const HEX_DIGEST = /^[0-9a-f]{64}$/i

function idempotency(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function runId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function ReadinessAdminPage({
  client = unavailableReadinessAdminClient,
}: {
  client?: ReadinessAdminClient
}) {
  const [workspace, setWorkspace] = useState<ReadinessAdminWorkspace | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [emailHmac, setEmailHmac] = useState('')
  const [invitationResult, setInvitationResult] = useState<ReadinessAdminInvitationResult | null>(
    null,
  )
  const [capability, setCapability] = useState<ReadinessAdminSigningCapability | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setState('loading')
    setMessage('')
    try {
      setWorkspace(await client.getWorkspace())
      setState('ready')
    } catch {
      setWorkspace(null)
      setState('error')
      setMessage(GENERIC_READINESS_ADMIN_ERROR)
    }
  }

  useEffect(() => {
    void load()
    // The client is injected once by composition; action reloads use the same reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function action(name: string, operation: () => Promise<unknown>) {
    setBusy(name)
    setMessage('')
    try {
      await operation()
      await load()
    } catch {
      setMessage(GENERIC_READINESS_ADMIN_ERROR)
    } finally {
      setBusy(null)
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspace || !HEX_DIGEST.test(emailHmac)) {
      setMessage('Enter the 64-character HMAC for a verified synthetic email.')
      return
    }
    setBusy('invite')
    setMessage('')
    try {
      const result = await client.createInvitation(
        workspace.cohort.cohortId,
        emailHmac.toLowerCase(),
        idempotency('readiness-invite'),
      )
      setInvitationResult(result)
      setEmailHmac('')
      await load()
    } catch {
      setMessage(GENERIC_READINESS_ADMIN_ERROR)
    } finally {
      setBusy(null)
    }
  }

  async function startRun() {
    if (!workspace) return
    await action('start-run', () =>
      client.beginRun(workspace.cohort.cohortId, runId(), idempotency('readiness-run')),
    )
  }

  async function requestCapability() {
    const run = workspace?.run
    if (!run?.frozenDigest || !HEX_DIGEST.test(run.frozenDigest)) return
    setBusy('capability')
    setMessage('')
    try {
      setCapability(await client.requestSigningCapability(run.runId, run.frozenDigest))
    } catch {
      setMessage(GENERIC_READINESS_ADMIN_ERROR)
    } finally {
      setBusy(null)
    }
  }

  async function decide(decision: 'pass' | 'reject') {
    if (!capability) return
    const input: ReadinessAdminDecisionInput = {
      capabilityToken: capability.capabilityToken,
      decision,
      signedPayloadDigest: capability.frozenDigest,
      signatureDigest: capability.frozenDigest,
      providerKeyId: 'synthetic-local-provider',
      providerVerificationId: 'synthetic-local-verification',
      reason: decision === 'reject' ? decisionReason.trim() : undefined,
    }
    await action(`decision-${decision}`, () => client.decideReceipt(input))
    setCapability(null)
    setDecisionReason('')
  }

  if (state === 'loading') return <p role="status">Loading readiness operations…</p>
  if (state === 'error')
    return (
      <main>
        <Link to="/admin/more">← Back</Link>
        <h1>Regional readiness operations</h1>
        <p role="alert">{message}</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </main>
    )
  if (!workspace) return null

  const run = workspace.run
  return (
    <main className="page-card">
      <Link to="/admin/more">← Back</Link>
      <p className="eyebrow">Private, noindex evidence workspace</p>
      <h1>Regional readiness operations</h1>
      <p>
        Topeka readiness is limited to this authorized cohort. The server derives facts and gate
        totals; this screen cannot upload completed steps or edit a frozen result.
      </p>
      {message && <p role="alert">{message}</p>}
      {invitationResult && (
        <section aria-label="Synthetic invitation result">
          <h2>Invitation {invitationResult.state}</h2>
          <p>
            Deliver this one-time token only through the local synthetic adapter. It will not be
            shown again.
          </p>
          {invitationResult.token && <code>{invitationResult.token}</code>}
        </section>
      )}
      <section aria-labelledby="cohort-heading">
        <h2 id="cohort-heading">Authorized cohort</h2>
        <p>
          Area: {workspace.cohort.areaSlug}. State: {workspace.cohort.state}. Invitations:{' '}
          {workspace.invitations.length}. Subjects: {workspace.subjects.length}.
        </p>
        <form onSubmit={(event) => void createInvitation(event)}>
          <label>
            Verified synthetic email HMAC
            <input
              value={emailHmac}
              onChange={(event) => setEmailHmac(event.target.value)}
              inputMode="text"
              pattern="[0-9a-fA-F]{64}"
              minLength={64}
              maxLength={64}
              required
            />
          </label>
          <button type="submit" disabled={busy !== null}>
            {busy === 'invite' ? 'Creating…' : 'Create synthetic invitation'}
          </button>
        </form>
        <ul aria-label="Readiness invitations">
          {workspace.invitations.map((invitation) => (
            <li key={invitation.invitationId}>
              <span>
                Invitation {invitation.state}; expires {invitation.expiresAt}.
              </span>{' '}
              {['pending', 'registration_pending', 'accepted'].includes(invitation.state) && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void action('revoke-invitation', () =>
                      client.revokeInvitation(invitation.invitationId, invitation.version),
                    )
                  }
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="subjects-heading">
        <h2 id="subjects-heading">Cohort tasks</h2>
        {workspace.subjects.length === 0 ? (
          <p>No accepted synthetic subjects yet.</p>
        ) : (
          <ul aria-label="Readiness subjects">
            {workspace.subjects.map((subject) => (
              <li key={subject.subjectId}>
                <span>
                  Subject {subject.subjectId}: {subject.state};{' '}
                  {subject.ageBand ?? 'age band pending'}; adaptation{' '}
                  {subject.adaptation ? 'yes' : 'no'}.
                </span>{' '}
                {subject.state === 'active' && !subject.startedAt && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void action('mark-started', () =>
                        client.markStarted(subject.subjectId, subject.version),
                      )
                    }
                  >
                    Mark started
                  </button>
                )}{' '}
                {subject.state === 'active' && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void action('exclude-subject', () =>
                        client.excludeSubject(
                          subject.subjectId,
                          'operations_review',
                          subject.version,
                        ),
                      )
                    }
                  >
                    Exclude subject
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">Frozen evidence</h2>
        {!run ? (
          <>
            <p>No readiness run exists for this cohort.</p>
            <button type="button" disabled={busy !== null} onClick={() => void startRun()}>
              Start evidence run
            </button>
          </>
        ) : (
          <>
            <p role="status">
              Run {run.runId}: {run.state}. Fact collection:{' '}
              {run.factCollectionState ?? 'unavailable'}.
            </p>
            {run.frozenDigest && <p>Frozen digest: {run.frozenDigest}</p>}
            {run.blockers.length > 0 && (
              <section aria-label="Readiness blockers">
                <h3>Blocking evidence</h3>
                <ul>
                  {run.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </section>
            )}
            {!run.frozenDigest && (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void action('calculate', () => client.calculateGate(run.runId))}
                >
                  Calculate server-derived gate
                </button>{' '}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void action('freeze', () => client.freezeReceipt(run.runId))}
                >
                  Freeze evidence receipt
                </button>
              </>
            )}
            {run.frozenDigest && run.receiptId === null && (
              <section aria-labelledby="decision-heading">
                <h3 id="decision-heading">ProductOwner decision</h3>
                <p>
                  Only the exact ProductOwner responsibility can request the one-use digest
                  capability.
                </p>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void requestCapability()}
                >
                  Request exact signing capability
                </button>
                {capability && (
                  <div>
                    <p>Capability expires {capability.expiresAt}.</p>
                    <label>
                      Rejection reason
                      <input
                        value={decisionReason}
                        onChange={(event) => setDecisionReason(event.target.value)}
                      />
                    </label>{' '}
                    <button
                      type="button"
                      disabled={busy !== null || Boolean(capability.blockers.length)}
                      onClick={() => void decide('pass')}
                    >
                      Sign pass
                    </button>{' '}
                    <button
                      type="button"
                      disabled={busy !== null || !decisionReason.trim()}
                      onClick={() => void decide('reject')}
                    >
                      Reject evidence
                    </button>
                  </div>
                )}
              </section>
            )}
            {run.receiptId && <p role="status">Decision receipt: {run.receiptId}.</p>}
          </>
        )}
      </section>
    </main>
  )
}
