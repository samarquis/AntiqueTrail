# Engineering Workflow

This is the only active delivery workflow. PRD owns product scope; live GitHub issue bodies own current task outcomes and status. Changelogs, archived plans, old comments and evidence are history, not additional prerequisites. When updating an issue, reconcile its body with accepted later decisions; preserve old comments as audit history.

## Work queues

- **Product:** the connected shopper outing and basic owner/admin listing management. Select the next observable missing connection, not the next historical package number.
- **Maintenance:** existing data, security, account and approved-media obligations. These block the capabilities that actually depend on them, not all local development.
- **Release:** proof/publication for an exact admitted candidate, owned by the existing operator. Keep paused releases paused; do not reopen broad launch or paid-upgrade work from a documentation change.

Every open task has one queue, an honest status and one current outcome. Parent tickets summarize unfinished evidence; never assign them as broad implementation jobs. Closed/superseded orchestration is not a queue. The old phase roadmap, model-specific swarm instructions and generated `.planning` handoffs are retired.

Use capability names. Historical package numbers remain compatibility identifiers for migrations and receipts, never execution order. Existing code/data/permissions retain their protections until a separately reviewed change retires them.

### Retained review tooling

The hourly [Exact-SHA review queue](../../.github/workflows/opencode-review-queue.yml)
is retained as an optional read-only compatibility report, not a second product
queue or an acceptance gate. Its structured-comment protocol in
`scripts/opencode-review-queue.mjs` reads explicitly opted-in draft PR/issue
handoffs and independent reviews, then emits a seven-day artifact. It never
assigns, implements, merges or closes work. Ordinary tasks use the workflow and
current issue bodies here; no duplicate marker comments are required.

## 1. Establish authority and state

Identify authorized outcome: inspect, implement, publish, deploy, or operate hosted data. Do not infer later stages from an earlier one.

Capture:

- issue/spec and observable acceptance criteria;
- current branch, upstream, HEAD, and working-tree state;
- active issue, PR, branch, worktree, and chat ownership;
- relevant source-of-truth documents;
- external dependencies required for proof.

Completion: scope, authority, baseline SHA, owner, and pre-existing changes are explicit.

### Admit a bounded task

Use the [small-task issue template](../../.github/ISSUE_TEMPLATE/small-task.md). READY means one observable outcome with resolved governing clauses, a pinned base/target, satisfied dependencies, exact owned files and interfaces, runnable acceptance commands, required negative cases, resource ownership, and a clear completion boundary. The planner verifies these before dispatch; the worker does not invent missing product or API decisions.

Use SPECIFICATION for unresolved contracts, BLOCKED for missing decisions/environment/dependencies, and INTEGRATING for accepted work awaiting its existing integration owner. Keep broad parents as acceptance maps; create independent leaves only after their contracts are fixed. Preserve security, privacy, accessibility, and failure handling when reducing scope. Usually one runtime boundary and one to three implementation files plus direct tests fit a leaf; justify larger scope instead of enforcing an arbitrary line limit.

Completion: a fresh worker can execute without reconstructing decisions from chat history. An unchanged baseline that already passes calls for missing regression proof only, not a speculative rewrite.

## 2. Coordinate concurrent chats

Before editing, check `git worktree list --porcelain`, relevant local/remote branches, and live issue/PR ownership. One chat owns one ticket worktree. If another chat already owns overlapping work, coordinate through its committed SHA or wait for its handoff; do not open a second implementation lane against the same seam.

Keep integration deterministic:

- use committed SHAs as handoff boundaries;
- compare changed paths before combining branches;
- integrate one reviewed candidate at a time;
- give shared harness/package-script changes one writer and stable interfaces before dependent leaves start;
- assign final sibling composition, required CI, and main closure to one integrator; distinguish a staging-branch merge from main completion;
- rerun affected evidence after integration;
- preserve unknown dirty files and untracked artifacts;
- use `work-overseer` when the user requests multi-ticket coordination.

When external GitHub writes are authorized, record ownership on the issue or draft PR. Otherwise include ownership in local handoff output.

Completion: current owner is known, file overlap is resolved, and integration order is explicit.

For local provider, browser, or database runs, follow [LOCAL_PROOF_PREFLIGHT.md](LOCAL_PROOF_PREFLIGHT.md). Start with one leased heavy local test lane; permit more only after demonstrating isolated resources and adequate capacity. Independent source work may continue while that lane is occupied.

## 3. Isolate work

Use one branch and worktree per ticket. Reuse an existing owned worktree when it contains ticket state. Treat unknown dirty files as preserved user work. Separate semantic changes from line-ending churn with `git diff --ignore-space-at-eol` before judging scope.

Completion: every edited path belongs to current ticket and unrelated state remains untouched.

## 4. Classify risk and route skills

| Change                                                                                                                       | Risk     | Required workflow                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Documentation or mechanical change                                                                                           | Low      | Focused validation and exact-diff review                                                                                   |
| Normal feature or bug                                                                                                        | Standard | `tdd`, then `code-review`                                                                                                  |
| Visible UI                                                                                                                   | Standard | Impeccable or `better-interface`, `verify-ui-change`, important error/empty/loading states                                 |
| Repeated critical browser journey                                                                                            | Standard | `replay-user-flows` after real flow passes                                                                                 |
| Auth, authorization, secrets, payments, migrations, destructive behavior, untrusted input, network egress, public API/schema | High     | Supabase guidance when applicable, negative tests, `codex-security:security-diff-scan`, independent exact-candidate review |
| Whole-site release review                                                                                                    | High     | `audit-my-app`, `design-system-compliance`, canonical-route verification                                                   |
| Multiple owned tickets                                                                                                       | Varies   | `work-overseer`; each ticket keeps separate branch, evidence, and closure                                                  |

If a named skill is unavailable, follow its stated outcome manually and record that limitation.

Completion: risk and required proof axes are recorded before implementation.

## 5. Build against an answer key

For each criterion record: observable pass/fail condition, verification method, and evidence owner. Start behavior work with a failing test or running-app expectation. Implement smallest coherent fix. Tests must cover relevant success, failure, boundary, and authorization-denial paths.

Completion: every criterion has implementation and behavior-focused proof, or an explicit blocker.

## 6. Verify in layers

Run only applicable layers, but never merge them into one claim:

1. Focused tests for changed behavior.
2. Type, lint, formatting, release-contract, and build checks.
3. Database migration replay and pgTAP when schema/RPC/RLS changes.
4. Rendered desktop/mobile UI with accessibility and important states.
5. Hosted disposable-account/provider lifecycle only when the acceptance contract requires it and authorization/environment access exist. Local-only tickets retain a separate hosted gate rather than silently inheriting one.
6. Canonical production route after authorized deployment.

Use `npm run check` from a clean worktree for repository-wide web validation. Use `npm run verify:web` when full browser coverage is required. CI remains final clean-environment proof.

For catalog Edge changes, run `npm run check:catalog-edge` before committing: it checks types, owned-file formatting, the source-text release contract in `scripts/shared-alpha-catalog-gate.test.mjs`, and focused Edge tests. That release test reads source strings and is not represented by call-graph edges. The nearby map positive fixture is compared with a real `createCatalogClient` request; malformed-input fixtures remain separate. This fast check supplements the required full check and CI, without repeating them on an unchanged candidate.

Completion: applicable layers pass against same candidate, and unavailable layers are named as unverified.

## 7. Pin and review candidate

Commit candidate, record baseline SHA and candidate SHA, then compute a diff fingerprint when review evidence is substantial:

```powershell
git diff --binary --full-index <baseline-sha>...<candidate-sha> | git hash-object --stdin
```

Independent review checks repository standards and issue/spec separately. Freeze source while acceptance runs execute. Any affected source, configuration, or fixture change invalidates its prior review and verification evidence. An unrelated main advance does not alone invalidate a result; assess overlap and obey actual branch protection. After conflict resolution or integration changes, rerun affected proof and all required checks on the candidate being merged.

Verdicts:

- `WOWED`: all acceptance criteria evidenced; no actionable finding remains.
- `REWORK`: correctable acceptance or quality gap remains.
- `BLOCKED`: required authority, environment, credential, or external state prevents completion.

Completion: exact candidate has a defensible verdict and evidence record.

## 8. Close only what is proved

PR description links issue and evidence. Required checks must pass at exact head. User approval gates remain explicit. After merge, verify resulting `main` SHA. After deployment, verify canonical rendered behavior and console/network health relevant to change.

Completion: issue closure, merge, and deployment claims each have their own evidence; unfinished gates remain open.
