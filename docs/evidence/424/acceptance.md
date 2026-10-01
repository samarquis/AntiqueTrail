# Evidence — issue #424

## Candidate

- Issue/spec: [#424 — Let Store Owner manage team access for their store](https://github.com/samarquis/AntiqueTrail/issues/424)
- Owner/chat: `samarquis` / Codex task
- Risk: high (authorization, identity, and audit data)
- Baseline SHA: `080a3163fc4eb65bbbf72143afad8c3e9c91b775`
- Candidate SHA: `5268459b572347cc4d1c16990536e9e01e23321b` (implementation commit)
- Diff fingerprint: `eccf54299897c9424363f5349cb7578030b5c24b`
- Worktree/branch: `C:\Users\samar\.codex\worktrees\9779\AntiqueTrail` / `codex/issue-424-team-access`
- Evidence captured at: 2026-10-01

## Scope

Changed outcome: Store Owners can invite, accept, list, and revoke exact-store team access using verified-email and MFA checks. Site Admin can remove an eligible synthetic-store team grant with a bounded reason recorded in the grant and audit chain.

Excluded scope: production deployment or provider mutation, billing, email delivery, site AI features, and Reticle/instrumentation. The candidate diff adds no AI integration or Reticle code.

Overlapping branches/worktrees checked: issue #424 is assigned to `samarquis`; no remote branch or PR exists for this branch. Dependencies #422 and #429 are closed.

Pre-existing failures or unrelated work: local Supabase/PostgreSQL could not start; Docker Engine was unavailable and `npx supabase test db` could not connect to `127.0.0.1:54322`. Lint reported 14 existing warnings and no errors.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Owner grants exact-store team access | Authorized Owner invites an eligible verified teammate; server binds access to the selected store. | Owner UI/client tests and pgTAP assertions. | UI/client tests pass; pgTAP assertions authored, execution pending GitHub CI. |
| Owner revokes access safely | Owner removal is version-bound, replay-aware, and immediately reflected in team state. | Unit, browser, and pgTAP coverage. | Unit/browser tests pass; database execution pending GitHub CI. |
| Forbidden authority is denied and audited | Cross-store, primary-Owner, stale, and unauthorized mutations fail server-side; Site Admin reason is retained. | SQL negative assertions and security review. | Source reviewed; pgTAP execution pending GitHub CI. |
| Browser/database paths are covered | Add, revoke, denial, and error paths have observable checks. | Chromium E2E and pgTAP. | 2 Chromium E2E tests pass; pgTAP execution pending GitHub CI. |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Focused tests | `npx vitest run src/features/partners/partnerAdmin.test.ts src/features/partners/partnerAdminComponents.test.tsx` | 16 passed | `5268459b…`, local |
| Type/lint/format/build | `npm run typecheck`; `npm run lint`; `npm run format`; `npm run build` | Pass; lint has 14 existing warnings | `5268459b…`, local |
| Contract checks | `npm run security:contract`; `git diff --check` | Pass | `5268459b…`, local |
| Database/RLS/RPC | `npx supabase test db` | Not run: Docker unavailable; connection refused at `127.0.0.1:54322`. GitHub CI pending. | Local database unavailable |
| Browser | `npx playwright test e2e/issue-424-team-access.spec.ts --project=chromium` | 2 passed | `5268459b…`, local Chromium |
| Accessibility/error states | Labeled required reason, disabled confirmation until valid, keyboard/browser flow | Covered by UI and E2E tests | `5268459b…`, local |
| Hosted/provider lifecycle | No hosted state inspected or changed | Unverified | Outside scope |
| Canonical production route | No production deployment | Not applicable | Outside scope |

## Security and negative proof

- Denied identities/scopes: server-side RPCs restrict exact store, eligible roles, active session, verified email, MFA, fresh authentication, grant state, and expected version; SQL negative cases cover cross-store and primary-Owner removal.
- Failure and timeout behavior: stale and mismatched idempotency operations are rejected; local database execution remains pending CI.
- Secret/PII handling: invitation email is HMAC-matched and not returned in team projections. Removal reason is bounded and control-free; UI warns against personal/shopper details.
- Security review: exact range `080a3163…5268459b` completed with 0 reportable findings. A conditional migration-replay candidate was suppressed: migration is absent from `origin/main`, branch is not remote, and the old RPC still enforced Site Admin checks. Hosted migration state was not inspected.
- Report: `C:\Users\samar\.codex\state\plugins\codex-security\scans\AntiqueTrail\5268459b572347cc4d1c16990536e9e01e23321b_20261001T144640Z_hfg2lrbj\report.md` (local Codex state).

## Independent review

- Reviewer: independent spec and standards review; Codex Security review at exact candidate SHA
- Standards verdict: pass after adding a required removal reason and restoring the `pendingSignals` projection
- Spec verdict: pass; #422 and #429 dependencies are closed
- Final verdict: `BLOCKED`
- Findings and disposition: earlier review caught the missing `pendingSignals` projection; fixed. Standards review required a plain-text Site Admin removal reason; added with validation, replay binding, and audit hashing. Awaiting GitHub CI database proof.

## Unverified

GitHub CI migration/pgTAP results, hosted migration ledger, HMAC key provisioning, lifecycle-worker schedule, and production behavior remain unverified. No production deployment was requested or performed.

## Invalidation

Evidence applies to implementation SHA `5268459b572347cc4d1c16990536e9e01e23321b` and the named local environment. Relevant source, configuration, fixture, or integration changes invalidate affected checks and reviews.
