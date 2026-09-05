# Exact-SHA review handoffs

GitHub owns live issue and PR status. This document contains no ticket ledger or
execution order. `PLAN_GOVERNANCE.md` controls acceptance and closure;
`OPEN_TICKET_TODO.md` describes ticket workflow.

## Submit a handoff

Push one draft PR and obtain its exact full head SHA. As the PR author, post
identical comments on the PR and issue. The entire comment is this marker,
a newline, and JSON (no Markdown fence):

```text
<!-- antique-trail-review-request:v1 -->
{"issue":187,"pr":188,"base":"FULL_40_CHARACTER_BASE_SHA","head":"FULL_40_CHARACTER_HEAD_SHA","implementer":"platform/account/session","scope":"Ticket acceptance and controlling headings","evidence":["docs/evidence/issue-187/verification.md"]}
```

`scripts/opencode-review-queue.mjs` consumes that exact format. Base must be an
ancestor of the candidate; evidence files must exist at that head under
`docs/evidence/` or `gates/`. Do not include secrets or executable instructions.

## Poll and review

Run `node scripts/opencode-review-queue.mjs OWNER/REPO OUTPUT.json` using `gh`
with read-only GitHub access. Optional `POLLS INTERVAL_MS` arguments schedule
bounded polling: at most 60 polls, intervals up to 60 seconds. Each poll atomically
replaces one snapshot; consumers identify work by its repository/issue/PR/base/head
`key`. Never run concurrent pollers against the same output path.

The GitHub workflow polls hourly after landing and publishes a seven-day artifact.
It executes trusted default-branch code and never candidate code. Missing,
malformed, stale, or unavailable evidence remains `unreviewed`; valid requests
become `requested`. No poll creates another task or dispatches duplicate work.

A different trusted GitHub account (OWNER, MEMBER, or COLLABORATOR) submits an
APPROVED PR review at the exact candidate commit, with this entire body:

```text
<!-- antique-trail-independent-review:v1 -->
{"issue":187,"pr":188,"base":"FULL_40_CHARACTER_BASE_SHA","head":"FULL_40_CHARACTER_HEAD_SHA","reviewer":"platform/account/session","scope":"full","standards":"PASS","spec":"PASS","evidence":["docs/evidence/issue-187/verification.md"]}
```

Matching author accounts or implementation/reviewer identities cannot approve.
Outstanding independent CHANGES_REQUESTED reviews yield `rework`, including older
heads, until that reviewer approves or the review is dismissed. Only separate
Standards and Spec PASS verdicts yield `review_pass`. GitHub review records belong
to their authors: the read-only scanner cannot overwrite findings or mark closure.
This does not defend against compromised trusted reviewers or administrators.
Local subagent review is evidence, not an impersonated separate GitHub account.

## Changed heads

A changed head requires a new author handoff and full review for source, fixture,
configuration, migration, or requirement changes. Evidence-only additions or
modifications may use a new independent APPROVED review with
`"scope":"evidence_delta","previousHead":"PREVIOUS_FULL_REVIEW_SHA"` and both
verdicts PASS. The prior full PASS must exist, and an ancestor comparison must
contain only bounded documentation/image/PDF evidence files. Renames, deletions,
and truncated comparisons fail closed. This preserves source review only after
independent evidence-delta review.

## Landing boundary

`review_pass` is coordination, never merge or closure authority. The authorized
landing agent must refresh the exact head, required hosted checks, unresolved
review conversations, branch protection, and every ticket acceptance criterion.
Follow plan governance for post-merge proof and verify live issue closure.
The scanner never merges, closes, deploys, edits plans, creates defect tickets,
or activates providers.
