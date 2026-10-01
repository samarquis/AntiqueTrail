# Evidence — issue #424

## Candidate

- Issue/spec: [#424 — Let Store Owner manage team access for their store](https://github.com/samarquis/AntiqueTrail/issues/424)
- Owner/chat: `samarquis` / Codex task
- Risk: high (authorization, identity, and audit data)
- Baseline SHA: `080a3163fc4eb65bbbf72143afad8c3e9c91b775`
- Candidate source SHA: `992d46c4132b61eccbd12304689c1edbae005f9c`
- Pull request: [#462](https://github.com/samarquis/AntiqueTrail/pull/462), open; code candidate is CI-green
- Worktree/branch: `C:\Users\samar\.codex\worktrees\9779\AntiqueTrail` / `codex/issue-424-team-access`
- Evidence captured at: 2026-10-01

## Scope

Changed outcome: Store Owners can invite, accept, list, and revoke exact-store team access using verified-email and MFA checks. Site Admin can remove an eligible synthetic-store team grant with a bounded reason recorded in the grant and audit chain.

Excluded scope: production deployment or provider mutation, billing, email delivery, site AI features, and Reticle/instrumentation. The candidate diff adds no AI integration or Reticle code.

Ownership/dependencies: issue #424 is assigned to `samarquis`; PR #462 contains the candidate. Dependencies #422 and #429 are closed. No competing owner or PR was found.

Local database limitation: Docker Engine was unavailable, so local Supabase/pgTAP could not run. GitHub database CI passed at the exact candidate SHA.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Owner grants exact-store team access | Authorized Owner invites an eligible verified teammate; server binds access to the selected store. | Owner UI/client tests and pgTAP assertions. | Pass: client tests passed locally; exact-head database CI passed. |
| Owner revokes access safely | Owner removal is version-bound, replay-aware, and immediately reflected in team state. | Unit, browser, and pgTAP coverage. | Pass: focused/browser tests and exact-head database CI passed. |
| Forbidden authority is denied and audited | Cross-store, primary-Owner, stale, and unauthorized mutations fail server-side; Site Admin reason is retained. | SQL negative assertions and security review. | Pass: exact-head pgTAP and source security review passed. |
| Browser/database paths are covered | Add, revoke, denial, and error paths have observable checks. | Chromium E2E, configured media/session checks, and pgTAP. | Pass: GitHub web, database, configured-media, and session-sign-out checks all passed at `992d46c4`. |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Focused UI tests | `npx vitest run src/features/partners/partnerAdmin.test.ts src/features/partners/partnerAdminComponents.test.tsx` | 16 passed | `5268459b…`, local; UI source unchanged through candidate |
| Local type/lint/format/build | `npm run typecheck`; `npm run lint`; `npm run format`; `npm run build` | Pass; lint has 14 existing warnings | `5268459b…`, local |
| Final-head contract | `npm run security:contract`; `git diff --check` | Pass | `992d46c4…`, local |
| GitHub web CI | [Run 36888540919](https://github.com/samarquis/AntiqueTrail/actions/runs/36888540919) | Pass: static checks, unit tests, build, browser tests | `992d46c4…` |
| GitHub database CI | [Run 36888540919](https://github.com/samarquis/AntiqueTrail/actions/runs/36888540919) | Pass: migrations, reset, pgTAP contracts, audit rollback checks | `992d46c4…` |
| Configured media | [Run 36888540913, attempt 2](https://github.com/samarquis/AntiqueTrail/actions/runs/36888540913) | Pass: configured desktop and phone media | `992d46c4…` |
| Configured session sign-out | [Run 36888540892](https://github.com/samarquis/AntiqueTrail/actions/runs/36888540892) | Pass: disposable-session acceptance | `992d46c4…` |
| Local browser | `npx playwright test e2e/issue-424-team-access.spec.ts --project=chromium` | 2 passed | `5268459b…`, local Chromium |
| Local database/RLS/RPC | `npx supabase test db` | Not run: Docker unavailable; connection refused at `127.0.0.1:54322` | Local database unavailable |
| Supabase Preview | GitHub check | Skipped | No hosted/provider proof |
| Production route | No deployment performed | Unverified / outside scope | No production claim |

## Security and negative proof

- Denied identities/scopes: server-side RPCs restrict exact store, eligible roles, active session, verified email, MFA, fresh authentication, grant state, and expected version. SQL tests cover cross-store and primary-Owner removal.
- Failure and replay handling: stale versions and mismatched idempotency operations are rejected; exact-head pgTAP passed.
- Secret/PII handling: invitation email is HMAC-matched and not returned in team projections. Removal reason is bounded and control-free; UI warns against personal/shopper details.
- Exact-source security review: range `080a3163…992d46c4`, 0 reportable findings, 21 changed source files. Scan ID `9b2165bb-d68a-479a-a2d6-055cc7d1ba70`; report: `C:\Users\samar\.codex\state\plugins\codex-security\scans\AntiqueTrail\992d46c4132b61eccbd12304689c1edbae005f9c_20261001T155926Z_vhg1vjy8\report.md`.
- No AI feature, AI provider integration, or Reticle instrumentation was added.

## Independent review

- Spec verdict: pass; dependencies #422 and #429 are closed.
- Standards verdict: pass; required Site Admin removal reason and `pendingSignals` projection are included.
- Exact-head security verdict: pass; 0 reportable findings.
- Final verdict: `PASS — ready for merge`.

## Unverified

Hosted migration ledger, HMAC key provisioning, lifecycle-worker schedule/secret, hosted provider behavior, and production behavior remain unverified. No provider mutation or production deployment was requested or performed.

## Invalidation

This evidence is bound to source candidate `992d46c4132b61eccbd12304689c1edbae005f9c` and the named local/GitHub environments. Relevant source, configuration, fixture, or integration changes invalidate affected checks and reviews.
