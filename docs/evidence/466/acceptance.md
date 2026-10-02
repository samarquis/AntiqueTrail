# Evidence — issue #466

## Candidate

- Issue/spec: [#466 Clarify public account-stage messaging](https://github.com/samarquis/AntiqueTrail/issues/466)
- Owner/chat: Ticket #466 Codex worktree
- Risk: high (authentication UI boundary; no authentication or authorization logic changed)
- Baseline SHA: `c9bb80250d5087ace3638059da09cd628bc1fad6`
- Candidate SHA: `3fd9bb58376c8ed08cb273db1b59bb858a8ca3fb` (source and direct UI test candidate; evidence record is a separate commit)
- Diff fingerprint: `0df006a52a7385c6dff2878930c8e009b34ae5cd` (Git blob hash of the six-file source/test patch)
- Worktree/branch: isolated issue #466 worktree / `codex/issue-466-account-stage-messaging`
- Evidence captured at: `2026-10-02T16:33:35Z`

## Scope

Changed outcome: Public-test registration and account-required save entry states clearly explain the stage pause and reassure admitted users that sign-in still works. Genuine authentication and save errors retain their existing messages.

Excluded scope: Auth/provider configuration, server authorization, account admission, hosted account tests, publication, and deployment.

Overlapping branches/worktrees checked: Issue #466 had one owner; no competing implementation branch or pull request was found.

Pre-existing failures or unrelated work: Initial PR CI found stale stage-copy expectations in `App.test.tsx` and `publicTestDisplay.test.tsx`; both were refreshed, and the four affected suites pass locally. Lint reports 16 warnings and 0 errors; warnings are outside this change's acceptance behavior.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Registration and account-required action entry states clearly say the action is paused for this stage | Both messages name the public-test pause and say existing accounts can sign in | Focused Vitest; anonymous local browser routes | Pass: 52/52 focused tests; `/auth/register`, store listing, and store details show the stage message |
| Genuine sign-in, session, and authorization errors remain distinguishable from the stage message | Genuine sign-in and private-save error assertions do not contain the pause copy; session and authorization code paths are unchanged | Focused Vitest; exact diff review | Pass: genuine sign-in and private-save errors retain distinct messages; no session or authorization logic changed |
| Existing admitted-user sign-in, return paths, and permissions remain unchanged; no new registration path is enabled | No auth/session/permission source change; registration form/provider call remain absent; recovery link and return path remain available | Exact diff review; focused Vitest; keyboard browser flow | Pass for the UI and route contract: no registration form/provider call; recovery link routes to `/auth/sign-in?returnTo=%2Faccount`; sign-in form renders. Hosted admitted-user permissions were not exercised. |
| Focused UI tests cover the stage message and a genuine error state | Both affected UI suites pass with stage and genuine-error assertions | `npx vitest run src/features/auth/components.test.tsx src/features/shopper/components.test.tsx` | Pass: 2 files, 52 tests |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Focused tests | `npx vitest run src/app/App.test.tsx src/features/auth/publicTestDisplay.test.tsx src/features/auth/components.test.tsx src/features/shopper/components.test.tsx` | Pass: 4 files, 110 tests; the first PR CI run exposed stale copy assertions, now updated | `3fd9bb58376c8ed08cb273db1b59bb858a8ca3fb`, local worktree |
| Type/lint/format/build | `npm run typecheck`; `npm run lint`; `npx prettier --write` on changed test files; `npm run check` | Typecheck passes; lint exits 0 with 16 warnings and 0 errors; changed tests formatted. Full `npm run check` was interrupted during the repository-wide Prettier scan; full-suite tests and build remain for GitHub CI. | `3fd9bb58376c8ed08cb273db1b59bb858a8ca3fb`, local worktree |
| Database/RLS/RPC | Not applicable; no database, RLS, RPC, or provider changes | Not run | Excluded by issue #466 |
| Desktop/mobile UI | Local Vite preview, `/auth/register`, `/stores`, `/stores/blue-finch-curios`; 390×844 viewport | Stage copy rendered; no registration form or Save link in paused states; no horizontal overflow; browser console error list empty. UI implementation is unchanged from the browser-verified source candidate. | `3fd9bb58376c8ed08cb273db1b59bb858a8ca3fb`, local preview with `VITE_PUBLIC_TEST_CATALOG_ONLY=true` |
| Accessibility/error states | Keyboard Tab/Enter through recovery link; inspect named status message and focused controls | Recovery action reachable and routes to sign-in; shopper pause is `role="status"`; genuine error cases remain distinct | `3fd9bb58376c8ed08cb273db1b59bb858a8ca3fb`, local browser and Vitest |
| Hosted/provider lifecycle | Not run | Out of scope; no hosted account tests or provider mutation authorized | No hosted/provider claim |
| Canonical production route | Not run | Deployment is separate and not authorized by issue #466 | No production claim |

## Security and negative proof

- Denied identities/scopes: No identity or scope changes; anonymous public-test routes expose no registration form or paused Save link.
- Failure and timeout behavior: Genuine sign-in and private-save error tests remain separate from stage messaging. No provider calls occur from the paused registration entry state.
- Secret/PII handling: No secrets, account data, or hosted data were read or changed.
- Security review: Auth/provider and server authorization logic are unchanged; independent exact-head review is tracked on the PR.

## Independent review

- Reviewer: See independent exact-head PR reviews.
- Standards verdict: Recorded on the PR.
- Spec verdict: Recorded on the PR.
- Final verdict: `WOWED` / `REWORK` / `BLOCKED` decision recorded before merge on the PR.
- Findings and disposition: See PR review records and any addressed commits.

## Unverified

GitHub required CI and independent PR reviews run against the final PR head. The full repository test suite and production build were not completed locally; `npm run check` was interrupted during repository-wide formatting. Hosted/provider behavior and canonical production routes were intentionally not exercised because they are outside the ticket and publication/deployment authority.

## Invalidation

Local evidence applies to source/test candidate `3fd9bb58376c8ed08cb273db1b59bb858a8ca3fb` and the local preview environment described above. Re-run affected checks and exact-head review after any code change; GitHub CI and PR review must match the final PR head.
