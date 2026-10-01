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
| Approved Owner roles read only the selected store's five billing-status fields; paid actions remain unavailable. | pgTAP and configured authenticated Owner-to-RPC browser flow; see [database](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486911/job/110591609660) and [Owner browser](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486911/job/110592763031). |
| Wrong store/account, anonymous, Listing Editor, and revoked session cannot read status; denied reads are audited. | pgTAP denial matrix and rollback-surviving audit assertion in [database job](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486911/job/110591609660); anonymous direct invocation added at candidate SHA. |
| Browser proof uses synthetic fixtures and removes its temporary test account. | [Owner browser job](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486911/job/110592763031); [artifact 11195740406](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486911/artifacts/11195740406) reports `real-local-browser`, passed, expected=1, skipped=0, unexpected=0, flaky=0, cleanup=`removed`. Runner merge SHA `c77a63f1` has parents baseline `1e9d5b33` and candidate `6df8649a`. |

## Verification

- Exact-candidate GitHub Actions passed: [database](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486911/job/110591609660), [web](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486911/job/110591609894), [configured Owner browser](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486911/job/110592763031), [session sign-out](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486902/job/110591610103), and [configured seed-media](https://github.com/samarquis/AntiqueTrail/actions/runs/36928486953/job/110591609700). Supabase Preview was skipped.
- Prior implementation SHA `59c4c6e74071e4c35ea17553cc95713f4154bacf`: focused local tests 15/15; typecheck, lint, Prettier, and `git diff --check` passed. Lint reported 15 existing warnings. Candidate delta is the anonymous-denial pgTAP assertion.
- Local Supabase unavailable: Docker Desktop Linux engine pipe missing. CI uses disposable local Supabase; no hosted or production behavior is claimed.
- Completed Codex Security scan `db7f1649-ae1f-490d-ac2b-f4f9f7042483`: 0 findings, complete coverage, baseline through `59c4c6e7`. Final candidate adds a test assertion only.
- Exact `6df8649a` scan receipt is pending from the coordinating task; no exact-head scan result is claimed here yet.
- A separate scan completion attempt failed because `scan-manifest.json` was missing; no result is claimed for that attempt.
- Exact-head delta review: anonymous test changes only the pgTAP role, asserts SQLSTATE `42501`, then restores `authenticated`; exact-candidate database job passed. No issue found in this delta.

No deployment was performed. Production-route evidence is outside this ticket.
