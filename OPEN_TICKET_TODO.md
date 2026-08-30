# Open Ticket Closure TODO

Status baseline: 2026-08-30, `main` at `08456f0b6188dc5454ea65f94c04ded15ca46829`.

This is an execution and state ledger, not a controlling plan, plan amendment, product decision, or release authorization. `PLAN_GOVERNANCE.md`, the controlling sources named by each issue, live GitHub issue/PR state, and the repository's current default branch remain authoritative. Never edit a protected plan file unless the Product Owner has explicitly said `update plan` and the full plan-amendment process is being followed.

## How to choose the next ticket

Work on one implementation ticket at a time. Separate review agents may run while the implementing agent is active, but a second implementation agent must not start another ticket until the current item is closed or recorded as a dated external blocker under the protocol below.

The **next available ticket** is the first unchecked item in `Ordered tickets` for which all of these are true:

1. The GitHub issue is open and its live body passes `validatePlanTicket`.
2. Every dependency printed on its row is closed with merged evidence.
3. Every earlier row is either `[x]` and its issue is closed, or `[!]` with a dated GitHub blocker comment and the candidate ticket does not depend on that blocker.
4. There is no open pull request, winning claim, or active branch for that issue.

Do not reorder the list because another ticket looks easier. If the first unchecked row is merely difficult, continue it. Skip it only for a genuine external/human/provider/authorization blocker that the repository cannot resolve and only after recording `[!]` through the blocker protocol.

## Ordered tickets

- [ ] 01. #142 — Semantic color-token implementation conformance. Dependencies: none.
- [ ] 02. #125 — Minimize the Portal media-history response. Dependencies: none; sequenced after #142 to keep one implementation lane.
- [ ] 03. #123 — Complete rejected-media resubmission. Dependencies: #125.
- [ ] 04. #124 — Prove the media-history/resubmit contract in pgTAP. Dependencies: #125 and #123.
- [ ] 05. #126 — Reconcile media issue/evidence truth after the final #123–#125 outcomes are known. Dependencies: #125, #123, and #124.
- [ ] 06. #129 — Complete Saved store → existing/new trip continuation. Dependencies: #142.
- [ ] 07. #137 — Conform Administrator navigation to exactly Review | Access | More. Dependencies: #142.
- [ ] 08. #130 — Complete exact-scope Access & Safety. Dependencies: #137.
- [ ] 09. #131 — Implement narrow D30 View Audit. Dependencies: #137 and #130.
- [ ] 10. #140 — Complete moderation consequence preview and sole confirmation CTA. Dependencies: #142.
- [ ] 11. #135 — Prove Partner/Portal direct-route denial and cross-store isolation after affected surfaces stabilize. Dependencies: #123, #124, #137, #130, and #131.
- [ ] 12. #117 — Run the final Packages 9/10A/10B staged-off sweep. Dependencies: #137, #140, and #135.
- [ ] 13. #56 — Re-audit and close the human/provider Regional Public MVP release tracker. Dependencies: every applicable implementation/evidence ticket above plus every named human/provider gate; close last.

Closed during the 2026-08-30 governance audit and therefore not executable rows:

- #139 — closed as plan-invalid and superseded by #130; a searchable People directory/new destination requires an explicit `update plan` amendment.
- #146 and draft PR #158 — closed because protected design-plan changes lacked the exact `update plan` authorization and `PLAN_CHANGELOG.md` receipt; reopen only after that authorization.

## One-ticket execution protocol

### 1. Refresh and prove the ticket is the next available item

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

Stop if the worktree is dirty with changes you do not own. Never reset, discard, overwrite, or include another person's work. Read this file from the refreshed default branch and select only the first available row by the rules above. The repository currently uses `main`; the user's word “master” means the verified default branch, never a hard-coded branch name.

Set the issue number, re-fetch its live body, and validate it:

```powershell
$ticketNumber = 142 # replace only with the selected row
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
TODO position: <number>
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

### 4. Work until wowed

Implement the smallest complete root-cause slice that satisfies every acceptance criterion. “Wowed” means all of the following are true:

1. The user journey or operational outcome works end to end, not only in a component or mock.
2. Authorization and privacy are enforced at the server boundary, with required allow and deny cases.
3. Loading, empty, error, retry, expired/stale, direct-route, and duplicate/idempotency states are truthful where applicable.
4. Desktop, tablet, 320 CSS-px mobile, real-browser 200% zoom/reflow, user text-spacing overrides, keyboard, visible focus, screen-reader status, dark theme, and forced-colors requirements are covered where applicable.
5. No controlling requirement is weakened, no capability is silently activated, no historical migration is edited, and no unrelated cleanup is included.
6. Evidence clearly separates synthetic harness/UI proof from production RPC/RLS/Storage/provider proof.
7. Every acceptance checkbox has a reproducible pass artifact tied to one candidate SHA.

Use `apply_patch` for deliberate file edits. Preserve unrelated changes. Add or update tests before treating a behavior claim as complete.

### 5. Run the ticket checks and the repository floor

Run every command in the ticket's `Verification` section. Then run the common floor from a clean working state:

```powershell
npm run check
npm run security:contract
npm run test:release
node --test scripts/plan-governance-contract.test.mjs
git diff --check
git status --short
git diff --stat $ticketBaseSha
git diff $ticketBaseSha -- OPEN_TICKET_TODO.md
```

Run a clean Supabase reset/full pgTAP, Playwright, provider drill, or production smoke whenever the ticket requires it. Missing Docker, browser, credentials, provider access, or human evidence is `UNAVAILABLE` or `BLOCKED`, never `PASS`.

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

The reviewer must report findings with file/line or evidence location and severity. Fix every valid finding, rerun affected checks, commit the fixes, update `$ticketCandidateSha`, and have the separate reviewer recheck the new full diff. Record reviewer identity, reviewed base/head SHAs, both lanes, every finding/disposition, and reruns at `docs/evidence/issue-<N>/independent-review.md`; commit that history. Continue until the separate reviewer approves the candidate. Self-review, a test pass, or a generic “looks good” does not satisfy this gate.

### 7. Push a draft PR and make the TODO change part of the reviewed diff

Push the reviewed candidate branch and open a draft pull request. Its body must fill every required heading from `.github/pull_request_template.md`: `Ticket`, `Reason addressed`, `Plan requirements`, `Plan conformance`, `Acceptance evidence`, `Verification`, and `Plan change authorization`. For ordinary work state `Conforming work; no plan change`; never write `update plan` unless the Product Owner actually issued it.

After GitHub assigns the PR number and after all acceptance work is complete, change only this ticket's row in `Ordered tickets` from `[ ]` to:

```text
- [x] NN. #ISSUE — COMPLETE IN PR #PR — <short outcome>. Dependencies: <unchanged>.
```

Commit and push that TODO update on the same issue branch. Re-run the plan-governance tests, `git diff --check`, and any check affected by the final diff. Update `$ticketCandidateSha`; the separate reviewer must review this final base-to-head diff, including the TODO change and independent-review history, then post a `FINAL INDEPENDENT REVIEW` PR comment naming that exact head SHA and explicitly stating either open findings or no open findings. Link that exact-head comment in closure evidence. Do not create a self-referential receipt commit and do not change another row.

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

At `$ticketMergeSha`, rerun every command in the ticket's `Verification` section plus the applicable common floor, plan-governance test, and `git diff --check`. Add the exact post-merge results to the closure evidence. If a post-merge check fails, leave the issue open, create a new governed repair PR, and repeat the review, hosted, and post-merge gates.

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

Close only when the issue reason is actually addressed and every required criterion is proved. Then verify both sources of state:

```powershell
gh issue close $ticketNumber --reason completed
gh issue view $ticketNumber --json state,closedAt,url
git show "origin/${ticketDefaultBranch}:OPEN_TICKET_TODO.md" | Select-String "#${ticketNumber}"
```

The next implementation agent may start only when the live issue is `CLOSED` and its default-branch TODO row is `[x]`.

## External blocker protocol

Use this only after exhausting safe in-scope repository work and confirming that the exact blocker is an external human/provider/payment/legal/authorization/environment fact. Add a dated issue comment containing the failed/unavailable gate, commands/evidence, why repository work cannot resolve it, responsible human/provider, exact next action, and what proves unblocked.

On a small bookkeeping branch from current default, change only `[ ]` to `[!]` and append:

```text
BLOCKED YYYY-MM-DD — <owner> must <exact action>; evidence: <issue comment URL>
```

Open a governed PR, pass the required checks, merge it, and verify the row on the default branch. `[!]` is not complete and the issue stays open. A later independent ticket may become next available only if it does not depend on the blocker; otherwise the ordered flow stops. Never use `[!]` because implementation is hard, tests fail, review has findings, or time is short.

## Completion invariant

The ledger is finished only when every row is `[x]`, every corresponding issue is closed, every implementation PR is merged to the verified default branch, and #56 has the required human/provider/public-release evidence. A checked box alone, a closed issue alone, green local tests alone, or a synthetic review alone is never completion.
