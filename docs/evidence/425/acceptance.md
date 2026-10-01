# Issue #425 proof

- Issue: [#425 — Show Store Owner exact-store billing status](https://github.com/samarquis/AntiqueTrail/issues/425); authority matrix approved in #429.
- PR: [#463](https://github.com/samarquis/AntiqueTrail/pull/463), `Closes #425`.
- Worktree/branch: `C:\Users\samar\.codex\worktrees\1cb2\AntiqueTrail`, `codex/issue-425-billing-status`.
- Baseline: `1e9d5b3368d9de52bc11334125ec894cf6650689`.
- Code candidate: `6df8649a623227c4cf9ed0a21b7c6ecef45d18ed` (adds direct anonymous RPC-denial assertion to the previously reviewed implementation).
- Source diff fingerprint: `def74197379e8c6fd24854f4a570885d3ccc9a0a`.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| Approved Owner roles read only the selected store's five billing-status fields; paid actions remain unavailable. | pgTAP and configured authenticated Owner-to-RPC browser flow; see [current-head database](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556835/job/110598471915) and [current-head Owner browser](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556835/job/110599592864). |
| Wrong store/account, anonymous, Listing Editor, and revoked session cannot read status; denied reads are audited. | pgTAP denial matrix and rollback-surviving audit assertion in [current-head database job](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556835/job/110598471915); anonymous direct invocation added at candidate SHA. |
| Browser proof uses synthetic fixtures and removes its temporary test account. | [current-head Owner browser job](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556835/job/110599592864); [artifact 11195973017](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556835/artifacts/11195973017) reports `real-local-browser`, passed, expected=1, skipped=0, unexpected=0, flaky=0, cleanup=`removed`. Runner merge SHA `dab91dec` has parents baseline `1e9d5b33` and PR head `100e24ca`. |

## Verification

- At PR head `100e24ca6ca52dcbc9b50a86d85d0f61f98b5f3e` (documentation-only relative to code candidate `6df8649a`), all required checks passed: [database](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556835/job/110598471915), [web](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556835/job/110598472393), [configured Owner browser](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556835/job/110599592864), [session sign-out](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556931/job/110598472516), and [configured seed-media](https://github.com/samarquis/AntiqueTrail/actions/runs/36930556788/job/110598471497). Supabase Preview was skipped.
- Prior implementation SHA `59c4c6e74071e4c35ea17553cc95713f4154bacf`: focused local tests 15/15; typecheck, lint, Prettier, and `git diff --check` passed. Lint reported 15 existing warnings. Candidate delta is the anonymous-denial pgTAP assertion.
- Local Supabase unavailable: Docker Desktop Linux engine pipe missing. CI uses disposable local Supabase; no hosted or production behavior is claimed.
- Exact Codex Security diff scan `b72c6872-d003-47fd-979e-725b7ff79b60`: 0 findings; complete coverage of all 24 review rows for baseline `1e9d5b3368d9de52bc11334125ec894cf6650689` through code candidate `6df8649a623227c4cf9ed0a21b7c6ecef45d18ed`.
- Completed Codex Security scan `db7f1649-ae1f-490d-ac2b-f4f9f7042483`: 0 findings, complete coverage, baseline through `59c4c6e7`. Final candidate adds a test assertion only.
- Scan limits: Daybreak access unavailable; production configuration, durable denial-log retention, GitHub artifact access/retention, runner egress, and effective Windows ACL were not established. This is source and disposable-CI evidence, not hosted or production proof.
- Exact-head delta review: anonymous test changes only the pgTAP role, asserts SQLSTATE `42501`, then restores `authenticated`; exact-candidate database job passed. No issue found in this delta.

No deployment was performed. Production-route evidence is outside this ticket.
