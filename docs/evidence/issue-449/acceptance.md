# Issue 449 acceptance

## Candidate and scope

- Issue: https://github.com/samarquis/AntiqueTrail/issues/449
- Owner: this issue's isolated Codex chat, worktree `eb50/AntiqueTrail`.
- Branch: `codex/issue-449-photo-return`.
- Baseline: `8de1567a787f897569c8d9da9f2976d37dd568c4`, verified clean before edits. The issue's admission comment explicitly refreshes its older pin.
- Candidate: the commit containing this evidence; resolve with `git log -1 --format=%H -- docs/evidence/issue-449/acceptance.md`. Subsequent verification receipts belong in the PR and handoff at that exact SHA.
- Risk: standard, synthetic review harness and regression tests only.
- Owned seams: `e2e/persona-photo-return.spec.ts`, `src/review-harness/clients.ts`, and its direct unit tests.
- No runtime authentication, hosted provider, database, deployment, or production changes.
- Existing worktrees and open PRs checked before editing; no current #449 owner or overlapping open PR found. Local review browser lane uses loopback port 4173, one worker, no Docker/provider resources, and an owned Playwright server stopped by the runner.

## Acceptance answer key

| Criterion | Observable proof |
| --- | --- |
| Submitted-credential failure | Valid synthetic email and nonempty password reach the review adapter, whose dedicated `recoverable-failure@local.invalid` identity returns `error`. The generic recoverable sign-in alert appears; empty-form validation cannot pass this assertion. |
| Retained intent | The pending record identifies `save-store`, the Blue Finch store ID, and the exact return URL; the same record remains after failure. |
| Recover and cancel | Sign-in remains enabled, the error receives focus, cancellation returns to the exact intended store, and its heading receives focus. The anonymous Save action remains visible. |
| No cancelled write | Pending intent is absent, no saved-store success appears, and the content-free harness save-write event count stays zero. A unit positive control proves successful fixture mutations emit this event and denied mutations do not. |
| Explicit unavailable fixtures | The pre-existing zero-image and one-image fixtures remain named skips. They are not passing evidence. |
| Desktop and phone | The same recovery assertions run at 1280px and 320px, including horizontal-overflow checks, in the regular web CI suite. |

## Verification before candidate freeze

- Red unit proof: the submitted-failure test returned `authenticated` instead of `error` before the harness change.
- Red browser proof: both widths reached the store after authentication instead of displaying the sign-in error.
- Green focused harness suite: 23 passed.
- Green catalog-bootstrap plus desktop/320px recovery: 3 passed, zero retries.
- Commands: `npx vitest run src/review-harness/clients.test.ts`; `npx playwright test e2e/persona-photo-return.spec.ts --project=chromium --grep "actual browsing|submitted sign-in" --workers=1 --retries=0`.
- Local environment: Windows, Node v24.11.1, npm 11.13.0, lockfile installation completed. CI uses repository `.nvmrc` (20.19.0).

## Project Reflection preflight

- `L-20260927-01` (provisional) applied: execute catalog-bootstrap before broad CI; predicted benefit is catching shared catalog drift early. The focused bootstrap passed.
- `L-20260927-02` (supported) applied: await the actual Save control and error/focus target before checking state. No layout capture is introduced.
- `L-20260928-01` rejected as inapplicable: no retired validator or manual manifest replacement.
- The exact refreshed base, retained unavailable seams, and separate local/CI/provider evidence boundaries remain explicit.

## Remaining gates at creation

Exact-head web CI and independent Standards/Spec review must be recorded against the frozen candidate in the PR/handoff. Local results above are pre-commit checks, not hosted proof. Hosted authentication and canonical production proof are excluded by the issue. No merge or issue closure is claimed.

Evidence becomes stale after affected source, fixture, configuration, or integration changes.
