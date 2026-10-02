# #426 Store Owner period-end cancellation acceptance

## Candidate and authority

- Issue: [#426](https://github.com/samarquis/AntiqueTrail/issues/426); publication: [PR #464](https://github.com/samarquis/AntiqueTrail/pull/464).
- Approved scope: primary Store Owner, exact owned store, existing paid subscription, cancellation of renewal at period end. [Product contract](../../specs/store-owner-paid-servicing.md) and [implementation admission](implementation-plan.md) preserve the decision and interfaces for later deep review.
- Owner/chat: 01a0fa12-0375-7cc1-a88f-ad30456f817a; checkout 8f76; branch `codex/issue-426-servicing-contract`.
- Baseline: `c0bf4e1265a608059284180513ed42706425f187`.
- Runtime proof candidate: `635bb27c2eb279b493ec83470e249a19e4e8d8ba`; recorded 2026-10-02 UTC.
- Publication adds explicit Node built-in imports to that candidate plus these evidence documents. Source schema, worker semantics and UI remain identical; hosted checks must pass on the final PR head before merge. The merge/main/closure receipt belongs on the issue after verification.
- Risk: high, authorization/payment/database boundary. One dedicated clean worktree; competing ownership checked before admission. No unrelated work integrated.

## Acceptance map

| Criterion | Observable evidence |
| --- | --- |
| Primary Owner cancels the exact paid store with current consent/authentication/versions | Local real Auth/MFA browser records immutable confirmation and pending intent; SQL verifies exact-store Owner, ten-minute authentication, fifteen-minute consent and source versions. |
| Unauthorized or stale requests cannot create effects | SQL covers wrong account/store, MFA/fresh-auth failure, absent fake binding, disabled stage, stale/expired consent, changed/consumed replay, revoked access and read-only team roles. |
| Lost response/concurrent change preserves durable reconciliation without false success | Fake-provider worker tests cover unknown/lost responses and retry; SQL checks provider schedule conflict, verified no-effect failure, terminal failure retry, one effect, revoked replay, restart, old-subscription replacement protection and boundary completion. |
| Local provider/database success and denial without payment activation | Run-owned local Supabase: 120 Owner assertions plus 86 team assertions passed; configured browser requested cancellation, worker reconciled with `pending=0`, and fresh browser displayed confirmed scheduling while retaining Gallery entitlement. |

## Verification layers

| Layer | Result and boundary |
| --- | --- |
| Focused client/UI/worker tests | 17 passed; typecheck passed. |
| Full unit suite | 1,083 passed, one existing skipped test, with `--maxWorkers=2`. Default parallel local attempt hit unrelated five-second timeouts under contention; bounded rerun passed without changing timeouts or unrelated tests. Subsequent edits affect SQL/harness only. |
| Release/build/static | 164 release tests passed; production build, built seed media, format and typecheck passed. Lint has zero errors after explicit built-in imports; 16 warnings remain, including the incumbent component/client export pattern. |
| Database | `node scripts/configured-representative-hours.mjs` replays migrations and runs `0132_store_owner_access.sql` plus `0133_issue_424_store_team_access.sql`: 206 assertions passed. |
| Real local browser | Seven passed cases: four desktop/phone Representative regression cases, Owner read-only baseline, Owner request/pending refresh, Owner verified scheduling. No skips/flakes; run-owned service cleanup `removed`. |
| Review browser/accessibility | Four desktop/320px cases passed: exact consequence confirmation, pending recovery, denial, no horizontal overflow, zero axe violations in tested pending view. Synthetic composition, separate from real local Auth proof. |
| Hosted CI | Final PR head must pass web, database, configured Owner billing and configured seed media before merge. Run links and uploaded reports live in PR checks; later issue receipt records exact head/run results. |
| Live provider/production | Unverified and outside this ticket's approved synthetic scope. No deployment or activation receipt. |

Local configured receipt: `artifacts/configured-shopper-d1d06727-5252-430b-966d-31b6bf80d2c5/report.json`, source clean at the runtime candidate; project `probe-16615eec37a24599956aed2a`. Function identity `b1095e5ec4c886fa1b336e0d4ef652cca12d84e5d014362ba041692cb42dfc44`; schema identity `ab258ad52ca0c936063e35a6f34d19d83ba6808ac1298c0b10ded51cd9cb2448`. Large local artifacts remain ignored; hosted CI uploads matching reports for durable review. Browser setup secrets are deleted before artifact publication.

## Review and repaired findings

Independent Standards and Spec reviewers returned no actionable findings at `635bb27c`. Earlier reviews found missing dispatch integration, permanent conflict recovery, omitted scheduled-target preview, old-subscription entitlement mutation, lock ordering and terminal intent resurrection. All repaired; regressions protect frozen source ownership and terminal zero-effect retry. SQL execution additionally caught the required Free `source='default'` transition. Harness failures exposed Node 20 compatibility and existing fixture ownership; both repaired without weakening assertions.

[Security receipt](security-review.md): complete scoped security review, no reportable findings at the runtime candidate. Explicit Node built-in imports are a mechanical lint repair; final exact-head independent review covers that delta.

## Learning checkpoint and remaining gates

Applied prior project lessons: preserve separate ownership, bind proof to exact source/environment, distinguish fake/local/hosted/production claims, and close only after merge/main verification. The run-owned harness caught real schema/fixture failures that unit/UI mocks missed. Keep that combined lane as the acceptance authority; use the repository's configured Node version when designing executable proof. Canonical learning remains in this evidence record; no private memory/vault update or promotion is claimed.

The synthetic feature is disabled by default and additionally requires local deployment, synthetic-alpha stage and fake-provider binding. Representative/provider authority stays unchanged; team billing remains read-only. Actual provider integration, hosted payment acceptance, public availability and deployment require separate work and release gates.

Re-run affected proof after source, fixture, configuration or integration changes. Documentation-only publication preserves runtime proof; required hosted checks and final independent review belong to the exact publication head.
