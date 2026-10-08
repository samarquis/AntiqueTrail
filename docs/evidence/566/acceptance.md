# Evidence — issue 566

## Candidate

- Issue/spec: [#566 — Reach My trips through visible shopper navigation](https://github.com/samarquis/AntiqueTrail/issues/566)
- Owner/chat: issue-566 worker
- Risk: standard; navigation visibility is conditional, and existing session, route, and service authorization remain authoritative
- Baseline SHA: `adb5a48565e5a362e928dde78b9c35247be33d4a`
- Candidate SHA: `8372108e4b9166299b3e76364d4715f0e78671ab`
- Implementation diff fingerprint at `8372108` (four source/test files): `fee95cd6b320b4a827b891807f3e94d3f0b19858`
- Worktree/branch: `C:\Users\samar\.codex\worktrees\b11e\AntiqueTrail` / `codex/issue-566-my-trips`
- Evidence captured at: 2026-10-08; this record is added after the tested implementation candidate

## Scope

Changed outcome: an admitted Shopper can reach the existing My trips list from More and open that Shopper's trip plan. UI07 source coverage exercises selected Shopper navigation, the plan link and date, Shopper B isolation, non-Shopper denial, and list failure messaging. App tests cover role and local-admission visibility. Existing route guards and downstream trip authorization are unchanged.

Excluded scope: configured-shopper runner/spec/report changes belong to #565; no route, trip API, database, production, or hosted behavior changed. The configured helper in `e2e/configured-my-trips-navigation.case.ts` is a handoff artifact for #565 and has no caller in this candidate; it is not configured-service proof.

Overlapping branches/worktrees checked: #565 owns the shared configured-local runner/spec/report. #566 owns the UI07 navigation cases and App visibility seam. Candidate is based on #565 commit `adb5a485`; PR #592 remains open and draft.

Pre-existing failures or unrelated work: the exact-candidate configured-shopper check fails as recorded below. Normal CI's web and database jobs pass. Supabase Preview is skipped.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Visible selected-Shopper route | More → My trips → selected trip plan; row/link/date and focused plan heading are visible | UI07 source assertions; normal CI browser suite at candidate SHA | Source coverage present. CI browser suite passed 701 tests and skipped 95. Suite was synthetic review-harness coverage, not configured-local service proof. |
| Role and account boundaries | Non-Shopper entry is absent; Shopper B cannot see Shopper A's trip; catalog-only mode hides My trips | App unit assertions and UI07 source assertions; exact-candidate CI | Covered by source tests; normal CI web job passed. No production or non-loopback runtime claim. |
| List failure | Failed list load produces the expected generic error state | UI07 source assertion; exact-candidate CI | Covered in source; normal CI browser suite passed. Configured-local run did not reach a proven successful navigation. |
| Theme, focus, and target size | More, list, and plan states cover light/dark; keyboard focus and touch targets meet assertions | UI07 source assertions for desktop and mobile projects; exact-candidate CI | Source coverage present. Screenshot calls exist, but images were not retained by CI. |
| Configured-local visible navigation | The configured local Shopper reaches their own list and plan; another Shopper remains isolated | #565 configured-shopper workflow `37728715903` at candidate SHA | **Fail / unproved.** Expected 20, unexpected 6, skipped 0, flaky 0. Sanitized path-only receipt reports `/stores/clockwork-cabinet` for desktop and phone in the visible Details Add to Trip case. This does not reveal whether the link was absent or the click failed actionability. No trace was inspected. |
| Screenshot retention | Retain only the six visible My trips flow screenshots per desktop/mobile project | Existing screenshot calls plus CI artifact inventory | **Not retained.** Prepared narrow #565 artifact contract: name `issue-566-my-trips-visuals`; allowlist `test-results/**/more-light.png`, `test-results/**/more-dark.png`, `test-results/**/trips-light.png`, `test-results/**/trips-dark.png`, `test-results/**/plan-light.png`, and `test-results/**/plan-dark.png` (12 files expected across two projects). Do not include full reports, traces, videos, or unrelated/private screens. Contract is not yet integrated by #565. |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| -------------------------- | --------------- | ------ | -------------------------- |
| Focused tests | `npx vitest run src/app/App.test.tsx` | Included in passing `npm run check`; Vitest total 169 files passed / 1 skipped, 1245 tests passed / 1 skipped | `8372108`, CI web job in run [37728716034](https://github.com/samarquis/AntiqueTrail/actions/runs/37728716034) |
| Type/lint/format/build | `npm run check` | Passed in CI web job | `8372108`, run `37728716034` |
| Database/RLS/RPC | CI database job | Passed; no database files changed | `8372108`, run `37728716034` |
| Desktop/mobile UI | Normal CI browser suite | Passed 701 / skipped 95; synthetic review harness | `8372108`, run `37728716034` |
| Accessibility/error states | UI07 focus, target-size, theme, and list-error assertions | Covered by source tests in passing normal CI; no assistive-technology or human review claimed | `8372108`, run `37728716034` |
| Configured local service | Issue 565 configured-shopper workflow | Failed at browser-tests; 20 expected, 6 unexpected, 0 skipped, 0 flaky | `8372108`, run [37728715903](https://github.com/samarquis/AntiqueTrail/actions/runs/37728715903) |
| Hosted/provider lifecycle | Supabase Preview check | Skipped | `8372108`, run `37728716034` |
| Canonical production route | No production run | Not performed | No production claim |

## Security and negative proof

- Denied identities/scopes: source tests cover non-Shopper visibility denial, catalog-only hiding, and cross-Shopper trip isolation. Runtime configured-service denial for production/non-loopback origins is not claimed.
- Failure and timeout behavior: UI07 covers generic list failure. Cancel, retry, and stale-version behavior are unchanged and were not independently exercised by this navigation candidate.
- Secret/PII handling: used only the allowlisted path-only CI receipt; no request/response bodies, credentials, cookies, auth headers, token URLs, traces, or videos were inspected.
- Security review: no dedicated security review. No auth, data, or API implementation changed; existing guards remain in place.

## Independent review

- Reviewer: independent Standards and Spec reviewers
- Standards verdict: `REWORK` — flagged the unintegrated configured helper and missing evidence document. This document addresses the missing-record finding; the helper remains an explicit #565 handoff artifact and still has no caller.
- Spec verdict: `PASS` for source acceptance, with a scope note on the separate Details → Add to Trip session-guard test.
- Final verdict: `REWORK`
- Findings and disposition: do not treat the helper as proof until #565 imports it. Keep the issue open until configured-local visible navigation succeeds and the scoped screenshots are retained or their absence is accepted in review. No new independent review was run after this evidence-only record was prepared.

## Unverified

Configured-local visible navigation remains blocked by the failed #565 check. Its safe path-only diagnostic cannot distinguish a missing link from failed click actionability. The configured helper is not integrated. CI did not retain the six screenshots; the proposed artifact contract is awaiting #565. Cancel, retry, stale-version, hosted/provider, and canonical production proof are not established by this navigation change. The Supabase Preview check was skipped.

## Invalidation

Implementation evidence applies to code candidate `8372108e4b9166299b3e76364d4715f0e78671ab` on synthetic review-harness and configured-local CI environments. This file is a later evidence-only record; it does not claim new checks against a subsequent commit. Rerun affected checks and review after any relevant source, runner, artifact, or integration change.
