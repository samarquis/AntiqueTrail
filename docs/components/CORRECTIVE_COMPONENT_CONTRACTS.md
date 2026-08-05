# Corrective component contracts

These contracts supplement `DESIGN_SYSTEM.md` for components added or materially changed by the corrective ticket tranche.

## AccessibleCatalogMap

- **Anatomy:** attributed map region, non-map list equivalent, store markers, and explicit unavailable state.
- **States:** blocked, ready, empty, selected marker, and renderer failure with list/filter state retained.
- **Semantics:** the map is supplementary; its region has an accessible name and never replaces the store list.
- **Keyboard/focus:** every marker is a native button in catalog order; selection does not move focus unexpectedly.
- **Failure recovery:** provider/configuration failure removes the map enhancement while preserving the current query, filters, and list.

## Partner onboarding and claim pages

- **Anatomy:** bounded invitation/claim status, visibly labelled identity or authority fields, separate acknowledgements, one primary action, and reason-neutral failure region.
- **States:** checking, active/resumable, invalid or terminal invitation, submitting, consent-current/reconsent-required, claim pending/conflict/recheck, and success.
- **Semantics:** status and errors use live-region roles; another claimant, secret, or evidence payload is never rendered.
- **Keyboard/focus:** document order follows the task; native labels and controls provide full keyboard operation; async refresh retains the active control.
- **Failure recovery:** typed values remain after recoverable errors; opaque resume handles restore only the server-authorized step.

## Administrator operational workspace

- **Anatomy:** one immutable case context, exact action controls, required reason, optimistic version, rate-limit/authorization error, and no bulk action.
- **States:** loading, unavailable, pending, action in progress, approved/returned/rejected/revoked, conflict, rate limited, and stale audit-anchor denial.
- **Semantics:** case and scope status are textual and not color-only; destructive actions are explicitly labelled.
- **Keyboard/focus:** native controls follow case order; completing one action returns focus to the updated case heading or next case.
- **Failure recovery:** server denial is reason-neutral, preserves the case context, and requires refresh after a version conflict.

## BetaControlPage

- **Anatomy:** cohort state, server-derived ordinal/composition, evidence-freeze challenge, explicit decision/admission/recovery actions, and result region.
- **States:** blocked, preparing, challenge issued, challenge stale, decision pending, active, paused, withdrawn, recovered, and complete.
- **Semantics:** no client field can assert evidence totals, role composition, gate truth, or expansion order.
- **Keyboard/focus:** labelled native controls and buttons use document order; no action is hover-only.
- **Failure recovery:** stale evidence/challenge and failed operational latches deny the command without clearing server state or admitting a store.

## Portal official-media form

- **Anatomy:** server capability status, placement, bounded file input, alternative text, rights confirmation, submit action, and review status.
- **States:** capability checking, M-01 blocked, ready, validating, uploading/processing, awaiting review, denied, and retryable failure.
- **Semantics:** the original file is described as private; only the processed derivative can reach Administrator review and later publication.
- **Keyboard/focus:** native file/select/text/checkbox controls have visible labels and retain normal tab order; submission does not move focus on failure.
- **Failure recovery:** blocked capability renders no file control; failed upload retains the selected metadata for correction/retry; publication is never implied by upload acceptance.

## OperationalStatusPage

- **Anatomy:** response commitment, status link, support link, security link, privacy warning, or one fail-closed status message.
- **States:** incomplete/blocked and fully configured.
- **Semantics:** the heading labels the section; the blocked message uses `role=status`; only credential-free HTTPS or query-free `mailto:` destinations render.
- **Keyboard/focus:** all destinations are ordinary links in reading order; navigation does not open forced popups.
- **Failure recovery:** any missing or unsafe value hides every operational link so partial configuration cannot misdirect a report.

## Moderation and appeals workspace

- **Anatomy:** case-scoped evidence, reviewer credential status, explicit decision, different-reviewer appeal assignment, deadline, and audit result.
- **States:** credential setup, unavailable, assigned, submitted, decision pending, decided, expired, restricted, appealed, and fail-closed verifier error.
- **Semantics:** global/shadow suspension is absent; identity and evidence are disclosed only within the assigned case.
- **Keyboard/focus:** all decisions and credential actions are labelled native controls; focus remains within the active case after async refresh.
- **Failure recovery:** stale/replayed assertions, fewer than two active non-discoverable credentials, and verifier outages deny activation or decision without trusting browser-supplied counts.
