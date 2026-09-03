# Issue #168 acceptance evidence

Date: 2026-09-03

- Base SHA: `56584b6229445424240c07adab1b817867e59868`.
- Candidate SHA: pending the reviewable source commit; the coordinator must bind review and hosted evidence to the reported final head.
- Research binding used for local artifact verification: `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (a non-production test binding, not a deployment receipt).
- Final local artifact hashes: HTML `a7132d507b6fdbffbae0d26ec30c2a03e2e9e602bd4f80c951c942e36960616d`, manifest `055639a9b0d764ba07d2417dca72ea3f383818b0ab3d94854464577b27a14fea`, JavaScript `f87a69ffe81826445e1d60b4dbd01017e7f21c7afe8aca554bd584905bccfcf9`, CSS `830f96dae0f2aadc410b36ac9fa7162f9a6d610e6b1daeff7838f4f9fdef6209`.
- Route matrix: the isolated artifact maps `/for-stores` through `vercel.owner-research.json`; the review server exercises the same entry at `/owner-research.html`; the normal application has no research route or import.

## Criterion evidence

| Criterion | Code and test evidence | Result / limitation |
| --- | --- | --- |
| Distinct protected artifact | `owner-research.html`, the `owner-research` Vite mode, `owner-research-manifest.json`, `vercel.owner-research.json`, and `verify-owner-research-artifacts.mjs`. | Local build and isolation verifier pass. A real Vercel Deployment Protection receipt is unavailable until the external H-01/S-01/HC-01 dependencies are satisfied. |
| Exact cohort admission and generic denial | The artifact can establish a memory-only Supabase session without persisting credentials. `app_public.owner_research_command` derives that caller from the JWT and requires one active, unexpired grant matching user, cohort, and artifact digest. pgTAP covers anonymous, ungranted/wrong-account, wrong digest, wrong cohort, expired, revoked, and post-teardown replay. | Server contract implemented; hosted database proof remains pending. |
| Synthetic run isolation | The public wrapper selects the run from the exact grant; the private transaction requires `audience=synthetic` and keys state by `run_id` plus applicant. Browser roles have no private-schema/table access. | pgTAP proves two callers receive separate runs and all created intake rows are Synthetic. |
| Shared future intake seam | Both `app_public.owner_research_command` and the stage-disabled `app_public.owner_intake_command` call `research_private.owner_intake_apply`; `createOwnerIntakeClient` is the typed UI boundary. | Unit and pgTAP contracts pass; public Package 10B wiring is a non-goal owned by #172. |
| Complete bounded flow | `OwnerResearchPage` supports start, save, resume, submit, and status for fixed `existing-store-a` and `new-store-a` fixtures. | Playwright passes both journeys on desktop, tablet, and mobile projects, including 320 CSS pixels, keyboard focus, forced colors, and live status. Literal browser-chrome 200% zoom still requires manual real-browser evidence. |
| Exact Free-only content | `OwnerAcquisitionContent` renders the nine controlling sections in order and has one primary `Add or claim my store` decision. | Copy-contract tests reject paid, waitlist/lead, fabricated proof, ranking, ROI, urgency, and speed/SLA claims. |
| No real effects | The private transaction writes only private research tables. It has no canonical-store, claim, grant, auth-role, public-projection, email, payment, or provider call. | pgTAP snapshots stores, listing claims, and representative grants and proves no changes. Hosted/provider proof remains unavailable by design. |
| Production exclusion | Normal mode has no research input and a build-time forbidden-marker scan; research mode has its own single HTML input and disables the public asset directory. | Normal build and artifact verifier pass locally. |
| Teardown | `owner-research-teardown.mjs` deletes the exact Vercel deployment, then calls the service-only teardown RPC using digest and receipt window. The RPC revokes/deletes grants and run state and retains only outcome/consent timestamps. | pgTAP proves purge and minimized retention. A live deployment teardown receipt is pending an authorized external research deployment. |

## Commands and results

| Command | Result |
| --- | --- |
| `npx vitest run src/features/readiness/ownerResearch.test.tsx src/features/partners/ownerIntake.test.ts src/features/partners/ownerAcquisitionContent.test.tsx --reporter=verbose` | Passed after final authentication seam: 3 files / 8 tests. |
| `npx vitest run src/features/readiness src/features/partners src/app/App.test.tsx --reporter=dot` | 77 passed; two unrelated partner component files timed out under parallel load. Their immediate isolated rerun passed 2 files / 17 tests. |
| `npx playwright test --config playwright.review.config.ts e2e/issue-168-owner-research.spec.ts` | Passed: 12/12 across desktop, tablet, and mobile. |
| `npx supabase@2.115.0 db reset --local` | Passed on a clean database with migration `20260903030000`. |
| `npx supabase@2.115.0 test db supabase/tests/0080_issue_168_owner_research.sql` | Passed: 1 file / 34 assertions, including wrong-account, expired, revoked, and post-teardown replay denial. |
| `npx supabase@2.115.0 test db` | Not passed: the local unprivileged full-suite runner reports 18 pre-existing role/ACL failures. Hosted database CI remains required. |
| `npm run check` | Passed on the final source tree: 92 files / 640 unit tests, 69 release tests, typecheck, lint, format, and normal production/PWA build. An earlier concurrent run hit the existing Trips Navigator timeout and hung; it is superseded by this isolated pass. |
| `npm run build:owner-research` then `npm run verify:owner-research-artifacts` | Passed after final stylesheet minimization: isolated output contains four files and the verifier passed. |
| `git diff --check` | Passed before final evidence edits; rerun required on the staged candidate. |

## Closure blockers

Independent exact-head review, hosted `web`, `database`, and `plan-governance`, an authorized protected deployment and teardown receipt, literal 200% browser evidence, merge, and post-merge checks remain open. Synthetic proof here is repository acceptance evidence only and is not production authorization.
