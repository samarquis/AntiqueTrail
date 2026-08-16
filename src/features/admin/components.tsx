import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { AdminSession } from './types'
import { canUseAdminBoundary, GENERIC_ADMIN_FAILURE } from './boundary'
import type { AdminClient } from './adminClient'
import { unavailableAdminClient } from './adminClient'
import type {
  AdminDecision,
  AdminMergePlan,
  AdminReviewCaseDetail,
  AdminReviewCaseSummary,
  AdminScopePreview,
  AdminStoreScope,
} from './types'

export function AdminGuard({
  session,
  children,
}: {
  session: AdminSession | null
  children: ReactNode
}) {
  if (!canUseAdminBoundary(session)) return <Navigate to="/stores" replace />
  return <>{children}</>
}

export function ReviewQueuePage({ client = unavailableAdminClient }: { client?: AdminClient }) {
  const [cases, setCases] = useState<AdminReviewCaseSummary[]>([])
  const [selected, setSelected] = useState<AdminReviewCaseDetail | null>(null)
  const [reason, setReason] = useState('')
  const [pendingAction, setPendingAction] = useState<AdminDecision | null>(null)
  const [resolvedCase, setResolvedCase] = useState<{ id: string; state: string } | null>(null)
  const [message, setMessage] = useState('')
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [returnFocusToQueue, setReturnFocusToQueue] = useState(false)
  const queueHeading = useRef<HTMLHeadingElement>(null)
  const clientRef = useRef(client)
  clientRef.current = client

  async function loadCases(retry = false) {
    setListState('loading')
    setMessage('')
    try {
      setCases(await clientRef.current.listCases(retry))
      setListState('ready')
    } catch {
      setListState('error')
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  useEffect(() => {
    let current = true
    void clientRef.current.listCases().then(
      (items) => {
        if (!current) return
        setCases(items)
        setListState('ready')
      },
      () => {
        if (!current) return
        setListState('error')
        setMessage(GENERIC_ADMIN_FAILURE)
      },
    )
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    if (!returnFocusToQueue) return
    queueHeading.current?.focus()
    setReturnFocusToQueue(false)
  }, [returnFocusToQueue])

  async function openCase(reviewCase: AdminReviewCaseSummary) {
    setMessage('')
    try {
      setSelected(await client.getCase(reviewCase.id))
    } catch {
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  async function decide(action: AdminDecision) {
    if (!selected || !reason.trim()) return
    try {
      const result = await client.decideCase(
        selected.id,
        action,
        reason.trim(),
        selected.version,
        `admin-${selected.id}-${selected.version}-${Date.now()}`,
      )
      setCases((items) => items.filter((item) => item.id !== selected.id))
      setResolvedCase({ id: selected.id, state: result.state })
      setReason('')
      setPendingAction(null)
      setMessage(`Case ${result.state}.`)
      setReturnFocusToQueue(true)
    } catch {
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  return (
    <main>
      <Link to="/stores">
        <span aria-hidden="true">← </span>Back
      </Link>
      <h1 ref={queueHeading} tabIndex={-1}>
        Review queue
      </h1>
      <p>Review one assigned item with its exact submitted context.</p>
      {message && <p role="status">{message}</p>}
      {listState === 'error' && (
        <button type="button" onClick={() => void loadCases(true)}>
          Retry review queue
        </button>
      )}
      {resolvedCase ? (
        <section aria-label="Resolved case outcome">
          <p>
            Case {resolvedCase.id} is {resolvedCase.state}. The outcome and reason remain in its
            audit history.
          </p>
          <button
            type="button"
            onClick={() => {
              setResolvedCase(null)
              setSelected(null)
              setReturnFocusToQueue(true)
            }}
          >
            Back to Queue
          </button>{' '}
          {cases.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setResolvedCase(null)
                void openCase(cases[0])
              }}
            >
              Review Next
            </button>
          )}
        </section>
      ) : !selected ? (
        listState === 'loading' ? (
          <p role="status">Loading review cases…</p>
        ) : cases.length ? (
          <ul>
            {cases.map((reviewCase) => (
              <li key={reviewCase.id}>
                <strong>{reviewCase.storeLabel}</strong> —{' '}
                {reviewCase.caseType.replaceAll('_', ' ')}{' '}
                <button type="button" onClick={() => void openCase(reviewCase)}>
                  Review {reviewCase.storeLabel}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No assigned review cases.</p>
        )
      ) : (
        <section aria-labelledby="case-heading">
          <h2 id="case-heading">{selected.storeLabel}</h2>
          <p>Submitted fields are read-only. Decisions apply only to this case.</p>
          <dl>
            {Object.entries(selected.context).map(([label, value]) => (
              <div key={label}>
                <dt>{label.replaceAll('_', ' ')}</dt>
                <dd>{String(value ?? 'Not provided')}</dd>
              </div>
            ))}
          </dl>
          <section aria-label="Current and requested listing preview">
            <h3>Current and requested listing preview</h3>
            <p>Current public listing: retained until this exact case is approved.</p>
            <p>
              Requested {String(selected.context.field ?? 'field')}:{' '}
              {String(selected.context.requestedValue ?? 'Not provided')}.
            </p>
          </section>
          <h3>Audit history</h3>
          <ul aria-label="Case audit history">
            {selected.audit.map((entry) => (
              <li key={`${entry.action}-${entry.occurredAt}`}>
                {entry.action}: {entry.outcome}
              </li>
            ))}
          </ul>
          <label>
            Decision reason
            <textarea
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {pendingAction ? (
            <section aria-label="Confirm case decision">
              <p>
                Confirm {pendingAction}: only the requested{' '}
                {String(selected.context.field ?? 'field')}
                for {selected.storeLabel} is affected. The current public listing stays unchanged
                until approval; the immutable submission remains in the audit record.
              </p>
              <button type="button" onClick={() => void decide(pendingAction)}>
                Confirm {pendingAction === 'return' ? 'return for changes' : pendingAction}
              </button>{' '}
              <button type="button" onClick={() => setPendingAction(null)}>
                Cancel decision
              </button>
            </section>
          ) : (
            <div>
              {selected.allowedActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={!reason.trim()}
                  onClick={() => setPendingAction(action)}
                >
                  {action === 'return'
                    ? 'Return for changes'
                    : action[0].toUpperCase() + action.slice(1)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
export function AccessSafetyPage({ client = unavailableAdminClient }: { client?: AdminClient }) {
  const [grants, setGrants] = useState<AdminStoreScope[]>([])
  const [message, setMessage] = useState('')
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [canonicalStoreId, setCanonicalStoreId] = useState('')
  const [duplicateStoreId, setDuplicateStoreId] = useState('')
  const [merge, setMerge] = useState<AdminMergePlan | null>(null)
  const [scopePreview, setScopePreview] = useState<AdminScopePreview | null>(null)
  const [scopeReason, setScopeReason] = useState('')
  const clientRef = useRef(client)
  clientRef.current = client

  async function loadGrants(retry = false) {
    setListState('loading')
    setMessage('')
    try {
      setGrants(await clientRef.current.listStoreGrants(retry))
      setListState('ready')
    } catch {
      setListState('error')
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  useEffect(() => {
    let current = true
    void clientRef.current.listStoreGrants().then(
      (items) => {
        if (!current) return
        setGrants(items)
        setListState('ready')
      },
      () => {
        if (!current) return
        setListState('error')
        setMessage(GENERIC_ADMIN_FAILURE)
      },
    )
    return () => {
      current = false
    }
  }, [])

  async function changeScope(grant: AdminStoreScope) {
    const operation = grant.state === 'active' ? 'revoke' : 'regrant'
    try {
      if (scopePreview?.grantId !== grant.grantId) {
        setScopePreview(
          await client.previewStoreScopeChange(grant.subjectUserId, grant.storeId, grant.version),
        )
        return
      }
      if (!scopeReason.trim()) return
      const result = await client.changeStoreScope(
        operation,
        grant.subjectUserId,
        grant.storeId,
        grant.version,
        scopeReason.trim(),
        `admin-scope-${grant.grantId}-${grant.version}-${Date.now()}`,
        scopePreview?.previewId ?? null,
      )
      setGrants((items) =>
        items.map((item) =>
          item.grantId === grant.grantId
            ? { ...item, grantId: result.grantId, state: result.state, version: result.version }
            : item,
        ),
      )
      setScopePreview(null)
    } catch {
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  async function previewMerge() {
    try {
      setMerge(await client.previewDuplicateMerge(canonicalStoreId.trim(), duplicateStoreId.trim()))
    } catch {
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  async function advanceMerge(operation: 'execute' | 'rollback') {
    if (!merge) return
    try {
      const key = `admin-merge-${merge.proposalId}-${merge.version}-${Date.now()}`
      setMerge(
        operation === 'execute'
          ? await client.executeDuplicateMerge(merge.proposalId, merge.version, key)
          : await client.rollbackDuplicateMerge(merge.proposalId, merge.version, key),
      )
    } catch {
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  return (
    <main>
      <Link to="/admin">
        <span aria-hidden="true">← </span>Back
      </Link>
      <h1>Access &amp; Safety</h1>
      <p>Review exact Store Representative scopes. Shopper activity is never shown here.</p>
      {message && <p role="status">{message}</p>}
      {listState === 'error' && (
        <button type="button" onClick={() => void loadGrants(true)}>
          Retry Store Representative scopes
        </button>
      )}
      {listState === 'loading' ? (
        <p role="status">Loading Store Representative scopes…</p>
      ) : grants.length ? (
        <ul>
          {grants.map((grant) => (
            <li key={grant.grantId}>
              <strong>{grant.storeLabel}</strong> — {grant.subjectLabel} — {grant.state}{' '}
              <button
                type="button"
                disabled={scopePreview?.grantId === grant.grantId && !scopeReason.trim()}
                onClick={() => void changeScope(grant)}
              >
                {scopePreview?.grantId === grant.grantId
                  ? grant.state === 'active'
                    ? 'Confirm revoke'
                    : 'Confirm regrant'
                  : grant.state === 'active'
                    ? 'Preview revoke'
                    : 'Preview regrant'}{' '}
                {grant.storeLabel} scope
              </button>
              {scopePreview?.grantId === grant.grantId && (
                <p>
                  Confirm exact scope: {grant.storeLabel} for {grant.subjectLabel}.{' '}
                  {grant.state === 'active'
                    ? 'Revoking removes this representative’s access immediately.'
                    : 'Regranting restores only this exact scope.'}{' '}
                  Preview expires {new Date(scopePreview.expiresAt).toLocaleTimeString()}.
                </p>
              )}
              {scopePreview?.grantId === grant.grantId && (
                <label>
                  Administrative reason
                  <input
                    value={scopeReason}
                    onChange={(event) => setScopeReason(event.target.value)}
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No Store Representative scopes.</p>
      )}
      <p>
        Initial Store Representative access is created only by an approved onboarding or listing
        claim. This workspace can revoke or regrant an existing exact scope.
      </p>
      <section aria-labelledby="merge-heading">
        <h2 id="merge-heading">Duplicate store merge</h2>
        <p>Preview one exact canonical and duplicate store before changing anything.</p>
        <label>
          Canonical store ID
          <input
            value={canonicalStoreId}
            onChange={(event) => setCanonicalStoreId(event.target.value)}
          />
        </label>
        <label>
          Duplicate store ID
          <input
            value={duplicateStoreId}
            onChange={(event) => setDuplicateStoreId(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!canonicalStoreId.trim() || !duplicateStoreId.trim()}
          onClick={() => void previewMerge()}
        >
          Preview duplicate merge
        </button>
        {merge && (
          <div>
            <h3>
              {merge.duplicateLabel} → {merge.canonicalLabel}
            </h3>
            <p>{merge.safeReferences} safe references can move.</p>
            <p>{merge.quarantinedConflicts} conflicts will remain quarantined.</p>
            <ol>
              {merge.references.map((reference) => (
                <li key={reference.ordinal}>
                  {reference.kind.replaceAll('_', ' ')} —{' '}
                  {reference.collisionKind.replaceAll('_', ' ')} — {reference.plannedResolution}
                </li>
              ))}
            </ol>
            <p>Representative authority will not move.</p>
            {merge.state === 'previewed' && (
              <button type="button" onClick={() => void advanceMerge('execute')}>
                Execute this merge
              </button>
            )}
            {merge.state === 'executed' && (
              <button type="button" onClick={() => void advanceMerge('rollback')}>
                Roll back this merge
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
export function AdminUnavailable() {
  return <p role="alert">{GENERIC_ADMIN_FAILURE}</p>
}
