# Ticket Workflow

GitHub is the live backlog. This file defines the workflow only; it never duplicates issue, pull-request, or release status.

## Pick work

An implementation ticket is available when:

1. it is open and passes `validatePlanTicket`;
2. its dependencies are closed with merged evidence;
3. no active pull request or remote branch already owns it; and
4. its files do not overlap another active ticket.

Independent tickets may run in separate worktrees. Serialize shared source, schema, migration, fixture, and evidence paths. A hard task is not blocked; only an external fact outside repository control is.

## Keep tickets small

Each implementation ticket has one independently closable outcome, one to five acceptance criteria, and only the layers needed to prove that outcome. Put a broad feature or release milestone in a parent issue. Put human, provider, legal, payment, research-cohort, promotion, or production-activation evidence in a separate gate issue.

Split an untouched oversized issue before claiming it. Do not rewrite an active reviewed pull request solely to match the current format.

## Execute

1. Refresh `origin/main`, live issues, pull requests, and matching remote branches.
2. Validate the ticket and read only its cited plan headings and affected code paths.
3. Create `codex/issue-N-short-name` from current `origin/main` in a clean worktree and push it promptly so ownership is visible.
4. Implement the smallest root-cause change. Preserve unrelated work and keep staged-off capabilities off.
5. Map every acceptance criterion to an executable check or artifact.
6. Run proportional checks, inspect the full diff, and commit only ticket-owned files.
7. Open a pull request with `Closes #N`. Resolve findings and wait for required hosted checks.
8. Merge only when the accepted source candidate and its evidence satisfy the ticket. GitHub closes the issue. Reopen it if the accepted result is later disproved.

## Proportional checks

| Change | Required proof |
| --- | --- |
| Documentation or workflow | Relevant contract tests and `git diff --check` |
| TypeScript or application behavior | Focused tests, typecheck, lint, format, and build |
| UI behavior or layout | Application checks plus the targeted browser and ticket-named accessibility states |
| SQL, RLS, RPC, Edge authorization, security, payment, or destructive lifecycle | Focused allow/deny tests, clean database test environment, and applicable security checks |
| Provider or production activation | Only the ticket-named provider/production checks, with authorized credentials and real receipts |

A missing required environment is `UNAVAILABLE`, not `PASS`. Do not run unrelated suites to create the appearance of evidence.

## Review

Independent review is required for plan amendments and for code affecting security, privacy, authorization, money, migrations, destructive lifecycle behavior, or release activation. Other work uses normal pull-request review unless its ticket raises the risk.

Review the source candidate at an exact SHA against the ticket and its cited plan. A later evidence-only commit needs only an evidence-delta check and does not invalidate source review. Any source, requirement, configuration, executable fixture, or migration change invalidates affected review and checks.

## External gates

Repository implementation and external activation are separate outcomes. A staged-off implementation may close while its external gate stays open. The gate issue owns the real-world evidence and blocks only the activation it names.

Never deploy, contact participants, spend money, activate providers, publish, promote, or use real data without the required authorization. Do not keep an implementation issue open merely to mirror one of those external gates.
