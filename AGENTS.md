# AntiqueTrail agent contract

Use this contract for repository work. Keep one source of truth per decision and preserve active work.

## Start

1. Read the issue or user request and identify whether authority is read-only, implementation, publication, or deployment.
2. Run `git status --short --branch`, inspect active worktrees and open issue/PR ownership, then preserve unrelated work.
3. Run `graft map`. If no graph exists, run `graft build`, then use `graft ask`, `graft skeleton`, or `graft callers` before broad source reads.
4. Read [docs/operations/ENGINEERING_WORKFLOW.md](docs/operations/ENGINEERING_WORKFLOW.md) for any code, database, UI, security, release, or multi-ticket task.

## Execute

- One ticket and one chat own one isolated worktree and branch. Never share a dirty worktree between chats.
- Coordinate with an existing owner instead of duplicating or overwriting its ticket, branch, worktree, or files.
- Primary checkout is an integration/recovery workspace when dirty. Exchange committed SHAs between chats; never copy unknown dirty files between worktrees.
- Read-only requests authorize inspection and reporting only. Keep source, provider settings, hosted data, and deployment state unchanged.
- Write observable acceptance criteria before implementation. Small, fully specified fixes may use user request or issue as contract.
- Classify risk before editing. Auth, authorization, secrets, payments, migrations, untrusted input, network egress, destructive operations, and public contracts are high risk.
- Use test-first work for behavior changes. Keep implementation to smallest root-cause-correct diff.
- `DESIGN.md` and `DESIGN_SYSTEM.md` govern visible UI. `SECURITY_AND_TRUST.md` governs security and authorization. `PACKAGE_CONTRACTS.md` governs database/package contracts.
- Record verification using [docs/evidence/TEMPLATE.md](docs/evidence/TEMPLATE.md). Evidence belongs to exact candidate SHA and becomes stale after affected changes.

## Finish

- Review exact candidate against both repository standards and acceptance contract.
- Report local, database, browser, hosted, and production evidence separately. State unavailable proof plainly.
- Push, PR creation, merge, provider mutation, publication, deployment, rollback, and data cleanup each require matching user authority.
- Production completion requires canonical rendered-route proof. A build, push, HTTP 200, preview URL, or provider `Ready` state is insufficient.
- Leave a concise handoff with owner, worktree, branch, candidate SHA, evidence, blockers, and unverified areas.
