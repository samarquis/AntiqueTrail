# Issue #168 acceptance evidence

## Reopened closure audit — 2026-09-05

The evidence below dated 2026-09-03 is historical. Current acceptance follows the
merged PR #208 governance amendment: repository implementation closes #168;
protected deployment, participant/manual browser evidence, and executed external
teardown remain in #169. No external activation is authorized by this record.

- Current base: `ca863eae06e3749e839940f0df847b7ccb89a314`.
- Reviewed source: `a8d5b8c2c984541ac5e087c9a85ddb5684fd20a0`.
- Independent reviewer `/root/review168`: Standards PASS, Spec PASS, no unresolved
  source findings. The review repaired session registration, teardown API schema,
  save-before-submit, pre-admission rendering, nullable SQL validation, and touch targets.
- Focused unit tests: 4 files, 10 tests PASS in a clean detached checkout with one
  worker (`--pool=threads`); covers token registration/refresh/retry and bounded UI/client behavior.
- Local pgTAP: 52/52 PASS with both issue migrations applied inside a rollback-only
  transaction against local Supabase. This is focused synthetic database evidence;
  required hosted CI separately performs a clean full reset and full-suite pgTAP.
- Teardown/artifact contract tests: 4/4 PASS, including executing the command with
  synthetic transport responses, correct schema, invalid-receipt denial before deletion,
  and idempotent provider 404 handling.
- Browser acceptance: nine login/denial/claim/add/resume/touch-target cases PASS
  across desktop/tablet/mobile at `e08d342`; the three 200% text/spacing/forced-color
  cases exposed overflow and PASS after the two-line CSS repair at `a8d5b8c`.
  This proves text resizing/reflow, not literal browser-chrome zoom or a human screen reader.
- Normal and isolated research Vite builds plus the canonical artifact verifier PASS.
  Final synthetic content digest:
  `sha256:fbef5f68a2b4fb30342c4315cbe704ae4cd39a161b458d957449e7826d11916f`.
  The normal build has no research configuration; the research build uses the four
  disclosed synthetic `VITE_*` inputs in the historical record below.
- Plan-governance contract tests: 10/10 PASS; diff whitespace check PASS.
- Hosted clean reset/full pgTAP: 80 files, 2261 assertions PASS on the unchanged
  database candidate in [CI run 33939543916](https://github.com/samarquis/AntiqueTrail/actions/runs/33939543916).
  Required checks must also pass on the final evidence head before merge.

| Current acceptance criterion | Required evidence |
| --- | --- |
| Distinct artifact/manifest; normal build excludes research | Separate normal and research builds, canonical digest verifier, byte/header mutation tests |
| Exact active admission and run namespace; generic denials | 52 pgTAP assertions; session registration/refresh unit test; unauthenticated browser denial |
| Shared Free-only claim/add start/save/resume/submit/status and accessibility | Shared intake/content unit tests; browser login, both paths, reload/resume, direct submit, 320px/200% text resize/spacing/forced colors/keyboard and 48px targets |
| No real authority, store, public, evidence, or provider effects | pgTAP privilege, audience, store/claim/grant snapshots; bounded Synthetic payload validation; production exclusion |
| Shared-domain reuse, copy exclusions, isolation, deterministic teardown | Shared transaction parity and purge/replay pgTAP; content mutation tests; executable teardown transport regression |

The final PR receipt records build/browser results and the required hosted checks
at the accepted head before merge. These results are not external activation evidence.

## Historical initial implementation evidence

Date: 2026-09-03

- Base SHA: `56584b6229445424240c07adab1b817867e59868`.
- Initial candidate `b88f285500d89cccc2c4daf0fd2becc07c8f2606` received CHANGES REQUIRED; the reviewed replacement candidate is `2738e7523b70234dc2c41b9d0c2daf606c707cfd`.
- Reproducible local candidate artifact digest: `sha256:e359ad7e292d36d7909d061abbbd8aae0d78b5d1179a8a5d24e3bb4f22bb47d5`. The exact inputs were `VITE_SUPABASE_URL=https://uaupykgpegbseboklubv.supabase.co`, `VITE_SUPABASE_ANON_KEY=synthetic-local-anon-key`, `VITE_OWNER_RESEARCH_COHORT_KEY=topeka-owner-10a`, and `VITE_CANONICAL_SITE_URL=https://antique-trail-pages.pages.dev`. This deliberately non-deployable synthetic key makes the local evidence build reproducible; an authorized deployment must be rebuilt with its publishable key, register that resulting manifest digest, and bind cohort grants to that verified deployment record.
- The digest is computed from the sorted SHA-256 map of exact generated files, recorded in the manifest, recomputed by the verifier, fetched by the runtime, and foreign-keyed by cohort grants. No operator-supplied digest participates.
- Route matrix: the isolated artifact maps `/for-stores` through `vercel.owner-research.json`; the review server exercises the same entry at `/owner-research.html`; the normal application has no research route or import.

## Criterion evidence

| Criterion | Code and test evidence | Result / limitation |
| --- | --- | --- |
| Distinct protected artifact | `finalize-owner-research-artifact.mjs` hashes exact post-build bytes; `verify-owner-research-artifacts.mjs` recomputes the canonical manifest digest and enforces disabled Git deployment, the isolated rewrite, CSP, COOP, CORP, Vary, noindex, and no-store contracts. | Local build, verifier, and byte/header mutation tests pass. A real Vercel Deployment Protection receipt is unavailable until the external H-01/S-01/HC-01 dependencies are satisfied. |
| Exact cohort admission and generic denial | The artifact establishes only a memory-held Supabase session. The research wrapper requires `current_session_is_active()` and one active, unexpired grant whose digest references an active verified artifact record. | pgTAP covers anonymous, revoked session, ungranted/wrong account, unverified/wrong digest, wrong cohort, expired/revoked grant, and post-teardown replay. Hosted database proof remains pending. |
| Synthetic run isolation | The research wrapper derives the run from the exact grant, supplies only the Synthetic adapter payload, and keys shared state by run, applicant, and audience. Browser roles have no private-table or shared-function access. | pgTAP proves separate participant runs, `audience=synthetic`, and cross-account denial. |
| Shared future intake seam | Both wrappers call the audience-neutral `research_private.owner_intake_apply`. The public adapter validates real claim/add drafts, requires the Package 10B claims capability, and dispatches to existing `submit_listing_claim` or `partner_safe_command` effects; the research adapter validates fixed fixtures and performs no effects. | pgTAP proves start/save/submit/status transition parity across Synthetic and public audiences and separately proves research-effect absence. Final public route wiring remains #172's scope. |
| Complete bounded flow | `OwnerResearchPage` supports start, save, resume, submit, and status for fixed `existing-store-a` and `new-store-a` fixtures. | Playwright passes both journeys on desktop, tablet, and mobile projects, including 320 CSS pixels, keyboard focus, forced colors, and live status. Literal browser-chrome 200% zoom still requires manual real-browser evidence. |
| Exact Free-only content | `OwnerAcquisitionContent` renders nine separately marked controlling sections in order and has one primary `Add or claim my store` decision. Its trust links resolve against the approved canonical HTTPS origin. | Mutation tests independently reject paid/price, waitlist/lead, fabricated proof, ranking, ROI, urgency, and verification/review-SLA claims; unit and browser tests verify all five absolute trust destinations. |
| No real effects | The private transaction writes only private research tables. It has no canonical-store, claim, grant, auth-role, public-projection, email, payment, or provider call. | pgTAP snapshots stores, listing claims, and representative grants and proves no changes. Hosted/provider proof remains unavailable by design. |
| Production exclusion | Normal mode has no research input and a build-time forbidden-marker scan; research mode has its own single HTML input and disables the public asset directory. | Normal build and artifact verifier pass locally. |
| Teardown | The command first invokes the service-only, exact-digest teardown transaction. That transaction validates the registered research receipt, revokes and purges, stores a deterministic receipt, and returns the same receipt on retry. Only after verifying it does the command delete the matching Vercel deployment; HTTP 404 is the idempotent retry result. | pgTAP and release tests prove ordering, receipt verification, retry stability, purge, and minimized retention. A live deployment teardown receipt remains pending an authorized external deployment. |

## Commands and results

| Command | Result |
| --- | --- |
| `npx vitest run src/features/readiness/ownerResearch.test.tsx src/features/partners/ownerIntake.test.ts src/features/partners/ownerAcquisitionContent.test.tsx` | Passed after review repairs: 3 files / 9 tests. |
| `node --test scripts/verify-owner-research-artifacts.test.mjs` | Passed: 3 mutation/order tests. |
| `npx vitest run src/features/readiness src/features/partners src/app/App.test.tsx --reporter=dot` | 77 passed; two unrelated partner component files timed out under parallel load. Their immediate isolated rerun passed 2 files / 17 tests. |
| `npx playwright test --config playwright.review.config.ts e2e/issue-168-owner-research.spec.ts` | Passed: 12/12 across desktop, tablet, and mobile. |
| `npx supabase@2.115.0 db reset --local` | Passed on a clean database with migration `20260903030000`. |
| `npx supabase@2.115.0 test db supabase/tests/0080_issue_168_owner_research.sql` | Passed after a clean reset: 1 file / 48 assertions. |
| `npx supabase@2.115.0 test db` | Not passed: the local unprivileged full-suite runner reports 18 pre-existing role/ACL failures. Hosted database CI remains required. |
| `npm run check` | Passed after review repairs: typecheck, lint (four existing non-blocking Fast Refresh warnings), format, 92 files / 641 unit tests, 72 release tests, and the normal production build. |
| Set the four disclosed `VITE_*` inputs above, then run `npm run build:owner-research` and `npm run verify:owner-research-artifacts` | Passed; candidate artifact digest `sha256:e359ad7e292d36d7909d061abbbd8aae0d78b5d1179a8a5d24e3bb4f22bb47d5` was independently recomputed. |
| `npm run security:contract` | Passed after review repairs. |
| `git diff --cached --check` | Passed on the staged replacement candidate. |

## Closure blockers

Independent exact-head review, hosted `web`, `database`, and `plan-governance`, an authorized protected deployment and teardown receipt, literal 200% browser evidence, merge, and post-merge checks remain open. Synthetic proof here is repository acceptance evidence only and is not production authorization.
