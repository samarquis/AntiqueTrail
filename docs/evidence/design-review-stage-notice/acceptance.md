# Evidence — issue 500

## Candidate

- Issue/spec: https://github.com/samarquis/AntiqueTrail/issues/500
- Owner/chat: `codex/issue-500-stage-notice`
- Risk: standard UI; display-only
- Verification base: `68751a42c9a05d1ffd7c129d8f1f409dccd1775a` (`origin/main` at start). The issue's older pin `81703453ee5e445ee3bdb1c38ef2cf8f81a362ee` is an ancestor; intervening #496 changes did not touch owned seams.
- Candidate source SHA: `28ffb54cb45221e9071a66813a8508f5e65e9d6d`
- Diff fingerprint: `d7010d948f34c8de31a56c80b1cafdd7d28e9a19`; reproducible with `git diff --binary --full-index 68751a42c9a05d1ffd7c129d8f1f409dccd1775a...28ffb54cb45221e9071a66813a8508f5e65e9d6d | git hash-object --stdin`
- Worktree/branch: isolated ticket worktree, `codex/issue-500-stage-notice`
- Evidence captured: 2026-10-03

## Scope

Changed outcome: catalog-only Browse owns one stage notice before state-dependent results. Card action groups retain `View store`; Browse cards no longer repeat the paused notice. Store Details retains its paused notice and draft-only correction guidance.

Excluded scope: account admission, auth/provider configuration, backend writes, hosted data, deployment, and production routes.

Overlapping branches/worktrees checked: #466 is closed and merged; PR #496 is included in the planning base and did not change these seams. The #506 integration owner controls composition and merge. The concurrent filter writer owns `CatalogFiltersForm`/`updateFilters`, outside this change.

Pre-existing failures or unrelated work: the default parallel full Vitest run timed out in three untouched test files. Exact cases, timings, and the serial diagnostic rerun are recorded below. No source changes were made in those areas.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Existing repetition | Before source edits, 12-store public-test Browse renders 12 paused-saving notices. | App integration render on the baseline candidate. | Confirmed: expected one, received 12. |
| Single Browse notice | Exactly one visible `role="status"` notice outside every Store actions group; all 12 `View store` links remain. | Focused App and catalog tests. | Pass; 93 focused tests passed. |
| State coverage | Notice remains before loading, request-error, and empty states. | New catalog unit tests. | Pass. |
| Details boundary | Details keeps the paused notice, `Draft a correction`, and submission-unavailable text; no Save/create-account/submit action appears. | New shopper unit test. | Pass. |
| Ordinary mode | Flag-off Browse has no stage notice and keeps anonymous JIT Save. | New shopper test plus existing shopper suite. | Pass. |
| No mutation | Public-test Browse calls neither stubbed `getSaveState` nor `setSave`. | New shopper unit test. | Pass; zero calls. |
| Rendered browser flow | True mode checks Browse notice and Details boundary; false mode checks Browse notice absence and 12 JIT Save links. | New Playwright spec on leased port 4173. | Not run; browser lease ungranted. |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| ------ | --------------- | ------ | -------------------------- |
| Baseline reproduction | `npx vitest run src/app/App.test.tsx -t "keeps public-test shopper navigation and shows one saving notice on Browse" --reporter=verbose` | Expected failure: 12 identical notices for 12 cards. | Base `68751a42`; jsdom integration render. |
| Focused tests | `npx vitest run src/features/shopper/designReviewNotice.test.tsx src/features/catalog/designReviewNotice.test.tsx src/features/auth/publicTestDisplay.test.tsx src/features/shopper/components.test.tsx src/app/App.test.tsx` | Pass: 5 files, 93 tests. | Candidate source tree; jsdom. |
| Typecheck | `npm run typecheck` (also passed in `npm run check`) | Pass. | Candidate source tree; Node `v24.11.1`. |
| Lint | `npm run lint` (also passed in `npm run check`) | Pass: 0 errors, 16 warnings in untouched files. | Candidate source tree. |
| Format | `npm run format` (also passed in `npm run check`) | Pass. | Candidate source tree. |
| Full unit suite | `npm run check` | Partial: 1,116 passed, 1 skipped, 7 tests timed out at 5 seconds; 167 files, 3 failed, 163 passed, 1 skipped; 295.44 seconds. Overall command exited 1 before later chained steps. | Candidate source tree; default Vitest worker settings. |
| Timeout diagnostic | `npx vitest run src/features/auth/PasswordReplacementPage.test.tsx src/features/candidates/components.test.tsx src/features/partners/partnerAdminComponents.test.tsx --testNamePattern="shows exact mismatch text|sends a private share only after the candidate is saved|issues a synthetic invitation without claiming email delivery|loads one exact claim and submits a version-bound decision|verifies a submitted signal without rendering or sending raw evidence|requires confirmation before rejecting an authority signal|lets Site Admin revoke exact-store team access after explicit confirmation" --maxWorkers=1 --no-file-parallelism --reporter=dot` | Pass: the same 7 tests passed with default 5-second timeouts; 12 unrelated tests skipped by the name filter. Cause of default-run timeouts is not proven; no baseline comparison was run. | Same candidate source tree; serial local worker. |
| Timeout cases | `PasswordReplacementPage.test.tsx`: “shows exact mismatch text and pending state, then signs out on completion” 5,351 ms; `candidates/components.test.tsx`: “sends a private share only after the candidate is saved” 5,115 ms; `partners/partnerAdminComponents.test.tsx`: “issues a synthetic invitation without claiming email delivery” 5,175 ms; “loads one exact claim and submits a version-bound decision” 5,220 ms; “verifies a submitted signal without rendering or sending raw evidence” 5,086 ms; “requires confirmation before rejecting an authority signal” 5,111 ms; “lets Site Admin revoke exact-store team access after explicit confirmation” 5,036 ms. | All seven serial diagnostics passed. | Same candidate source tree. |
| Release tests | `npm run test:release` | Pass: 165 tests. | Candidate source tree; local Node test runner. |
| Build | `npm run build` | Pass; Vite generated the production bundle and service worker. | Candidate source tree; default build mode. |
| Seed media | `node scripts/verify-seed-media.mjs --built-root dist` | Pass; 10 paths, 0 errors. | Candidate build output. |
| Impeccable detector | `impeccable.cmd detect --json src/app/App.tsx src/features/catalog/components.tsx src/features/shopper/components.tsx` | Pass; no findings. | Candidate source tree. |
| Browser true mode | `$env:VITE_PUBLIC_TEST_CATALOG_ONLY='true'; npx playwright test e2e/design-review-stage-notice.spec.ts --project=chromium --workers=1 --retries=0` | Pending lease. | Candidate SHA; 12 synthetic demo stores; `127.0.0.1:4173`; fresh PowerShell process. |
| Browser false mode | `$env:VITE_PUBLIC_TEST_CATALOG_ONLY='false'; npx playwright test e2e/design-review-stage-notice.spec.ts --project=chromium --workers=1 --retries=0` | Pending lease. | Candidate SHA; 12 synthetic demo stores; `127.0.0.1:4173`; separate fresh PowerShell process. |
| Browser cleanup receipt | Record true/false outcomes and verify port 4173 is no longer listening in this file's Browser section. `playwright.config.ts` sets `reuseExistingServer: false`; do not reuse a server. | Pending lease and run. | Candidate SHA; local browser lane. |
| Hosted/provider lifecycle | No provider or hosted data changes. | Not applicable. | No hosted access used. |
| Canonical production route | No deployment authorized or performed. | Not run. | Production remains unverified. |

Install used Node `v24.11.1` and npm `11.13.0` with an isolated worktree install and private npm cache. `package.json` declares `npm@11.13.1`; the registry returned `ETARGET` for that version. `npm ci` succeeded with the installed `11.13.0`; package manifests and lockfile were not changed. Install audit output reported five moderate vulnerabilities; no remediation was attempted.

## Security and negative proof

- Denied identities/scopes: catalog-only stage hides Save/create-account/submit actions on Browse and Details; no server authorization changed.
- Failure and timeout behavior: notice remains present for Browse loading, request-error, and empty states in unit tests. Real browser states remain unverified.
- Secret/PII handling: no secrets, private shopper data, provider settings, or hosted records touched.
- Mutation proof: stubbed shopper reads/writes remained at zero calls in public-test Browse unit test.
- Security review: independent exact-SHA Standards/Spec reviews pending.

## Independent review

- Reviewer: pending
- Standards verdict: pending exact candidate SHA
- Spec verdict: pending exact candidate SHA
- Final verdict: `BLOCKED` until browser lease, independent reviews, and required PR checks complete.
- Findings and disposition: none received yet.

## Unverified

- Chromium rendered behavior for fresh true and false builds; the required 4173 lease was not granted.
- Browser cleanup receipt, independent exact-SHA reviews, and PR/CI checks.
- Canonical production behavior; deployment was outside authority.

## Invalidation

Evidence applies to the source/test candidate SHA recorded at commit. Any affected source, config, fixture, or test change invalidates relevant proof. The evidence document is a separate, documentation-only addition; review and required checks must use the final PR head.
