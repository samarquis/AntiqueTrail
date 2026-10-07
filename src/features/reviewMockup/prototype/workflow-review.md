# Connected workflow repair review

Reviewed 2026-10-07. The mockup now carries decisions and entered values through its connected shopper, owner and administrator journeys. This is local fictional prototype evidence. Production behavior, service integrations and publication are not established by this review.

## Source and evidence

- Original reviewed source: `2ccaebde37df8d00930e2114488c73dffb51683a`.
- Final HTML source: `473405e3237762943b6d1845e04fe7e9f20a0bf1`.
- Final HTML SHA-256: `b37b9b23e166fa78eb32f2b0b681c964c675731903c72b372784de710dd2a2cb`.
- [Verification receipt](verification.json) and [portable replay evidence](verification-replay.json) bind final checks to that HTML.
- All 78 directory pages rendered; all 390 direct page presentations across five fresh role fixtures passed the recorded presentation and access-gate checks. Directory shortcuts stage prerequisites; direct-role checks use fresh fixtures with an unapproved owner.
- Browser error/warning log was empty. Inline JavaScript syntax and Git whitespace checks passed. Mobile planner widths 390 and 320, and application-review width 390, had no horizontal document overflow.
- Two independent read-only reviewers cleared the final source after checking exact-store scope and the repaired state transitions. Those source/function checks complement the browser evidence; they do not establish real authorization or payment behavior.

## Response and connection by role

| Role | Connected behavior after repairs | Practical boundary |
| --- | --- | --- |
| Visitor | Browse, search, public details, gallery and store news remain available. Private support, trip, account and application routes ask for sign-in. Role changes close pending privileged confirmations. | No real account/session enforcement is implemented by this client-side demo. |
| Returning shopper Mara | Arrival and completed visits remain separate from optional private notes. Skip/Undo restores the last stop and removes its stale completion snapshot. Completed history is read-only; repeating asks for a new date. Support replies return to Mara's selected request. | Navigation and travel minutes are illustrative. Notes and drafts reset on reload. |
| Other shopper Alex | History, memories, active trip selection, drafts and support stay scoped to Alex. Switching back restores Mara's selected outing. | Separate fictional identities demonstrate intended scope, not backend privacy proof. |
| Store owner Evelyn | Search selects the actual store. Application answers and hours survive backtracking. Submission remains gated until approval. Each store retains its own grant, application, drafts, media review and billing preview. A new application starts Free and unpaid. | Store Owner and authorized manager share the intended exact-store workspace; no team-editing implementation was added. |
| Site admin June | Application review reads the entered facts, weekly schedule, exceptions and authority explanation. Decisions retain exact feedback. Each pending update image is independently selectable. Controlled changes apply submitted values; revocation and audit entries identify the actual store. Support fields identify the selected requester. | Administrator review does not expose shopper-private trips, ratings or notes. All decisions and audit records are fictional. |

## Disposition of original walkthrough gaps

| Finding | Repair and resulting behavior | Evidence class |
| --- | --- | --- |
| F1: optional review lost a visit | Explicit arrival/completion records the visit before optional review. Skipping review preserves the visit. | Final browser replay and history screenshot. |
| F2: unrelated memory appeared in summary | Memories carry outing identity; summary reads only that outing's memories. | Browser replay and exact-source review. |
| F3: private/privileged actions survived role changes | Private route gates, actor checks and confirmation cleanup now apply across role/navigation changes. | Five-role matrix, support privacy replay and reviewer checks. |
| F4: store news leaked across listings | Updates carry store identity; public detail/news reads only selected-store publications. | Final two-store browser replay. |
| F5: approved address was acknowledged but unapplied | Typed approved changes reach catalog facts and navigation. A changed planned destination requires explicit reconfirmation. Effective dates apply to the selected shopping date. | Connected candidate browser replay plus final exact-source/function review. |
| F6: authority review omitted submitted facts | Owner and admin readback includes actual facts, schedule, exceptions and authority explanation. Incomplete approval is gated. | Connected candidate browser replay plus final exact-source review. |
| F7: custom review feedback was lost | Requested changes/rejection display the actual decision reason. | Connected candidate browser replay and final review. |
| F8: owner search selected a fixed listing | Search filters name/town; claim carries the selected listing; unlisted and no-result paths remain available. | Browser replay. |
| F9: news fields and history were discarded | Headline/type/body/end date persist; updates coexist and can be edited/archived. Pending image revisions preserve their earlier publication. Sale expiration uses its entered end date. Multiple image submissions remain individually reviewable. | Final image/publication replay and reviewer checks. |
| F10: hours contradicted planning | Public hours, weekly schedule and selected-date checks share the saved schedule. Invalid/reversed/overlapping hours are rejected. Driving time and unknown hours remain explicit. Future closures affect future outings. | Final validation/publication replay, candidate future-date browser replay and final function review. |
| F11: repeat chose a date | Repeat creates a separate draft with an empty required date, preserving earlier history. | Final browser replay. |
| F12: paid offer decisions missing | Remains open: amount/tax, capacities, plan count, renewal/cancellation dates and retained-photo visibility need approved product/commercial decisions. Preview states remain explicit. | Final offer and payment-failure browser replay. |
| F13: response/orientation gaps | Favorite state, unrated/default-note presentation, filtered map/list, support empty/topic states, actual support recipient, owner help and feedback cleanup now reflect the selected context. | Browser replay, final page sweep and source review. |

Additional independent-review defects were repaired: hours lost on going back, stale final-stop history after Undo, orphaned image reviews, future-date fact checks, lost earlier store grants, incorrect audit/revocation store names and inherited billing/photo/control state when beginning another application.

## Remaining decisions and proof

The paid offer is the remaining product decision from this walkthrough. It should be resolved before presenting a purchasable offer. Authentication, email/MFA, persistent grants/privacy, media processing, support delivery, maps/routing, billing, export/deletion and hosted/production behavior still require separate service-backed acceptance.

The final browser replay is focused connected regression evidence, not exhaustive action or accessibility coverage. Earlier exploratory logs include superseded checks and an obsolete hash captured by a helper closure; those logs are excluded from the portable receipt. The final receipt uses a fresh helper that reads the HTML hash for every recorded check. Reticle was unavailable; verification used supported browser controls, visible readbacks, screenshots and independent source/function review.

No production source, provider, PRD authority, prices or real accounts were changed. Repairs remain in the isolated local branch `codex/mockup-workflow-fixes`; this review does not assert external documentation publication, a push, merge or deployment.
