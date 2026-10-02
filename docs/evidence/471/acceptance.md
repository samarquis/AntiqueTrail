# Evidence — #471 owner-intake routes

## Candidate

- Issue/spec: [#471](https://github.com/samarquis/AntiqueTrail/issues/471); [PR #481](https://github.com/samarquis/AntiqueTrail/pull/481).
- Owner: takeover chat in `C:/Users/samar/.codex/worktrees/20d6/AntiqueTrail`; branch `codex/issue-471-scope-correction`, published only to existing `codex/issue-471-owner-intake-routes`.
- Risk: standard for existing route presentation; low for takeover's assertion-only scope correction. Server-owned availability gates remain unchanged.
- Ticket-admission baseline: `c9bb80250d5087ace3638059da09cd628bc1fad6`.
- Integration base: `de76d381ca7b522b25c61eea20920569085f3b93`.
- Takeover starting head: `1fd901f5e0b471bb372e2c75b675138b4c03da84`.
- Final source/test commit: `f23185dde891b8727770a1d8c77577e9f3b11781`; evidence-only descendant is the PR candidate. Exact final head, fingerprint, CI and reviews are recorded in the PR handoff.
- Evidence date: 2026-10-02.

## Scope and ownership

When `/for-stores` or `/partner/claim` is withheld, display a shared catalog-only explanation and a Browse stores link. Preserve server authority and existing available-route behavior. Other guarded routes retain their NotFound fallback.

Own App.tsx and direct App.test.tsx assertions. User authorized a scope amendment on 2026-10-02 after the requested strict two-file correction demonstrated a conflicting legacy assertion: permit only the stale heading assertion update in `src/features/partners/ownerAcquisitionPage.test.tsx`. Live issue body records the amendment. Its existing no-acquisition assertion remains intact; extra test title/link/form edits from the takeover starting head were removed. Direct App.test assertions still check explanatory copy, Browse stores, server flags and absence of intake actions.

Exclude applications, invitations, claims, activation, provider mutation and deployment. Preserve prior owner's worktree. [Takeover receipt](https://github.com/samarquis/AntiqueTrail/issues/471#issuecomment-5959477016). App.tsx seam remains held; #473 stays queued until root review/merge. Root overseer must review the exact final head before any merge.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Bind canonical source/artifact before interpreting routes | Prior read-only canonical alias/metadata readback and [#465 publication receipt](https://github.com/samarquis/AntiqueTrail/pull/465#issuecomment-5952156359) bind `antique-trail.vercel.app` to deployment `dpl_6zUinfmc3LhkpvH7ELAvSHxRyMnT`, URL `antique-trail-1xnz1ydq2-scott-marquis-projects.vercel.app`, source `c9bb80250d5087ace3638059da09cd628bc1fad6`, artifact SHA-256 `D8F3C8980BB8E08CE5D3A88722B4E3082F8528845B037CEB26AC5605E0183940` | Recorded before original route edits; historical receipt, not a new takeover-time production inspection |
| Recheck both routes against identified deployment | Prior direct anonymous browser checks found Page not found on both paths; [classification receipt](https://github.com/samarquis/AntiqueTrail/issues/471#issuecomment-5955924300) | Intentional withheld acquisition, not a stale-artifact discrepancy |
| Explain catalog-only stage without acquisition | Direct App.test assertions exercise both routes, explanatory copy, `/stores` return link and absence of forms/intake actions | Pass |
| Preserve server gate | Tests isolate `routeVisible=false` and `claimsAvailable=false` while other flags are true; rejected lookup remains fail-closed; available owner flow remains covered | Pass |
| Respect approved scope | Adjacent test diff consists solely of the stale heading assertion; no runtime code changed during takeover | Pass after explicit scope amendment |
| Separate local from hosted/canonical evidence | Candidate not deployed; no provider/hosted-data mutation | Pass; historical production observation does not prove candidate production behavior |

## Verification

| Layer | Command / source | Result and binding |
| --- | --- | --- |
| Scope conflict reproduction | `npx vitest run src/app/App.test.tsx src/features/partners/ownerAcquisitionPage.test.tsx --pool=threads --maxWorkers=1` | Strict scope candidate `3b6a09990686af4177381f8b95fb03421787b5ea`: App tests pass; adjacent legacy 404 assertion fails, total 41/42. This justified requesting the scope amendment. |
| Focused tests after amendment | Same focused command | 42/42 pass on source/test tree of `f23185dde891b8727770a1d8c77577e9f3b11781`; amendment commit has the identical tracked tree to the tested pre-amend commit `1c6b5ae8aa14713517704cac029be2fdbb7ce866`. |
| Build/typecheck | `npm run build` | Pass: tsc, Vite 239 modules, PWA 18 precache entries. Runtime source identical to takeover starting head; only adjacent heading assertion changed afterward. |
| Lint | ESLint on all three relevant source/test files | Pass after scope amendment. |
| Formatting | Prettier check on all three relevant source/test files | Rerun after normalizing adjacent test line endings. |
| Toolchain | Locked `npm ci --no-audit --no-fund` in isolated worktree | 604 packages installed; Node v24.11.1, npm 11.13.0. |
| Historical hosted CI | Actions run `37046721369`, takeover head `1fd901f5e0b471bb372e2c75b675138b4c03da84` | web, database, configured-owner-billing SUCCESS; Supabase Preview SKIPPED. Does not replace final-head checks. |
| Final hosted CI | Exact published PR head | Pending publication/checks; final outcome goes in PR handoff. |
| Database/RLS/RPC | No local database changes/run | Database/provider behavior unchanged; final required CI remains separate. |
| Rendered UI/accessibility | Historical stock local review harness could not manually render withheld state | Manual desktop/mobile proof unavailable; direct DOM route tests prove heading, explanatory copy and return link. |
| Canonical production | Historical source-bound observations above | Candidate unverified in production; deployment excluded. |

## Security and negative proof

No authentication, authorization, availability authority, secret handling or data flows changed. False/rejected availability never exposes applications or claims; other guarded routes retain NotFound. The preserved adjacent assertion forbids the acquisition button even when query parameters request activation/reviewer status.

## Independent review and completion gates

Prior Spec review at takeover head required scope correction; prior Standards/review receipts are historical. Fresh independent Standards and Spec reviews must bind the final exact PR head and amended live issue. Record verdicts in PR handoff. Source stays frozen during review and CI.

Root exact-head review, merge and verified live issue closure remain pending. At closure, record the project-reflection ticket event. No closure or deployment is claimed by this evidence record.

## Invalidation

Source/test proof applies to the identified tree and environment. Any affected source/configuration/fixture or integration change requires refreshed checks/review. Evidence-only descendants require reviewing their documentation delta without relabeling prior runtime evidence as a new run.
