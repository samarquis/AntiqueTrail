import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { AdminSession } from './types'
import { canUseAdminBoundary, GENERIC_ADMIN_FAILURE } from './boundary'
import type { AdminClient } from './adminClient'
import { unavailableAdminClient } from './adminClient'
import { ViewAuditButton } from './audit'
import type {
  AdminDecision,
  AdminMergePlan,
  AdminReviewQueueCategory,
  AdminReviewCaseDetail,
  AdminReviewCaseSummary,
  AdminScopePreview,
  AdminStoreScope,
} from './types'

const reviewQueueCategories = [
  ['onboarding', 'New stores'],
  ['store_changes', 'Store changes'],
  ['images', 'Images'],
  ['support', 'Support'],
  ['listing_claims', 'Listing claims'],
  ['other', 'Other review work'],
] as const satisfies ReadonlyArray<readonly [AdminReviewQueueCategory, string]>

function reviewCaseTypeLabel(caseType: AdminReviewCaseSummary['caseType']) {
  return caseType.replaceAll('_', ' ')
}

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
  const [resolvedCase, setResolvedCase] = useState<{
    id: string
    state: string
    queueCategory: AdminReviewQueueCategory
    onboardingOutcome?: {
      pilotStoreRecordCreated: true
      storeLabel: string
      representativeScope: string
      unrelatedAuthorityChanged: false
    }
  } | null>(null)
  const [message, setMessage] = useState('')
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [returnFocusToQueue, setReturnFocusToQueue] = useState(false)
  const [queueCategory, setQueueCategory] = useState<AdminReviewQueueCategory | null>(null)
  const [knownQueueCategories, setKnownQueueCategories] = useState<AdminReviewQueueCategory[]>([])
  const queueHeading = useRef<HTMLHeadingElement>(null)
  const clientRef = useRef(client)
  clientRef.current = client

  async function loadCases(retry = false) {
    setListState('loading')
    setMessage('')
    try {
      const items = await clientRef.current.listCases(retry)
      setCases(items)
      setKnownQueueCategories((current) => [
        ...new Set([...current, ...items.map((reviewCase) => reviewCase.queueCategory)]),
      ])
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
        setKnownQueueCategories((categories) => [
          ...new Set([...categories, ...items.map((reviewCase) => reviewCase.queueCategory)]),
        ])
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
      setCases((items) =>
        items
          .filter((item) => item.id !== selected.id)
          .map((item) =>
            item.queueCategory === selected.queueCategory
              ? { ...item, assignedCount: Math.max(0, item.assignedCount - 1) }
              : item,
          ),
      )
      setResolvedCase({
        id: selected.id,
        state: result.state,
        queueCategory: selected.queueCategory,
        onboardingOutcome: result.onboardingOutcome,
      })
      setReason('')
      setPendingAction(null)
      setQueueCategory(null)
      setMessage(`Case ${result.state}.`)
      setReturnFocusToQueue(true)
    } catch {
      setMessage(GENERIC_ADMIN_FAILURE)
    }
  }

  const filteredCases = queueCategory
    ? cases.filter((reviewCase) => reviewCase.queueCategory === queueCategory)
    : cases
  const categoriesInWorkspace = reviewQueueCategories.filter(
    ([category]) =>
      cases.some((reviewCase) => reviewCase.queueCategory === category) ||
      knownQueueCategories.includes(category),
  )
  const assignedCategoryNames = reviewQueueCategories
    .filter(([category]) => cases.some((reviewCase) => reviewCase.queueCategory === category))
    .map(([, label]) => label)
  const queueSummary =
    listState === 'loading'
      ? 'Your assigned review workspace is loading.'
      : listState === 'error'
        ? 'Your assigned review work could not be loaded.'
        : cases.length === 0
          ? 'No assigned review cases right now.'
          : `${cases.length} assigned review ${cases.length === 1 ? 'case' : 'cases'} in ${assignedCategoryNames.join(', ')}.`

  return (
    <main className="review-queue">
      <header>
        <Link to="/stores">
          <span aria-hidden="true">← </span>Back
        </Link>
        <p className="eyebrow">Assigned review work</p>
        <h1 ref={queueHeading} tabIndex={-1}>
          Review queue
        </h1>
        <p>Review one assigned item with its exact submitted context.</p>
      </header>
      {message && (
        <p className="review-queue__message" role="status">
          {message}
        </p>
      )}
      {resolvedCase ? (
        <section className="review-queue__outcome" aria-label="Resolved case outcome">
          <p>
            Case {resolvedCase.id} is {resolvedCase.state}. The outcome and reason remain in its
            audit history.
          </p>
          {resolvedCase.onboardingOutcome && (
            <p>
              Pilot Store Record created for {resolvedCase.onboardingOutcome.storeLabel}. Store
              Representative scope granted: {resolvedCase.onboardingOutcome.representativeScope}. No
              unrelated data or authority changed.
            </p>
          )}
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
        <section className="review-queue__workspace" aria-labelledby="review-workspace-heading">
          <div className="review-queue__summary">
            <p className="eyebrow">Queue status</p>
            <h2 id="review-workspace-heading">Assigned cases</h2>
            <p>{queueSummary}</p>
          </div>
          {listState === 'error' ? (
            <div className="review-queue__state" role="alert">
              <p>Try again to reload only your assigned review cases.</p>
              <button type="button" onClick={() => void loadCases(true)}>
                Retry review queue
              </button>
            </div>
          ) : listState === 'loading' ? (
            <div className="review-queue__state">
              <p role="status">Loading review cases…</p>
            </div>
          ) : cases.length ? (
            <>
              {categoriesInWorkspace.length > 0 && (
                <section className="review-queue__categories" aria-label="Review queue categories">
                  {categoriesInWorkspace.map(([category, label]) => {
                    const count =
                      cases.find((reviewCase) => reviewCase.queueCategory === category)
                        ?.assignedCount ?? 0
                    return (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={queueCategory === category}
                        onClick={() =>
                          setQueueCategory(queueCategory === category ? null : category)
                        }
                      >
                        {label} ({count})
                      </button>
                    )
                  })}
                </section>
              )}
              <ul className="review-queue__cases" aria-label="Assigned review cases">
                {filteredCases.map((reviewCase) => {
                  const categoryLabel = reviewQueueCategories.find(
                    ([category]) => category === reviewCase.queueCategory,
                  )?.[1]
                  return (
                    <li key={reviewCase.id} className="review-queue__case">
                      <p className="review-queue__case-category">{categoryLabel}</p>
                      <h3>{reviewCase.storeLabel}</h3>
                      <p>{reviewCaseTypeLabel(reviewCase.caseType)}</p>
                      <button type="button" onClick={() => void openCase(reviewCase)}>
                        Review {reviewCase.storeLabel}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <div className="review-queue__state">
              <p>No assigned review cases.</p>
              <p>There is nothing to decide until another assigned case arrives.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="review-queue__detail" aria-labelledby="case-heading">
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
          {selected.caseType === 'partner_onboarding' ? (
            <section aria-label="Pilot Store Draft decision summary">
              <h3>Pilot Store Draft decision summary</h3>
              <p>
                This exact submitted draft can create one private-beta Pilot Store Record only after
                this approval.
              </p>
              <p>
                Consent: {String(selected.context.consentStatus ?? 'Not provided')}. Authority:{' '}
                {String(selected.context.authorityStatus ?? 'Not provided')}. Identity:{' '}
                {String(selected.context.identityStatus ?? 'Not provided')}.
              </p>
            </section>
          ) : (
            <section aria-label="Current and requested listing preview">
              <h3>Current and requested listing preview</h3>
              <p>Current public listing: retained until this exact case is approved.</p>
              <p>
                Requested {String(selected.context.field ?? 'field')}:{' '}
                {String(selected.context.requestedValue ?? 'Not provided')}.
              </p>
            </section>
          )}
          <h3>Audit history</h3>
          <ViewAuditButton
            access={selected.auditAccess}
            label={selected.storeLabel}
            returnTo="/admin"
          />
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
              {selected.caseType === 'partner_onboarding' ? (
                <p>
                  Confirm {pendingAction}:{' '}
                  {pendingAction === 'approve'
                    ? `create the Pilot Store Record for ${selected.storeLabel} and grant Store Representative scope only for that store. No unrelated data or authority changes.`
                    : `${pendingAction === 'return' ? 'return this exact draft for correction; it will not publish or grant a role.' : 'reject this exact draft; it will not publish or grant a role.'}`}{' '}
                  The immutable submission and reason remain in the audit record.
                </p>
              ) : (
                <p>
                  Confirm {pendingAction}: only the requested{' '}
                  {String(selected.context.field ?? 'field')}
                  for {selected.storeLabel} is affected. The current public listing stays unchanged
                  until approval; the immutable submission remains in the audit record.
                </p>
              )}
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
          await client.previewStoreScopeChange(
            operation,
            grant.subjectUserId,
            grant.storeId,
            grant.version,
          ),
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
        <ul aria-label="Store Representative scopes">
          {grants.map((grant) => (
            <li key={grant.grantId}>
              <strong>{grant.storeLabel}</strong> — {grant.subjectLabel} — {grant.state}
              <ViewAuditButton
                access={grant.auditAccess}
                label={grant.storeLabel}
                returnTo="/admin/access"
              />
              <p>
                Assurance: {grant.verifiedEmail ? 'verified email' : 'no verified email'},{' '}
                {grant.mfaVerified ? 'MFA verified' : 'no MFA'}. Granted{' '}
                {new Date(grant.grantedAt).toLocaleDateString()}
                {grant.revokedAt
                  ? `. Revoked ${new Date(grant.revokedAt).toLocaleDateString()}.`
                  : '.'}
              </p>
              {grant.recentActivity.length ? (
                <p>
                  Recent privileged activity:{' '}
                  {grant.recentActivity
                    .map((entry) => `${entry.action.replaceAll('_', ' ')} (${entry.outcome})`)
                    .join(', ')}
                </p>
              ) : null}
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
