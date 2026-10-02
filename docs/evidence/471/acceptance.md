# Evidence — #471 owner-intake routes

## Candidate

- Issue/spec: [#471](https://github.com/samarquis/AntiqueTrail/issues/471); [PR #481](https://github.com/samarquis/AntiqueTrail/pull/481).
- Owner: takeover chat; isolated worktree `20d6/AntiqueTrail`; local branch `codex/issue-471-scope-correction`, published to existing `codex/issue-471-owner-intake-routes`.
- Risk: standard; public route presentation. Server availability authority unchanged.
- Ticket-admission baseline: `c9bb80250d5087ace3638059da09cd628bc1fad6`.
- Integration base: `de76d381ca7b522b25c61eea20920569085f3b93`.
- Takeover starting head: `1fd901f5e0b471bb372e2c75b675138b4c03da84`.
- Corrected source/test commit: `de09752c2b1222b4b2f12c6cd4086451d1cafb40`; evidence-only descendant is the final PR candidate. Exact final head/fingerprint/checks/reviews are recorded in PR handoff.
- Evidence date: 2026-10-02.

## Scope and correction

For `/for-stores` and `/partner/claim`, show the catalog-only explanation and Browse stores link only after a successful availability response has the route's required flag false. Loading and rejected/unknown lookup retain the existing fail-closed NotFound state without asserting product policy. Available-route flows and other guards remain unchanged.

Own App.tsx and direct App.test.tsx assertions. Strict scope removal first reproduced the legacy adjacent 404 assertion conflict at `3b6a0999` (41/42). User allowed a minimal adjacent assertion amendment, producing `63a23ece` (42/42). Root review then identified that the guard incorrectly used stage-policy copy for initial loading and lookup rejection. This later correction supersedes that behavior and evidence: the original adjacent assertion now passes unchanged, so the final PR has no `ownerAcquisitionPage.test.tsx` diff. The temporary scope allowance is not needed by the final implementation.

No application, claim, invite, activation, provider mutation or deployment is included. Preserve prior owner's worktree. [Takeover receipt](https://github.com/samarquis/AntiqueTrail/issues/471#issuecomment-5959477016). App.tsx seam remains held; #473 stays queued until root exact-head review/merge. Root must approve the exact final head before merge.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Bind canonical source/artifact before interpreting routes | Prior read-only canonical alias/metadata and [#465 publication receipt](https://github.com/samarquis/AntiqueTrail/pull/465#issuecomment-5952156359) bind `antique-trail.vercel.app` to deployment `dpl_6zUinfmc3LhkpvH7ELAvSHxRyMnT`, URL `antique-trail-1xnz1ydq2-scott-marquis-projects.vercel.app`, source `c9bb80250d5087ace3638059da09cd628bc1fad6`, artifact SHA-256 `D8F3C8980BB8E08CE5D3A88722B4E3082F8528845B037CEB26AC5605E0183940` | Recorded before original route edits; historical receipt, not a new production inspection |
| Recheck both routes against identified deployment | Prior anonymous browser checks found Page not found on both paths; [classification receipt](https://github.com/samarquis/AntiqueTrail/issues/471#issuecomment-5955924300) | Intentional withheld acquisition, not a stale-artifact discrepancy |
| Explain confirmed stage denial | Direct tests independently set `routeVisible=false` and `claimsAvailable=false` with other flags true; local synthetic rendered checks return a successful all-false availability object | Pass: explanatory heading/body, `/stores` return link, no intake forms/actions |
| Do not claim policy before confirmation | Both routes tested with pending promises and rejected availability; asynchronous rejection is flushed before assertions | Pass: NotFound and no policy heading/forms/intake actions |
| Preserve available flow and server gate | Existing available owner flow remains tested; guard uses only the required flag after ready state | Pass |
| Keep source scope bounded | Adjacent test restored byte-for-byte to integration base; final runtime/tests only change App.tsx and App.test.tsx | Pass |
| Render a clear return path | Both routes captured at desktop 1366x900 and mobile 375x812 (mobile override requested 390x844; actual DOM viewport not independently measured); each actual Browse stores click reaches `/stores` and visible catalog H1 | Pass, local synthetic proof only; see receipt and screenshots below |
| Separate evidence classes | No deployment/provider mutation; synthetic client never calls hosted provider | Pass; no candidate production acceptance claimed |

## Verification

| Layer | Command / source | Result and binding |
| --- | --- | --- |
| Test-first regression | App.test.tsx filtered to `while loading availability` before guard repair | 2 failed: loading incorrectly rendered catalog-only policy. Red log belongs to predecessor `63a23ece` plus new regression tests. |
| Focused corrected tests | `npx vitest run src/app/App.test.tsx src/features/partners/ownerAcquisitionPage.test.tsx --pool=threads --maxWorkers=1` | 45/45 pass on corrected source/test tree committed as `de09752c`; 41 direct App tests and 4 unchanged adjacent tests. |
| Full clean web validation | `npm run check` on `de09752c` | Pass: typecheck, lint (0 errors; 16 existing warnings), formatting, 1095 unit tests (1 skipped), 164 release tests, build and seed-media checks. Applies to source/test commit `de09752c`. First attempt stopped at lint because temporary ignored browser-fixture config was inside ESLint's scan; fixture moved outside checkout and check rerun. No tracked source fix or lint weakening. |
| Local rendered/negative states | Temporary synthetic fixture imports committed App and CSS unchanged; availability client resolves all-false, never settles, or rejects; catalog is demo data | Four denial/render/navigation cases and four pending/rejection cases pass. [Browser receipt](browser-receipt.json) binds source `de09752c`. No console error entries; existing React Router v7 future-flag warnings observed. No HTTP/provider trace claimed. |
| Historical CI/reviews | Takeover and `63a23ece` results | Historical only; guard source change invalidates those checks/reviews for final candidate. |
| Final hosted CI/reviews | Exact published PR head | Fresh web/database/configured-owner-billing and independent Spec/Standards reviews required; final outcomes recorded in PR handoff. Supabase Preview is a separate skipped integration. |
| Database/hosted lifecycle | No local database/provider run or mutations | No schema/RPC/RLS/authority change; required database CI remains separate. |
| Canonical production | Historical source-bound observations above | Candidate production behavior unverified; deployment excluded. |

Rendered screenshots: [for-stores desktop](for-stores-desktop.jpg), [for-stores mobile](for-stores-mobile.jpg), [partner claim desktop](partner-claim-desktop.jpg), [partner claim mobile](partner-claim-mobile.jpg). These are JPEG captures of synthetic local source proof, not canonical screenshots. Mobile capture dimensions are 375x812 despite requesting a 390x844 viewport override; exact 390x844 rendering is not claimed. They replace the earlier unavailable stock-review-harness proof, not the production baseline receipt.

Local browser servers on owned ports 4185 and 4186 were stopped and tab closed. Proof was captured before root's shared-browser-lane hold arrived. Further local browser runs wait for root's explicit lane release; no use of #469's port 4174.

## Security and negative proof

No auth, authorization, availability authority, secrets or data flows changed. Unknown/pending/rejected lookups remain fail-closed without policy claims. Only confirmed false flags on the two public routes get the explanatory fallback. Other guards retain NotFound. Unchanged adjacent regression forbids acquisition even with activation/reviewer query parameters.

## Review, completion and invalidation

Root rejected `63a23ece` for inaccurate loading/rejected-state policy copy and missing rendered receipt. Both are corrected by this source/evidence candidate; earlier independent verdicts are superseded. Obtain new exact-head Standards and Spec reviews with these corrected requirements. Keep source frozen during reviews/CI.

Root final-head approval, merge and verified live issue closure remain pending. At closure, record the project-reflection ticket event. No merge, closure or deployment is claimed here.

Any affected source/configuration/fixture or integration change requires refreshed checks/review. Evidence-only descendants require reviewing documentation/artifact deltas; do not relabel prior source/runtime proof as a new execution.
