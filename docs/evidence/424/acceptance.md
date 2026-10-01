# Evidence — issue #424

## Candidate

- Issue/spec: [#424 — Let Store Owner manage team access for their store](https://github.com/samarquis/AntiqueTrail/issues/424)
- Owner/chat: `samarquis` / Codex task
- Risk: high (authorization, identity, and audit data)
- Baseline SHA: `080a3163fc4eb65bbbf72143afad8c3e9c91b775`
- Candidate SHA: `5d8549434b87159180103ffab558889a95b34362`
- Diff fingerprint: `6ca480de862b1023c834d184bc0c35890b788a34`
- Pull request: [#462](https://github.com/samarquis/AntiqueTrail/pull/462), open; required checks pass at candidate SHA
- Worktree/branch: `C:\Users\samar\.codex\worktrees\9779\AntiqueTrail` / `codex/issue-424-team-access`
- Evidence captured at: 2026-10-01

## Scope

Changed outcome: Store Owners can invite, accept, list, and revoke exact-store team access using verified-email, MFA, and recent-auth checks. Site Admin can remove an eligible synthetic-store team grant with a bounded reason recorded in the grant and audit chain. Invitations expire through the lifecycle worker.

Excluded scope: production deployment or provider mutation, email delivery, billing, site AI features, and Reticle instrumentation. The candidate adds no AI feature, AI provider, or Reticle code.

Overlapping branches/worktrees checked: issue #424 is assigned to `samarquis`; PR #462 owns this candidate. Dependencies #422 and #429 are closed. No competing owner or PR was found.

Pre-existing failures or unrelated work: local lint completed with 14 existing warnings. No unrelated changes are included in the final candidate.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Owner grants exact-store team access | Authorized Owner invites an eligible verified teammate; server binds the grant to the selected store and team state updates. | Owner client tests, browser suite, and pgTAP assertions. | Pass: GitHub web CI and database CI passed at `5d854943`. |
| Owner revokes access safely | Revocation is version-bound and replay-aware; stale-auth and revoked sessions cannot change team access. | pgTAP direct-RPC checks for stale signed AMR claims, revoked session, and stale versions. | Pass: exact-head database CI; stale-auth denial created no invitation and its audit assertion identified the new event. |
| Forbidden authority is denied and audited | Cross-store, Administrator delegation, self-invitation, primary-Owner removal, and unauthorized role changes fail server-side; Site Admin reason is retained. | Negative pgTAP assertions and source security review. | Pass: exact-head database CI and 0-finding source review. |
| Browser/database paths are covered | Invite, accept, list, revoke, denial, and error paths have observable checks. | Full Chromium E2E suite, configured media/session workflows, and pgTAP. | Pass: 645 browser tests and 3,632 database tests passed; media and session workflows passed at `5d854943`. |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Focused UI tests | Focused Vitest suite for partner admin/team UI | 23 passed | `7a8f5f3c…`, local; UI source unchanged at final candidate |
| Local type/lint/format/build | `npm run typecheck`; `npm run lint`; `npm run format`; `npm run build`; `npm run security:contract` | Pass; lint has 14 existing warnings | `7a8f5f3c…`, local |
| Final diff hygiene | `git diff --check` | Pass | Test correction in final candidate worktree |
| GitHub web CI | [Run 36899573765](https://github.com/samarquis/AntiqueTrail/actions/runs/36899573765) | Pass: static checks, 1,059 unit tests (1 skipped), build, 645 browser tests | `5d854943…` |
| GitHub database CI | [Run 36899573765](https://github.com/samarquis/AntiqueTrail/actions/runs/36899573765) | Pass: migrations, reset, 121 pgTAP files / 3,632 assertions, rollback audit checks | `5d854943…` |
| Configured media | [Run 36899573778](https://github.com/samarquis/AntiqueTrail/actions/runs/36899573778) | Pass: configured desktop and phone media | `5d854943…` |
| Configured session sign-out | [Run 36899573806](https://github.com/samarquis/AntiqueTrail/actions/runs/36899573806) | Pass: disposable-session acceptance | `5d854943…` |
| Local database/RLS/RPC | `npx supabase test db` | Not run: Docker unavailable and `127.0.0.1:54322` refused the connection | Local database unavailable; exact-head GitHub database CI passed |
| Supabase Preview | GitHub check | Skipped | No hosted/provider proof |
| Canonical production route | No deployment performed | Unverified / outside scope | No production claim |

## Security and negative proof

- Denied identities/scopes: server-side RPCs restrict exact store, eligible roles, active session, verified email, MFA, fresh provider-signed authentication, current anchor, and expected version. pgTAP proves stale signed AMR claims and revoked sessions cannot create invitations; cross-store and primary-Owner actions are denied.
- Failure and replay behavior: stale versions return the current package version; idempotency mismatches are rejected; each stale/revoked audit assertion is bounded to the event sequence created by that request.
- Secret/PII handling: invitation email is purpose- and environment-scoped HMAC data while pending, is not returned in team projections, and is cleared on terminal transitions. Site Admin removal reason is bounded and included in the append-only audit chain.
- Exact-source security review: base `080a3163…` through source SHA `7a8f5f3c…`; 0 reportable findings across 21 source files. Scan ID `0373cc9b-3130-420f-b8ca-cc2aaf08b64b`; [report](C:\Users\samar\.codex\state\plugins\codex-security\scans\AntiqueTrail\7a8f5f3cc7ed407eab79b3e8ed7fae945780c236_20261001T170031Z_8x62lmq4\report.md). Later commits through candidate SHA change tests only; application/migration source is unchanged.
- No AI feature, AI provider integration, or Reticle instrumentation was added.

## Independent review

- Reviewer: exact-source security scan plus acceptance and repository-contract review.
- Standards verdict: pass; authority rules follow the approved Store Owner contract and changes stay within #424 scope.
- Spec verdict: pass; the stale-auth fixture now ages the provider-signed AMR claims read by authorization, and exact-head CI passes.
- Final verdict: `PASS — ready for merge`.
- Findings and disposition: pgTAP initially failed because the test helper regenerated fresh AMR timestamps after aging only the database session row. The fixture now supplies 11-minute-old claims. Audit checks use per-request sequence baselines. Final database and browser CI pass.

## Unverified

Hosted migration ledger, HMAC key provisioning, lifecycle-worker schedule/secret, hosted provider behavior, and production behavior remain unverified. No provider mutation or production deployment was requested or performed.

## Invalidation

Evidence is bound to candidate `5d8549434b87159180103ffab558889a95b34362` and the named local/GitHub environments. Relevant source, configuration, fixture, or integration changes invalidate affected checks and reviews.
