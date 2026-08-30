# Antique Trail â€” Top-to-Bottom Ticket Review Verdicts

**Reviewer**: Product Owner (browser-verified via the review harness + Playwright)
**Date**: 2026-08-16
**Harness**: `npm run dev:review` on `http://127.0.0.1:4175`, identities via `?reviewAs=<id>&reviewState=success`
**Evidence run**: `npm run test:e2e:review` â€” **267 passed / 6 failed / 22 skipped / 2 did not run** (authoritative config, port 4174)

## Verdict scale

| Verdict | Meaning |
|---|---|
| âœ… 100% / Wowed | Browser-verified end-to-end; no review notes |
| ðŸŸ¡ Review notes | Works, but with findings (test defects, harness divergences, or sub-flows unreachable in the harness) |
| ðŸ”´ Not ready for review | Cannot be demonstrated in the browser per the review rule â€” provider/human/evidence gates |

---

## Browser-verified packages

### âœ… #16 â€” Package 4: Candidate Links, Candidate Share, Trip Ideas
Verified in browser: shares list, Accept flow, trip-ideas page, capture save, private share send, cross-account denial, blocked-senders with Unblock. All flows work with proper privacy separation.

### ðŸŸ¡ #17 â€” Package 5A: Manual trip planning, handoff, Go, and offline recovery
Core flows verified: plan page, stop management, Go journey, Check My Day tie-in, partner invitation.
**Review note â€” Review Hours acknowledgment path is unreachable in the review harness.** The harness `reviewHours` (`src/review-harness/clients.ts:943-960`) **throws** when unresolved hours warnings exist, while the production RPC `app_public.review_trip_hours` (migration `20260821100000_package_5a_authoritative_hours.sql:133-149`) returns the trip with `hoursReview` populated. Consequence: in production the first "Review Hours" click populates the acknowledgment fieldset; in the harness it produces a full-page "Trip unavailable" error with no recovery, so **"Acknowledge warnings and continue" cannot be browser-reviewed**. The e2e test `e2e/ui07-trip-flows.spec.ts:155-160` codifies the harness's divergent throw behavior. Per the review rule, this sub-flow is not reviewable as-is and should be reconciled (make the harness mirror production return semantics).

**RESOLVED 2026-08-23 (#111)**: the harness eviewHours (src/review-harness/clients.ts:953-968) now mirrors production return semantics - no throw on unresolved warnings; it returns the trip with hoursReview populated and state held at draft until acknowledgment. The codifying e2e (e2e/ui07-trip-flows.spec.ts 'Review Hours stays honest with an unresolved stale warning') exercises the full path: Review Hours click -> acknowledgment fieldset visible -> acknowledge -> warnings group cleared. Verified green: 
px playwright test --config playwright.review.config.ts e2e/ui07-trip-flows.spec.ts = 54 passed / 0 failed / 3 skipped (viewport-evidence tests) across desktop/tablet/mobile.

### âœ… #19 â€” Package 5B: Browse map and provider-backed Check My Day
Verified: suggested order + honesty disclaimers + "Use Suggested Order"/"Keep My Order". Map capability present with route-location disclosure.

### âœ… #20 â€” Package 6A: Partner invitation, consent, identity binding, and claims
Full browser walk verified: join (with `#token=review-partner-invite`) â†’ consent form (5 acknowledgements, valid submit) â†’ verify (E-01 gate fails closed: "Email verification is unavailable until the approved email provider gate passes.") â†’ status ("Invitation: consumed. Onboarding: approved.", withdraw available) â†’ draft (save â†’ "Draft status: draft.", submit â†’ "Draft status: submitted.") â†’ claim (accept updated terms â†’ claim fields â†’ "Claim status: submitted." + "Approved scope: this store only (Blue Finch Curios).") â†’ authority signal â†’ "Claim status: verification_pending." + "Request authority recheck". Join page fails closed without a token.

### âœ… #21 â€” Package 6B: Store Portal publishing, media, social links, and support
Verified: portal home (Blue Finch Curios, hours verification, M-01 media gate notice), Hours & holidays editor (Save hours works), Store Updates (text publishes immediately, archive works), Official links (publish + canonicalization), Store information (Representative-Managed vs Controlled fields), support request.

### âœ… #22 â€” Package 7: Administrator review, Access & Safety, and duplicate merge
Verified: review queue â†’ Blue Finch Curios store change (address) case; reason-required Approve/Return/Reject; two-step "Confirm approve" with audit history; case resolved. Access & Safety: revoke (reason-required) â†’ "River â€” revoked" â†’ regrant available; duplicate-merge tool present. Partner administration screen verified.

### âœ… #23 â€” Package 8A: Synthetic Internal Alpha
Shopper/representative/administrator separation verified across flows; Test Account isolation holds (cross-account fixture denial in harness).

### âœ… #24 â€” Package 8B: External Testing Readiness
Verified: `/admin/reviews` moderation case (moderation-1, spam) with reason-required decisions, Remove â†’ confirm â†’ "Author notice is queued; the review is removed." + case state "removed" + audit reason recorded. Restriction appeal page verified ("One appeal is allowed within 30 days and is decided by a different qualified reviewer."). Public store reviews fail closed ("Public reviews are not available in this release.") â€” honest stage gating.

### âœ… #25 â€” Package 8C: Three-store Controlled Private Beta
Verified: `/admin/beta/cohort-1` fails closed ("Private Beta expansion is unavailable. No store or participant access has changed."); `/admin/readiness/run-1` fails closed ("Readiness evidence is unavailable. No readiness decision has been changed."); `/partner/activate` fails closed ("Activation requires a verified email, MFA, and an exact approved store grant. No grant is available in this stage.") with material-terms re-acceptance. All gate UIs are honest and fail closed.

### âœ… #26 â€” Package 9: Public reviews, moderation, appeals, and abuse controls
Admin moderation workspace verified end-to-end (case, reason-required decisions, two-step confirm, audit trail, resolved state). Appeals UI verified. Restriction model present. (Public review display itself is stage-gated closed at this stage â€” see #24.)

---

## Evidence gates (not browser-reviewable)

Per the review rule ("if you can't review it with playwright then it's not ready for me to review"), the following are **provider/human/evidence gates** whose deliverable is dated evidence, not UI. The **fail-closed UI for each is verified** where one exists; the gate itself cannot be demonstrated in a browser.

### ðŸ”´ #18 â€” SLM-01: Private Synthetic learning checkpoint
A dated human evidence checkpoint proving the separate-account journey (Browse â†’ Details â†’ Save â†’ Review Hours â†’ Trip/Partner/Navigator â†’ external-map Go â†’ private memory). Every underlying flow is browser-verified (see #16, #17, #19, #20), but the **checkpoint itself is human evidence** â€” cannot be browser-reviewed. Not ready for user review until the dated evidence record exists.

### ðŸ”´ #2 â€” H-01: Hosting, recovery, quotas, and cost boundary
Infrastructure/provider gate (`$0` recurring infra, 15-min RPO/4-hr RTO proof). No browser demonstrable UI.

### ðŸ”´ #3 â€” E-01: Transactional email provider
Provider gate. Fail-closed UI verified (#20 verify step), but the provider itself is not engaged.

### ðŸ”´ #4 â€” R-01: Routing and geocoding provider
Provider gate. Store Browser map + external-map handoff UI verified (#19), but the named routing provider is not engaged.

### ðŸ”´ #5 â€” M-01: Real media processing
Provider/processing gate. Fail-closed UI verified (portal changes page: "Official images and screenshots are disabled until the M-01 media gate passes."), but real media processing is not engaged.

### ðŸ”´ #6 â€” L-01: External audit-chain anchor
External-service gate; append-only audit UI verified but the external anchor is not engaged.

### ðŸ”´ #7 â€” S-01: Support and incident-status path
Support ticket UI verified (portal support request), but the operational support/incident-status path is a human/ops gate.

### ðŸ”´ #9 â€” HC-02: Public-promotion operational capacity
Human capacity gate.

### ðŸ”´ #10 â€” SEC-01: Independent security review
Human review gate; not browser demonstrable.

### ðŸ”´ #11 â€” B-01: Final brand and domain approval
Human approval gate.

### ðŸ”´ #27 â€” Package 10A: CAT-01 and Controlled Regional Readiness Evidence
Evidence gate (dated Product Owner approval of catalog density, independent-shopper evidence, accessibility, legal, capacity, security, support, incident, recovery, hosting/cost, promotion artifacts; zero Blocking Defects).

### ðŸ”´ #28 â€” Package 10B: Topeka regional release and promotion
Release gate after 10A + public RPO/RTO proof; promotion begins only after this.

### ðŸ”´ #29 â€” Package 11: RG-01 Topeka success evidence
Evidence gate (authoritative consenting data, fixed formulas, signed receipt, linkage purge) â€” separate from D30.

### ðŸ”´ #30 â€” Package 12: One-community activation run
Post-RG-01 per-area run needing Product Owner choice + repeatable controls.

### ðŸ”´ #46 â€” Public launch readiness gate after controlled beta
Final dated gate after controlled beta expansion evidence.

---

## PR #49 verdict

Open code change (branch `fix/package3-correction-integrity`, HEAD `9e5ebee`). Checks: web = SUCCESS, database = SUCCESS, Supabase Preview = SKIPPED (manually noted, not a blocker). **Mergeable.** Supabase Preview check was not run â€” flag for the author if CI parity matters.

---

## Authoritative e2e suite findings (6 failures â†’ 3 test defects, NOT product defects)

| Failure | Root cause | Verdict |
|---|---|---|
| `review-harness.spec.ts:67` (desktop/tablet/mobile) | Test asserts text `'Hours need review'`; harness fixture renders `'Hours verified 12 days ago'` (confirmed live). Stale assertion vs fixture. | ðŸŸ¡ Test bug â€” update the assertion or fixture label. |
| `ui08-partner-portal.spec.ts:174` (desktop+tablet) | "200% zoom" test applies `document.body.style.zoom = '2'` at a 320px viewport, then compares **scaled** `getBoundingClientRect()` against **unscaled** `clientWidth` â€” every full-width element falsely "overflows". The correct WCAG-equivalent test (`review-harness.spec.ts:115`, 320px viewport, no zoom) **passes**. | ðŸŸ¡ Test methodology bug â€” drop the body-zoom double-measurement. |
| `catalog.spec.ts:184` (tablet only) | Test branches at width â‰¤ 540 for the mobile "Filters" button; product collapses filters at â‰¤ 800px per DESIGN_SYSTEM (single-column 320â€“800px). At 768px the product correctly collapses (confirmed live: panel `display:none`, Area select zero-size), but the test expects desktop. | ðŸŸ¡ Test breakpoint mismatch â€” align the branch with the 800px design breakpoint. |

**Conclusion**: the 6 failures are all test-suite defects (stale assertions / flawed zoom measurement / wrong breakpoint). No product defect surfaced; the product passes the corrected equivalents.

---

## Harness limitation (documented, not a product bug)

Fixture mutations persist only within one document load; a full reload resets them. Manual browser walks that need state continuity (e.g., draft â†’ submit â†’ claim) are verified per-page in the harness, and the full journey is covered by the serial e2e suite (`ui08-partner-portal.spec.ts`).

---

## Summary

## Issue #116 fresh sweep — 2026-08-27

Fresh driver evidence: `docs/testing/issue-116-verification.md`; the focused review command completed with **51 passed / 6 skipped / 0 failed** across desktop, tablet, and mobile. The eight lane reports are recorded in `docs/testing/issue-116-agent-01.md` through `docs/testing/issue-116-agent-08.md`.

Packages 6A, 6B, and 7 live flows passed the fresh browser run. Review notes remain for six implementation/evidence gaps: #130 Access & Safety assurance/activity fields, #131 narrow View Audit and stale tokenless-join evidence, #132 Store Information hydration/navigation, #133 active-scope revoke preview contract, #134 pre-authorization draft rendering, and #135 direct-route/cross-store denial coverage. Every finding is filed; these are tracked follow-up tickets, not unfiled failures.

| Verdict | Tickets |
|---|---|
| âœ… 100% / Wowed | #16, #19, #20, #21, #22, #23, #24, #25, #26 |
| ðŸŸ¡ Review notes | #17 (Review Hours harness divergence), PR #49 (Supabase Preview check skipped), 3 e2e test defects |
| ðŸ”´ Not ready for review (evidence gates) | #2, #3, #4, #5, #6, #7, #9, #10, #11, #18, #27, #28, #29, #30, #46 |

---

## Issue #145 review-context strip — 2026-08-28

Review-only context now uses a compact strip rather than the generic `page-card` surface. Focused harness tests and the review-harness browser sweep passed; the sweep covers public, shopper, representative, and administrator routes at configured desktop/tablet/mobile viewports plus an explicit 320 CSS-px pass. Evidence: `docs/evidence/issue-145/review-context-2026-08-28.md`.
## Issue #133 revoke-preview contract — 2026-08-28

Pending hosted database CI. The local UI/client contract verifies operation-bound active revoke and revoked regrant previews; the database migration prevents a preview from authorizing the wrong scope operation and consumes it once used.
# Issue #141 shared form-control contrast — 2026-08-28

Shared native text controls now use semantic light/dark tokens for default, hover, placeholder, disabled, invalid, and focus states. Measured contrast and focused browser evidence are recorded in `docs/evidence/issue-141/shared-form-control-contrast-2026-08-28.md`; protected role workflows remain covered by their own contracts rather than synthetic form-route claims.

## Issue #138 onboarding approval path — 2026-08-28

The Administrator queue presents a distinct New stores category and an allowlisted Pilot Store Draft decision view. The approval outcome names only the created Pilot Store Record and exact store-scoped Representative grant; the UI fixture is not evidence of the database’s atomic authorization boundary. Focused unit/type/browser checks passed, while the pgTAP contract remains pending hosted CI because the local Docker engine was unavailable. Evidence: `docs/evidence/issue-138/onboarding-approval-2026-08-28.md`.
## Issue #151 catalog action area — 2026-08-28

The public card now groups its existing trip link and optional private continuations in a named store-specific action region; review-harness browser coverage passes from desktop through 320px without overflow.

## Issue #152 administrator queue composition — 2026-08-29

The Administrator review queue now keeps loading, assigned, empty, error/retry, and resolved states in a bounded workspace with an assigned-category summary and one Review path per case. Independently rerunnable evidence records 11 focused component tests, typecheck, lint, Prettier, and diff checks passing, plus the synthetic review-harness browser suite at **36 passed / 0 failed / 3 skipped** across desktop, tablet, and mobile. The harness validates presentation and interaction against fixtures; it is not evidence of production RPC/RLS enforcement, database authority, or hosted CI. Evidence: docs/evidence/issue-152/review-queue-composition-2026-08-29.md.

## Issue #151 action-area verification — 2026-08-29

The region now owns its own metadata boundary, spacing, and stacking context; the injected private controls no longer create a second divider. Fresh focused unit, type, lint, formatting, diff, and 3-project review-harness browser checks passed across 1440/768/390/320 CSS-px anonymous and shopper fixtures. This is synthetic-harness presentation/focus evidence, not production RPC/RLS, persistence, authentication, or hosted-CI evidence. Details: `docs/evidence/issue-151/catalog-action-area-2026-08-29.md`.

## Issue #150 trip-planning CTA hierarchy — 2026-08-29

PlanPage now separates planning tasks, limits filled actions to each task's completion, keeps utilities/reorder controls secondary, and requires exact-stop cancellation or confirmation before removal. Focused component/type/lint/format/diff checks and the 4-test Chromium/mobile UI07 browser pass are recorded in `docs/evidence/issue-150/trip-planning-cta-hierarchy-2026-08-29.md`. The browser uses deterministic review fixtures: it demonstrates hierarchy and interaction presentation only, not production trip persistence, RPC/RLS, authentication, navigator-device authority, or hosted CI.

## Issue #149 Store Portal status grouping — 2026-08-29

Portal Home now groups the authoritative snapshot's publication state, timezone, freshness, provenance, and controlled-change summary in a named Store status surface. Fresh component/type/lint/format checks and deterministic representative-harness browser coverage pass, including 390/320 CSS-pixel no-overflow checks; details and dated artifacts are in `docs/evidence/issue-149/portal-status-grouping-2026-08-29.md`. This is synthetic-harness presentation and client-navigation evidence only, not production provider/RPC/RLS, authentication, database, media-capability, or hosted-CI evidence.

## Issue #148 catalog-card detail destination — 2026-08-29

Each public catalog card now retains its linked store-name heading and exposes an explicit primary `View {store} details` link to the same store route; the former full-card title overlay is gone. The existing #151 visit-options region remains separate: `Add to Trip` remains a secondary encoded deep link, and private actions retain their own authorization-owned content. Focused component checks, type/lint/format/diff checks, and the deterministic review-harness browser test pass across desktop/tablet/mobile, including 320 CSS-px, dark, forced-colors, keyboard activation, failed-image parity, focus progression, and no-overflow checks. This is synthetic-harness presentation and client-navigation evidence only, not production RPC/RLS, authentication, persistence, catalog-provider, or hosted-CI evidence; details: `docs/evidence/issue-148/catalog-card-detail-destination-2026-08-29.md`.

## Issue #143 resilient media captions and controls — 2026-08-29

Store Photos and Store Details now share one opaque caption/control treatment whose computed colors meet 4.5:1 text and 3:1 control-boundary contrast independently of image pixels. The deterministic review harness passed 31/31 cases and produced 31 hashed captures across 320px, coarse-pointer 768px, and 1440px, including opened lightboxes at each width and a text-spacing lightbox; light/dark, near-white/high-detail/near-black/unavailable imagery, forced colors including unavailable media, delayed decode, keyboard, touch, reduced motion, inert modal isolation, focus restoration, alt-equivalent action names, full clipping-ancestor containment, center hit-testing, fixed-navigation separation, and actual horizontal-scroll reachability are asserted. Catalog mapping remains limited to public `src`, `alt`, and `kind`; optional caption/rights production availability and hosted CI remain outside this local synthetic proof. Evidence: `docs/evidence/issue-143/media-overlay-contrast-2026-08-29.md`.
