# Open Ticket Closure TODO

GitHub is the live queue. This file defines how tickets are selected, verified, reviewed, and closed; it does not duplicate issue or pull-request status.

This is an execution guide, not a controlling plan, plan amendment, product decision, or release authorization. `PLAN_GOVERNANCE.md`, the controlling sources named by each issue, live GitHub issue/PR state, and the repository's current default branch remain authoritative. Never edit a protected plan file unless the Product Owner has explicitly said `update plan` and the full plan-amendment process is being followed.

## How to choose the next ticket

Independent implementation tickets may run in parallel in separate worktrees. Serialize only tickets with a dependency or an overlapping source, schema, migration, test-fixture, or evidence path.

An **available ticket** is an open issue for which all of these are true:

1. The GitHub issue is open and its live body passes `validatePlanTicket`.
2. Every dependency in its live body is closed with merged evidence.
3. There is no open pull request, winning claim, or active branch for that issue.
4. Its owned paths do not overlap another active ticket, or the agents have agreed on serialization.

Repository implementation and external activation are separate outcomes. A code ticket must be closable with repository-controlled evidence; human, provider, research-cohort, payment, legal, or production-activation evidence belongs in a dependent gate issue.

## Ticket execution protocol

### 1. Refresh and prove the ticket is available

From a clean checkout, run:

```powershell
git status --short
git fetch --prune origin
$ticketDefaultBranch = gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
git switch $ticketDefaultBranch
git pull --ff-only origin $ticketDefaultBranch
git status --short
gh issue list --state open --limit 100 --json number,title,url
gh pr list --state open --limit 100 --json number,title,headRefName,url
```

Stop if the worktree is dirty with changes you do not own. Never reset, discard, overwrite, or include another person's work. Select an independently eligible issue from live GitHub state. The repository currently uses `main`; the user's word “master” means the verified default branch, never a hard-coded branch name.

Set the issue number, re-fetch its live body, and validate it:

```powershell
$ticketNumber = 142 # replace with the selected issue
$ticketIssue = gh issue view $ticketNumber --json number,title,body,state,labels,url
$ticketIssue | node --input-type=module -e "import {validatePlanTicket} from './scripts/plan-governance-contract.mjs'; let s=''; for await (const c of process.stdin) s+=c; const i=JSON.parse(s); const r=validatePlanTicket(i.body); console.log(JSON.stringify(r,null,2)); if(!r.valid) process.exit(1)"
```

If validation fails or the live ticket contradicts a controlling source, do not implement it. Correct the ticket under the governance contract, or record the exact blocker if correction would require `update plan` authority.

### 2. Claim without racing another agent

Before creating a branch, add this issue comment with real values:

```text
CLAIM
Agent/thread: <stable identifier>
Started UTC: <ISO-8601 time>
Base branch and SHA: <verified default branch> <origin SHA>
Owned paths: <paths or seam>
```

Immediately re-fetch comments, open PRs, and matching remote branches:

```powershell
gh issue view $ticketNumber --comments
gh pr list --state open --json number,headRefName,updatedAt,url
git ls-remote --heads origin "refs/heads/codex/issue-${ticketNumber}-*"
```

The earliest valid claim against the same current base wins. A losing agent stops without changing code. While work is active, post a `CLAIM HEARTBEAT` comment at least every 30 minutes with UTC time, branch, head SHA, last completed gate, and next action. On voluntary stop, post `CLAIM RELEASED` and the reason. A takeover is allowed only after at least 120 minutes without a claim/heartbeat, with no open PR and no matching remote branch; post `CLAIM TAKEOVER` citing those checks before branching. If a branch or PR still exists, a coordinator or human must explicitly release/reassign it—never guess that another agent is dead. A claim is not permission to change the plan, contact people, spend money, enable providers/capabilities, use production data, or bypass a gate.

Create one branch from the refreshed default branch:

```powershell
$ticketSlug = 'short-kebab-summary'
git switch -c "codex/issue-$ticketNumber-$ticketSlug"
$ticketBaseSha = git rev-parse HEAD
```

### 3. Build an acceptance gate before editing

Read every exact plan heading cited in the ticket, then inspect every current code/data/test/evidence seam named by the issue. Write the working checklist at `gates/issue-<N>.md`; map each ticket acceptance checkbox through this chain:

```text
ticket reason -> exact controlling heading -> root-cause change -> executable check -> evidence artifact
```

Pin the base SHA. Search for current callers, authorization boundaries, fixtures, routes, migrations, failure states, and existing tests before editing. If the evidence has drifted, update the ticket before implementation; do not make code satisfy a stale claim.

Keep implementation tickets small:

- one independently closable outcome;
- no more than five acceptance criteria;
- only the layers needed to prove that outcome end to end;
- no human, provider, cohort, payment, legal, or production-activation evidence; and
- one parent issue for any broader feature, dependency map, or release milestone.

Split an untouched oversized issue before claiming it. Do not rewrite an active reviewed PR merely to satisfy the newer ticket shape.

### 4. Work until wowed

Implement the smallest complete root-cause slice that satisfies every acceptance criterion. “Wowed” means all of the following are true:

1. The user journey or operational outcome works end to end, not only in a component or mock.
2. Authorization and privacy are enforced at the server boundary, with required allow and deny cases.
3. Loading, empty, error, retry, expired/stale, direct-route, and duplicate/idempotency states are truthful where applicable.
4. Applicable responsive and accessibility requirements from the ticket are covered. Do not add unrelated display modes to the ticket during review.
5. No controlling requirement is weakened, no capability is silently activated, no historical migration is edited, and no unrelated cleanup is included.
6. Evidence clearly separates synthetic harness/UI proof from production RPC/RLS/Storage/provider proof.
7. Every acceptance checkbox has a reproducible pass artifact tied to one candidate SHA.

Use `apply_patch` for deliberate file edits. Preserve unrelated changes. Add or update tests before treating a behavior claim as complete.

### 5. Run proportional checks

Run every command in the ticket's `Verification` section from a clean working state. Add checks from this table only when the diff contains that change type:

| Change type | Required checks |
| --- | --- |
| Documentation or workflow only | plan-governance test when applicable; `git diff --check` |
| TypeScript or application behavior | focused tests; typecheck; lint; format; build |
| UI behavior or layout | application checks plus the targeted Playwright spec and ticket-named accessibility states |
| SQL, RLS, RPC, Edge authorization, or security boundary | focused tests; clean Supabase reset and relevant pgTAP; `security:contract` |
| Provider or production activation | only the provider/production checks explicitly required by the ticket and available credentials |

Before review, always inspect the exact scope:

```powershell
git diff --check
git status --short
git diff --stat $ticketBaseSha
```

Missing Docker, browser, credentials, provider access, or human evidence is `UNAVAILABLE` or `BLOCKED`, never `PASS`. Do not run unrelated suites to compensate for an unavailable required check.

### 6. Require a separate-agent review

First create a reviewable candidate commit. Stage only ticket-owned files, inspect the staged diff, commit it, and pin the SHA:

```powershell
git status --short
git diff --stat $ticketBaseSha
git add -- <EXACT_TICKET_OWNED_PATHS>
git diff --cached --stat
git diff --cached
git commit -m "fix: close issue #$ticketNumber"
$ticketCandidateSha = git rev-parse HEAD
```

The reviewer must be a separate agent that did not author the implementation. Give it the ticket URL/number, exact base SHA, candidate SHA, diff, cited plan headings, `gates/issue-<N>.md`, and test/evidence paths. Require both review lanes:

- **Standards review:** correctness, security/privacy, authorization, data integrity, accessibility, maintainability, regression/blast radius, and evidence quality.
- **Specification review:** ticket reason, exact plan conformance, every acceptance criterion, dependencies/non-goals, responsive/state behavior, and no silent plan change.

The reviewer must report findings with file/line or evidence location and severity. Fix every valid finding, rerun affected checks, commit the fixes, update `$ticketCandidateSha`, and have the separate reviewer recheck the affected diff. Record reviewer identity, reviewed base/head SHAs, both lanes, findings, dispositions, and reruns in one ticket evidence file or the PR review. Continue until the separate reviewer approves the source candidate. Self-review, a test pass, or a generic “looks good” does not satisfy this gate.

### 7. Push a draft PR

Push the reviewed candidate branch and open a draft pull request. Its body must fill every required heading from `.github/pull_request_template.md`: `Ticket`, `Reason addressed`, `Plan requirements`, `Plan conformance`, `Acceptance evidence`, `Verification`, and `Plan change authorization`. For ordinary work state `Conforming work; no plan change`; never write `update plan` unless the Product Owner actually issued it.

Do not edit this guide merely to record issue or PR status. GitHub owns that state.

If a later commit changes only evidence about checks already run, the source review remains valid. The reviewer checks the evidence delta and confirms that no source, requirement, configuration, or executable fixture changed. Any such executable change invalidates the affected review and checks.

### 8. Merge only after all gates pass

Make the PR ready only after the final independent receipt and local checks pass. Wait for the required hosted `web`, `database`, and `plan-governance` checks on the final head SHA. Resolve every review conversation and confirm the branch is current and mergeable. Do not merge with pending, skipped, stale, neutral, cancelled, or failing required checks.

Merge through the pull request into the verified default branch, then refresh it:

```powershell
gh pr checks <PR_NUMBER>
gh pr view <PR_NUMBER> --json state,isDraft,mergeable,reviewDecision,statusCheckRollup,url
gh pr merge <PR_NUMBER> --merge --delete-branch
git switch $ticketDefaultBranch
git pull --ff-only origin $ticketDefaultBranch
$ticketMergeSha = git rev-parse HEAD
```

The required `Closes #N` PR reference closes the issue when the PR merges. At `$ticketMergeSha`, rerun the ticket's required checks and record the result in the issue. If a post-merge check fails, immediately run `gh issue reopen $ticketNumber`, record the failure, create a governed repair PR, and repeat the affected review, hosted, and post-merge gates.

Never push directly to the protected default branch and never force push.

### 9. Close the issue with criterion-level evidence

Post a closure comment that includes:

- PR URL and merge SHA;
- base SHA and final reviewed candidate SHA;
- each acceptance checkbox paired with its exact test/artifact;
- independent reviewer identity and final no-open-findings receipt;
- local and hosted command/check links and results;
- post-merge verification result;
- explicit limitations, unavailable evidence, and remaining provider/human gates.

Treat the issue as complete only when its reason is addressed and every required criterion is proved. After posting the closure evidence, verify live state:

```powershell
gh issue view $ticketNumber --json state,closedAt,url
```

A dependent implementation may start only when the prerequisite issue is `CLOSED` with merged evidence.

## External blocker protocol

Use this only after exhausting safe in-scope repository work and confirming that the exact blocker is an external human/provider/payment/legal/authorization/environment fact. Add a dated issue comment containing the failed/unavailable gate, commands/evidence, why repository work cannot resolve it, responsible human/provider, exact next action, and what proves unblocked.

Leave the issue open. Add or update a `blocked` label when available; no repository bookkeeping PR is required. Independent tickets may continue when they do not depend on the blocker or overlap its owned paths. Never mark a ticket blocked because implementation is hard, tests fail, review has findings, or time is short.

## Completion invariant

The backlog is finished only when live GitHub shows every required issue closed with its implementation merged and #56 has the required human/provider/public-release evidence. A closed issue alone, green local tests alone, or a synthetic review alone is never completion.
