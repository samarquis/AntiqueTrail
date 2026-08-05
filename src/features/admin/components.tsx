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
  const [message, setMessage] = useState('')
  const [returnFocusToQueue, setReturnFocusToQueue] = useState(false)
  const queueHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let current = true
    void client
      .listCases()
      .then((items) => current && setCases(items))
      .catch(() => current && setMessage(GENERIC_ADMIN_FAILURE))
    return () => {
      current = false
    }
  }, [client])

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
      setSelected(null)
      setReason('')
      setMessage(`Case ${result.state}.`)
      setReturnFocusToQueue(true)
    } catch {
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  return (
    <main>
      <Link to="/stores">← Back</Link>
      <h1 ref={queueHeading} tabIndex={-1}>
        Review queue
      </h1>
      <p>Review one assigned item with its exact submitted context.</p>
      {message && <p role="status">{message}</p>}
      {!selected ? (
        cases.length ? (
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
          <label>
            Decision reason
            <textarea
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div>
            {selected.allowedActions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={!reason.trim()}
                onClick={() => void decide(action)}
              >
                {action === 'return'
                  ? 'Return for changes'
                  : action[0].toUpperCase() + action.slice(1)}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
export function AccessSafetyPage({ client = unavailableAdminClient }: { client?: AdminClient }) {
  const [grants, setGrants] = useState<AdminStoreScope[]>([])
  const [message, setMessage] = useState('')
  const [canonicalStoreId, setCanonicalStoreId] = useState('')
  const [duplicateStoreId, setDuplicateStoreId] = useState('')
  const [merge, setMerge] = useState<AdminMergePlan | null>(null)
  const [scopePreview, setScopePreview] = useState<AdminScopePreview | null>(null)

  useEffect(() => {
    let current = true
    void client
      .listStoreGrants()
      .then((items) => current && setGrants(items))
      .catch(() => current && setMessage(GENERIC_ADMIN_FAILURE))
    return () => {
      current = false
    }
  }, [client])

  async function changeScope(grant: AdminStoreScope) {
    const operation = grant.state === 'active' ? 'revoke' : 'regrant'
    try {
      if (operation === 'regrant' && scopePreview?.grantId !== grant.grantId) {
        setScopePreview(
          await client.previewStoreScopeChange(grant.subjectUserId, grant.storeId, grant.version),
        )
        return
      }
      const result = await client.changeStoreScope(
        operation,
        grant.subjectUserId,
        grant.storeId,
        grant.version,
        operation === 'revoke' ? 'administrator_revoked' : 'authority_reverified',
        `admin-scope-${grant.grantId}-${grant.version}-${Date.now()}`,
        operation === 'regrant' ? (scopePreview?.previewId ?? null) : null,
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
      <Link to="/admin">← Back</Link>
      <h1>Access &amp; Safety</h1>
      <p>Review exact Store Representative scopes. Shopper activity is never shown here.</p>
      {message && <p role="status">{message}</p>}
      {grants.length ? (
        <ul>
          {grants.map((grant) => (
            <li key={grant.grantId}>
              <strong>{grant.storeLabel}</strong> — {grant.subjectLabel} — {grant.state}{' '}
              <button type="button" onClick={() => void changeScope(grant)}>
                {grant.state === 'active'
                  ? 'Revoke'
                  : scopePreview?.grantId === grant.grantId
                    ? 'Confirm regrant'
                    : 'Preview regrant'}{' '}
                {grant.storeLabel} scope
              </button>
              {scopePreview?.grantId === grant.grantId && (
                <p>
                  Confirm exact scope: {grant.storeLabel} for {grant.subjectLabel}. Preview expires{' '}
                  {new Date(scopePreview.expiresAt).toLocaleTimeString()}.
                </p>
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
