import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  GENERIC_REVIEW_ERROR,
  REVIEW_RULES_MESSAGE,
  REVIEW_STAGE_DISABLED_MESSAGE,
  canDecideModeration,
  canUndoReviewDeletion,
  conflictLabel,
  formatConflict,
  isReviewCapabilityEnabled,
  moderationButtonLabel,
  moderationChoiceConsequence,
  moderationPreview,
  moderationResultState,
  publicReviewCard,
  unavailableReviewClient,
  validateReviewDraft,
} from './reviewClient'
import type {
  ModerationAction,
  ModerationCase,
  PublicReview,
  ReviewCapability,
  ReviewClient,
  ReviewConflict,
  ReviewDeletion,
  ReviewDraft,
  ReviewEligibility,
  ReviewReportReason,
  StoreReviewsSnapshot,
} from './types'

function ReviewCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main>
      <section className="page-card" aria-labelledby="reviews-heading">
        <p className="eyebrow">Public reviews</p>
        <h1 id="reviews-heading">{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}

function GenericReviewError() {
  return <p role="alert">{GENERIC_REVIEW_ERROR}</p>
}

export function ReviewUnavailablePage() {
  return (
    <ReviewCard
      title="Reviews unavailable"
      description="Public reviews are not part of this release stage."
    >
      <p role="status">{REVIEW_STAGE_DISABLED_MESSAGE}</p>
      <Link className="button" to="/stores">
        Browse stores
      </Link>
    </ReviewCard>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  )
}

function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  if (!reviews.length) return <p>No approved reviews yet.</p>
  return (
    <ul aria-label="Approved reviews">
      {reviews.map((review) => {
        const card = publicReviewCard(review)
        return (
          <li key={card.id}>
            <article>
              <p>
                <Stars rating={card.rating} /> · {card.displayName}
              </p>
              <p>{card.text || 'No written comment.'}</p>
              <p>
                Visited {card.visitMonth}/{card.visitYear}
                {card.edited ? ' · Edited' : ''}
              </p>
              {conflictLabel(card.conflict) && <p>{conflictLabel(card.conflict)}</p>}
              {card.state === 'pending_review' && (
                <p role="status">Pending Review · This has not affected the store average.</p>
              )}
            </article>
          </li>
        )
      })}
    </ul>
  )
}

const EMPTY_DRAFT = (storeId: string): ReviewDraft => ({
  storeId,
  rating: null,
  text: '',
  displayName: '',
  visitMonth: null,
  visitYear: null,
  conflict: 'none',
  manualVisitAttested: false,
})

function ReviewComposer({
  storeId,
  eligibility,
  client,
  initialDraft,
  onPublished,
}: {
  storeId: string
  eligibility: ReviewEligibility
  client: ReviewClient
  initialDraft?: ReviewDraft
  onPublished: (review: PublicReview) => void
}) {
  const [draft, setDraft] = useState<ReviewDraft>(initialDraft ?? EMPTY_DRAFT(storeId))
  const [preview, setPreview] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const requiresAttestation = !eligibility.completedVisit
  function submitPreview(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateReviewDraft(draft)
    if (requiresAttestation && !draft.manualVisitAttested)
      nextErrors.push('Confirm that you visited this store.')
    if (nextErrors.length) {
      setErrors(nextErrors)
      return
    }
    setErrors([])
    setPreview(true)
  }
  function publish() {
    setPending(true)
    setErrors([])
    client
      .publishReview(draft)
      .then((review) => {
        onPublished(review)
        setStatus(
          review.state === 'pending_review'
            ? 'Review submitted for review. It has not affected the average.'
            : 'Review published.',
        )
        setPreview(false)
      })
      .catch(() => setErrors([GENERIC_REVIEW_ERROR]))
      .finally(() => setPending(false))
  }
  if (preview)
    return (
      <section aria-labelledby="review-preview-heading">
        <h2 id="review-preview-heading">Preview Review</h2>
        <article>
          <p>
            <Stars rating={draft.rating ?? 1} /> · {draft.displayName}
          </p>
          <p>{draft.text || 'No written comment.'}</p>
          <p>
            Visited {draft.visitMonth}/{draft.visitYear}
          </p>
          <p>{formatConflict(draft.conflict)}</p>
        </article>
        <button type="button" onClick={() => setPreview(false)}>
          Back to Edit
        </button>{' '}
        <button className="button" type="button" disabled={pending} onClick={publish}>
          {pending ? 'Publishing…' : 'Publish Review'}
        </button>
      </section>
    )
  return (
    <form onSubmit={submitPreview}>
      <p>{REVIEW_RULES_MESSAGE}</p>
      <p>No location proof is collected. Your visit month and year are shown publicly.</p>
      <fieldset>
        <legend>Rating</legend>
        <div role="group" aria-label="Rating from 1 to 5">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              aria-pressed={draft.rating === rating}
              onClick={() => setDraft({ ...draft, rating })}
            >
              {rating} star{rating === 1 ? '' : 's'}
            </button>
          ))}
        </div>
      </fieldset>
      <label htmlFor="review-text">Review text (optional)</label>
      <textarea
        id="review-text"
        maxLength={2000}
        value={draft.text}
        onChange={(event) => setDraft({ ...draft, text: event.target.value })}
      />
      <label htmlFor="review-display-name">Public display name</label>
      <input
        id="review-display-name"
        maxLength={80}
        value={draft.displayName}
        onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
        required
      />
      <label htmlFor="review-month">Visit month</label>
      <input
        id="review-month"
        type="number"
        min={1}
        max={12}
        value={draft.visitMonth ?? ''}
        onChange={(event) => setDraft({ ...draft, visitMonth: Number(event.target.value) || null })}
        required
      />
      <label htmlFor="review-year">Visit year</label>
      <input
        id="review-year"
        type="number"
        min={2000}
        max={2100}
        value={draft.visitYear ?? ''}
        onChange={(event) => setDraft({ ...draft, visitYear: Number(event.target.value) || null })}
        required
      />
      <label htmlFor="review-conflict">Material conflict disclosure</label>
      <select
        id="review-conflict"
        value={draft.conflict}
        onChange={(event) => setDraft({ ...draft, conflict: event.target.value as ReviewConflict })}
      >
        <option value="none">No material conflict</option>
        <option value="employment">I work for this store</option>
        <option value="ownership">I own or operate this store</option>
        <option value="family">I have a family connection</option>
        <option value="vendor">I am a vendor or booth holder</option>
        <option value="compensated">I received compensation</option>
        <option value="other_material">Another material connection</option>
      </select>
      {requiresAttestation && (
        <label>
          <input
            type="checkbox"
            checked={draft.manualVisitAttested}
            onChange={(event) => setDraft({ ...draft, manualVisitAttested: event.target.checked })}
          />{' '}
          I visited this store.
        </label>
      )}
      <p>
        <a href="/review-rules">Review rules</a>
      </p>
      {errors.map((error) => (
        <p key={error} role="alert">
          {error}
        </p>
      ))}
      {status && <p role="status">{status}</p>}
      <button className="button" type="submit">
        Preview Review
      </button>
      <p>Public review photos are not available in this release.</p>
    </form>
  )
}

function OwnReviewActions({
  review,
  client,
  onChanged,
}: {
  review: PublicReview
  client: ReviewClient
  onChanged: (review: PublicReview | null) => void
}) {
  const [deletion, setDeletion] = useState<ReviewDeletion | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState<ReviewReportReason>('spam')
  const [appealOpen, setAppealOpen] = useState(false)
  const [appealReason, setAppealReason] = useState('')
  const [error, setError] = useState(false)
  function deleteReview() {
    client
      .requestDeleteReview(review.id)
      .then(setDeletion)
      .catch(() => setError(true))
  }
  function undo() {
    if (!deletion || !canUndoReviewDeletion(deletion)) return
    client
      .undoDeleteReview(review.id)
      .then((restored) => {
        setDeletion(null)
        onChanged(restored)
      })
      .catch(() => setError(true))
  }
  function submitReport() {
    client
      .reportReview(review.id, reportReason)
      .then(() => setReporting(false))
      .catch(() => setError(true))
  }
  function submitAppeal() {
    if (!appealReason.trim()) return
    client
      .submitAppeal({ reviewId: review.id, reason: appealReason.trim() })
      .then(() => setAppealOpen(false))
      .catch(() => setError(true))
  }
  return (
    <section aria-label="Your review actions">
      <p>Status: {review.state}</p>
      {deletion?.state === 'pending_undo' ? (
        <>
          <p role="status">
            Your review disappeared from public view and the store average immediately. You can undo
            this deletion for 60 seconds.
          </p>
          <button type="button" onClick={undo}>
            Undo Delete
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => onChanged(review)}>
            Edit
          </button>{' '}
          <button type="button" onClick={deleteReview}>
            Delete Review
          </button>{' '}
          <button type="button" onClick={() => setReporting(!reporting)}>
            Report a problem
          </button>
        </>
      )}
      {(review.state === 'removed' || review.state === 'rejected') && (
        <button type="button" onClick={() => setAppealOpen(true)}>
          Appeal
        </button>
      )}
      {reporting && (
        <div>
          <label htmlFor="review-report-reason">Reason</label>
          <select
            id="review-report-reason"
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value as ReviewReportReason)}
          >
            <option value="spam">Spam</option>
            <option value="threats_harassment_hate">Threats, harassment, or hate</option>
            <option value="personal_sensitive_information">
              Personal or sensitive information
            </option>
            <option value="impersonation">Impersonation</option>
            <option value="undisclosed_conflict">Undisclosed conflict</option>
            <option value="compensated_manipulation">Compensated manipulation</option>
            <option value="irrelevant">Irrelevant</option>
            <option value="legal_safety">Legal or safety concern</option>
          </select>
          <button type="button" onClick={submitReport}>
            Submit report
          </button>
        </div>
      )}
      {appealOpen && (
        <div>
          <p>
            One appeal is allowed within 30 days and is decided by a different reviewer. Reporter
            identity and internal evidence are never shown.
          </p>
          <label htmlFor="review-appeal-reason">Appeal reason</label>
          <textarea
            id="review-appeal-reason"
            value={appealReason}
            onChange={(event) => setAppealReason(event.target.value)}
          />
          <button type="button" onClick={submitAppeal}>
            Submit Appeal
          </button>
        </div>
      )}
      {error && <GenericReviewError />}
    </section>
  )
}

export function PublicReviewsPage({
  storeId,
  client = unavailableReviewClient,
}: {
  storeId: string
  client?: ReviewClient
}) {
  const [capability, setCapability] = useState<ReviewCapability | null>(null)
  const [snapshot, setSnapshot] = useState<StoreReviewsSnapshot | null>(null)
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null)
  const [eligibilityLoaded, setEligibilityLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState<PublicReview | null>(null)
  useEffect(() => {
    let cancelled = false
    client
      .getCapability()
      .then((result) => {
        if (cancelled) return
        setCapability(result)
        if (!isReviewCapabilityEnabled(result)) return
        return Promise.all([
          client.getStoreReviews(storeId),
          client.getEligibility(storeId).catch(() => null),
        ]).then(([reviews, eligible]) => {
          if (!cancelled) {
            setSnapshot(reviews)
            setEligibility(eligible)
            setEligibilityLoaded(true)
          }
        })
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, storeId])
  if (error)
    return (
      <ReviewCard
        title="Reviews unavailable"
        description="The review service is temporarily unavailable."
      >
        <GenericReviewError />
      </ReviewCard>
    )
  if (!capability)
    return (
      <ReviewCard title="Reviews" description="Loading the public review capability…">
        <p role="status">Loading…</p>
      </ReviewCard>
    )
  if (!isReviewCapabilityEnabled(capability)) return <ReviewUnavailablePage />
  if (!snapshot || !eligibilityLoaded)
    return (
      <ReviewCard title="Reviews" description="Loading store reviews…">
        <p role="status">Loading…</p>
      </ReviewCard>
    )
  const ownReview = snapshot.ownReview
  const editDraft = editing
    ? {
        storeId,
        rating: editing.rating,
        text: editing.text ?? '',
        displayName: editing.displayName,
        visitMonth: editing.visitMonth,
        visitYear: editing.visitYear,
        conflict: editing.conflict,
        manualVisitAttested: true,
      }
    : undefined
  return (
    <ReviewCard
      title="Share an honest visit"
      description="Public reviews show only your chosen display name and visit month/year."
    >
      <p>
        {snapshot.aggregate.average
          ? `${snapshot.aggregate.average.toFixed(1)} ★ · ${snapshot.aggregate.count} reviews`
          : 'No reviews yet.'}
      </p>
      <ReviewList reviews={snapshot.reviews} />
      {ownReview ? (
        <OwnReviewActions
          review={ownReview}
          client={client}
          onChanged={(next) => {
            if (next) setSnapshot({ ...snapshot, ownReview: next })
            setEditing(null)
          }}
        />
      ) : eligibility ? (
        <ReviewComposer
          storeId={storeId}
          eligibility={eligibility}
          client={client}
          initialDraft={editDraft}
          onPublished={(review) =>
            setSnapshot({
              ...snapshot,
              ownReview: review,
              reviews:
                review.state === 'pending_review'
                  ? snapshot.reviews
                  : [review, ...snapshot.reviews.filter((item) => item.id !== review.id)],
            })
          }
        />
      ) : (
        <p>
          <Link to="/auth/sign-in">Sign in to write a review</Link>.
        </p>
      )}
    </ReviewCard>
  )
}

export function ModerationQueuePage({
  client = unavailableReviewClient,
}: {
  client?: ReviewClient
}) {
  const [cases, setCases] = useState<ModerationCase[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [reason, setReason] = useState<Record<string, string>>({})
  const [pendingDecision, setPendingDecision] = useState<{
    item: ModerationCase
    action: ModerationAction
  } | null>(null)
  const [decisionError, setDecisionError] = useState(false)
  const [resolved, setResolved] = useState<ModerationCase | null>(null)
  const decisionErrorRef = useRef<HTMLParagraphElement>(null)
  const outcomeRef = useRef<HTMLElement>(null)
  useEffect(() => {
    client
      .listModerationCases()
      .then((items) => {
        setCases(items)
        setLoaded(true)
      })
      .catch(() => {
        setError(true)
        setLoaded(true)
      })
  }, [client])
  useEffect(() => {
    if (decisionError) decisionErrorRef.current?.focus()
  }, [decisionError])
  useEffect(() => {
    if (resolved) outcomeRef.current?.focus()
  }, [resolved])
  function decide(item: ModerationCase, action: ModerationAction) {
    const decision = {
      action,
      reason: reason[item.id] ?? '',
      mfaVerified: true,
      recentAuthAt: new Date().toISOString(),
    }
    if (!decision.reason.trim() || !canDecideModeration(decision)) return
    client
      .decideModerationCase(item.id, decision)
      .then((next) => {
        setCases((current) =>
          current.map((candidate) => (candidate.id === next.id ? next : candidate)),
        )
        setPendingDecision(null)
        setDecisionError(false)
        setResolved(next)
      })
      .catch(() => {
        setDecisionError(true)
      })
  }
  function moderationChoiceGlyph(action: ModerationAction): string {
    switch (action) {
      case 'hold':
        return '◔'
      case 'remove':
        return '✕'
      case 'restore':
        return '↻'
      case 'dismiss_report':
        return '○'
    }
  }
  return (
    <ReviewCard
      title="Review moderation"
      description="Case-scoped moderation requires MFA, recent authentication, a reason, and an append-only audit event."
    >
      {error && <GenericReviewError />}
      {resolved && (
        <section
          className="moderation-outcome"
          aria-label="Resolved moderation outcome"
          ref={outcomeRef}
          tabIndex={-1}
        >
          <p role="status">
            Review {resolved.id} is now {resolved.state}. Author notice is queued; the store average
            reflects this decision. Your reason was kept on the case and appended to the audit
            record.
          </p>
          <p>Public aggregate result: the store average reflects this decision.</p>
          <button type="button" className="button--secondary" onClick={() => setResolved(null)}>
            Back to Queue
          </button>{' '}
          {cases.some((item) => item.id !== resolved.id) && (
            <button type="button" className="button--secondary" onClick={() => setResolved(null)}>
              Review Next
            </button>
          )}
        </section>
      )}
      {!loaded ? (
        <p role="status">Loading moderation cases…</p>
      ) : cases.length === 0 ? (
        <p>No assigned moderation cases.</p>
      ) : (
        <ul aria-label="Moderation cases">
          {cases.map((item) => {
            const preview =
              pendingDecision?.item.id === item.id &&
              moderationPreview(pendingDecision.action, item.state)
            const action = pendingDecision?.item.id === item.id ? pendingDecision.action : null
            return (
              <li key={item.id}>
                <article>
                  <h2>Case {item.id}</h2>
                  <p>
                    Store scope: {item.storeId} · State: {item.state}
                  </p>
                  <p>Reason: {item.reasonCode ?? 'Unspecified report'}</p>
                  <ul>
                    {item.evidence.map((evidence) => (
                      <li key={`${item.id}-${evidence.kind}`}>
                        {evidence.kind}: {evidence.value}
                      </li>
                    ))}
                  </ul>
                  <label htmlFor={`moderation-reason-${item.id}`}>Decision reason</label>
                  <textarea
                    id={`moderation-reason-${item.id}`}
                    value={reason[item.id] ?? ''}
                    onChange={(event) => setReason({ ...reason, [item.id]: event.target.value })}
                  />
                  <p className="moderation-hint">
                    Enter a decision reason, then choose an action to see its exact consequence.
                  </p>
                  {(['hold', 'remove', 'restore', 'dismiss_report'] as ModerationAction[]).map(
                    (choice) => (
                      <button
                        key={choice}
                        type="button"
                        className="button--secondary moderation-choice"
                        disabled={!reason[item.id]?.trim()}
                        onClick={() => setPendingDecision({ item, action: choice })}
                      >
                        <span className="moderation-choice__name">
                          <span aria-hidden="true">{moderationChoiceGlyph(choice)}</span>{' '}
                          {moderationButtonLabel(choice)}
                        </span>
                        <span className="moderation-choice__desc">
                          {moderationChoiceConsequence(choice)}
                        </span>
                      </button>
                    ),
                  )}
                  {preview && action && (
                    <section
                      aria-label="Confirm moderation decision"
                      className="moderation-confirm"
                    >
                      <p>
                        Confirm {moderationButtonLabel(action)}: this changes the review’s public
                        moderation state to {moderationResultState(action)}. The preview below shows
                        the exact consequence of this action.
                      </p>
                      <dl className="moderation-preview">
                        <div>
                          <dt>Case transition</dt>
                          <dd>{preview.transition}</dd>
                        </div>
                        <div>
                          <dt>Public aggregate effect</dt>
                          <dd>{preview.aggregateEffect}</dd>
                        </div>
                        <div>
                          <dt>Author notice</dt>
                          <dd>{preview.authorNotice}</dd>
                        </div>
                        <div>
                          <dt>Reason and audit</dt>
                          <dd>{preview.reasonAndAudit}</dd>
                        </div>
                        <div>
                          <dt>Reversibility</dt>
                          <dd>{preview.reversibility}</dd>
                        </div>
                      </dl>
                      {decisionError && (
                        <p role="alert" ref={decisionErrorRef} tabIndex={-1}>
                          This decision could not be completed. Your reason is kept. Review the
                          preview and try again.
                        </p>
                      )}
                      <button
                        type="button"
                        className={`button${action === 'remove' ? ' button--danger' : ''}`}
                        onClick={() => decide(item, action)}
                      >
                        Confirm {moderationButtonLabel(action)}
                      </button>{' '}
                      <button
                        type="button"
                        className="button--secondary"
                        onClick={() => {
                          setPendingDecision(null)
                          setDecisionError(false)
                          document.getElementById(`moderation-reason-${item.id}`)?.focus()
                        }}
                      >
                        Change decision
                      </button>
                    </section>
                  )}
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </ReviewCard>
  )
}

export function RestrictionAppealPage({
  restrictionId,
  client = unavailableReviewClient,
}: {
  restrictionId: string
  client?: ReviewClient
}) {
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState(false)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!reason.trim()) return
    client
      .submitRestrictionAppeal({ restrictionId, reason: reason.trim() })
      .then((appeal) => setStatus(`Appeal status: ${appeal.state}.`))
      .catch(() => setError(true))
  }
  return (
    <ReviewCard
      title="Appeal review restriction"
      description="One appeal is allowed within 30 days and is decided by a different qualified reviewer."
    >
      <form onSubmit={submit}>
        <label htmlFor="restriction-appeal-reason">Reason</label>
        <textarea
          id="restriction-appeal-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
        {error && <GenericReviewError />}
        {status && <p role="status">{status}</p>}
        <button className="button" type="submit">
          Submit appeal
        </button>
      </form>
    </ReviewCard>
  )
}

export const ReviewsPage = PublicReviewsPage
export const ReviewModerationPage = ModerationQueuePage
export const ReviewAppealPage = RestrictionAppealPage
