# Evidence — issue #466

## Candidate

- Issue/spec: [#466 Clarify public account-stage messaging](https://github.com/samarquis/AntiqueTrail/issues/466)
- Owner/chat: Ticket #466 Codex worktree
- Risk: high (authentication UI boundary; no authentication or authorization logic changed)
- Baseline SHA: `2a97fa2234dd00ded5e3607cdc7cb91821d4630c` (live `main` at rebase)
- Candidate SHA: `eb29fe5ced8a1d3ec9587bbc18f2e657df349fe3` (source and direct UI test candidate; evidence record is a separate commit)
- Diff fingerprint: `608b76b39636e39d23bc58c34e4ee9fb3ebabc31` (Git blob hash of the six-file source/test patch)
- Worktree/branch: isolated issue #466 worktree / `codex/issue-466-account-stage-messaging`
- Evidence captured at: `2026-10-02` (re-run against rebased candidate)

## Scope

Changed outcome: Public-test registration and account-required save entry states clearly explain the stage pause and reassure admitted users that sign-in still works. Genuine authentication and save errors retain their existing messages.

Excluded scope: Auth/provider configuration, server authorization, account admission, hosted account tests, publication, and deployment.

Overlapping branches/worktrees checked: Issue #466 had one owner; no competing implementation branch or pull request was found.

Pre-existing failures or unrelated work: Initial PR CI found stale stage-copy expectations in `App.test.tsx` and `publicTestDisplay.test.tsx`; both were refreshed, and the four affected suites pass locally. Lint reports 16 warnings and 0 errors; warnings are outside this change's acceptance behavior.

## Acceptance

| Criterion                                                                                                            | Observable pass condition                                                                                                                                                                       | Verification method                                                                                                                                                                           | Result/evidence                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration and account-required action entry states clearly say the action is paused for this stage                | Both messages name the public-test pause and reassure users that existing accounts can sign in                                                                                                  | Focused Vitest; anonymous local browser routes                                                                                                                                                | Pass: four affected suites pass; `/auth/register`, store listing, and store details show the stage message                                                                                                      |
| Genuine sign-in, session, authorization, and registration-block errors remain distinguishable from the stage message | Genuine sign-in/private-save errors keep their messages; provider `register()` returning `blocked` shows neutral “Registration unavailable” copy, while catalog-only mode shows the stage pause | Focused Vitest; exact diff review                                                                                                                                                             | Pass: blocked-registration test and stage-state tests assert distinct copy; no session or authorization logic changed                                                                                           |
| Existing admitted-user sign-in, return paths, and permissions remain unchanged; no new registration path is enabled  | No auth/session/permission source change; registration form/provider call remain absent; recovery link and return path remain available                                                         | Exact diff review; focused Vitest; keyboard browser flow                                                                                                                                      | Pass for the UI and route contract: no registration form/provider call; recovery link routes to `/auth/sign-in?returnTo=%2Faccount`; sign-in form renders. Hosted admitted-user permissions were not exercised. |
| Focused UI tests cover the stage message and distinct blocked/error states                                           | All affected UI suites pass with stage, blocked-registration, and genuine-error assertions                                                                                                      | `npx vitest run src/app/App.test.tsx src/features/auth/publicTestDisplay.test.tsx src/features/auth/components.test.tsx src/features/shopper/components.test.tsx --pool=forks --maxWorkers=1` | Pass: 4 files, 110 tests                                                                                                                                                                                        |

## Verification

| Layer                      | Command or flow                                                                                                                                                                               | Result                                                                                                                                                                                                                                                               | Applies to SHA/environment                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Focused tests              | `npx vitest run src/app/App.test.tsx src/features/auth/publicTestDisplay.test.tsx src/features/auth/components.test.tsx src/features/shopper/components.test.tsx --pool=forks --maxWorkers=1` | Pass: 4 files, 110 tests, including blocked-registration distinction; earlier PR CI exposed stale copy assertions, now updated                                                                                                                                       | `eb29fe5ced8a1d3ec9587bbc18f2e657df349fe3`, local worktree                                          |
| Type/lint/format/build     | `npm run typecheck`; `npm run lint`; targeted `prettier --check`; `npm run check`                                                                                                             | Typecheck passes; lint exits 0 with 16 warnings and 0 errors; targeted format check passes. Full `npm run check` was interrupted during the repository-wide Prettier scan; final exact-head CI covers the full gates.                                                | `eb29fe5ced8a1d3ec9587bbc18f2e657df349fe3`, local worktree                                          |
| Database/RLS/RPC           | Not applicable; no database, RLS, RPC, or provider changes                                                                                                                                    | Not run                                                                                                                                                                                                                                                              | Excluded by issue #466                                                                              |
| Desktop/mobile UI          | Local Vite preview, `/auth/register`, `/stores`, `/stores/blue-finch-curios`; 390×844 viewport                                                                                                | Stage copy rendered; no registration form or Save link in paused states; no horizontal overflow; browser console error list empty. These public-test branches are unchanged by the later provider-blocked-state fix, which is covered by the focused test run above. | `3fd9bb58376c8ed08cb273db1b59bb858a8ca3fb`, local preview with `VITE_PUBLIC_TEST_CATALOG_ONLY=true` |
| Accessibility/error states | Keyboard Tab/Enter through recovery link; inspect named status message and focused controls                                                                                                   | Recovery action reachable and routes to sign-in; shopper pause is `role="status"`; provider-blocked registration and genuine errors have distinct copy                                                                                                               | `eb29fe5ced8a1d3ec9587bbc18f2e657df349fe3`, local browser and Vitest                                |
| Hosted/provider lifecycle  | Not run                                                                                                                                                                                       | Out of scope; no hosted account tests or provider mutation authorized                                                                                                                                                                                                | No hosted/provider claim                                                                            |
| Canonical production route | Not run                                                                                                                                                                                       | Deployment is separate and not authorized by issue #466                                                                                                                                                                                                              | No production claim                                                                                 |

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

GitHub required CI and independent PR reviews must match the final PR head; receipts are tracked on the PR. The full repository test suite and production build were not completed locally; `npm run check` was interrupted during repository-wide formatting. Hosted/provider behavior and canonical production routes were intentionally not exercised because they are outside the ticket and publication/deployment authority.

## Invalidation

Local focused checks apply to source/test candidate `eb29fe5ced8a1d3ec9587bbc18f2e657df349fe3`; the public-test browser evidence applies to the unchanged catalog-only UI branches from the earlier candidate noted above. Re-run affected checks and exact-head review after any code change; GitHub CI and PR review must match the final PR head.
