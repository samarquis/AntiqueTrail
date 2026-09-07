# Antique Trail Plan Governance

Status: locked governance contract. Effective 2026-08-30.

## One source of truth

The plan has one product entry point in `PRD.md` and linked specialist requirements with the exact ownership boundaries in `README.md`. `PLANNING_INDEX.md` classifies current sources and historical evidence. Tickets, chat summaries, critiques, mockups, branches, and implementation details cannot create product authority. `PROJECT_STATE.md` reports current state but cannot create or change product, design, security, architecture, or delivery requirements.

When sources conflict, stop the affected work. Reconcile the controlling sources through the plan-change process before creating or implementing dependent tickets.

## Locked by default

The plan, including the design, is read-only unless the Product Owner explicitly directs **`update plan`** for the proposed change. Requests to build, fix, critique, explore, create a ticket, or implement a recommendation do not authorize a plan change.

The design lock covers `PRODUCT_DECISIONS.md`, `PRD.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, approved design specifications, and the design consequences of accepted ADRs. Correcting code to match these sources is conforming work and does not require a plan change. Changing the intended palette, typography, composition rules, interaction behavior, responsive behavior, accessibility contract, route, state, or product copy does.

No ticket, pull request, critique, prototype, screenshot, or implementation may silently supersede the plan. Discovery is evidence until an authorized plan amendment promotes it.

## Authorized plan-change process

An amendment is valid only when all of these are true:

1. The Product Owner explicitly says `update plan` and identifies or clearly describes the intended change.
2. The affected controlling sources are updated together so they do not conflict.
3. `PLAN_CHANGELOG.md` receives an append-only entry containing the authorization directive, reason, evidence, changed sources, consequences, and affected tickets.
4. The amendment is reviewed as a dedicated pull request whose Plan change authorization section records `update plan`.
5. Plan-governance and ordinary repository checks pass, and the amendment is merged to `main` before dependent implementation is treated as ready.

An implementation request cannot retroactively authorize a plan change. If the intended implementation conflicts with the current plan, stop and request the exact `update plan` direction.

## Decision discipline

- Put each current product, scope, provider, policy, release, or design requirement in its one owning PRD/specialist section under README.md. Record the reason and authorization history in `PRODUCT_DECISIONS.md` and `PLAN_CHANGELOG.md`, with links to the current rule; the history is not a competing requirement source. Update affected references together without copying the rule into every document.
- Architecture decisions belong in a new or superseding ADR and every affected controlling contract.
- Tickets and pull requests may apply an approved decision; they may not become the only record of one.
- A critique finding may show that implementation violates the plan. If it proposes different intended behavior, it remains a proposal until the plan is explicitly updated.
- Status and evidence updates belong in `PROJECT_STATE.md` and dated evidence ledgers; they must not rewrite the requirement.

## Ticket admission contract

Every implementation ticket contains five short sections:

1. **Problem** — current evidence and the user or operational harm.
2. **Plan** — link the PRD overview and connected journey, the exact capability and relevant specialist headings, or the merged amendment; include dependencies and non-goals only when they matter.
3. **Outcome** — one independently closable result and its place in that connected experience.
4. **Acceptance** — one to five observable criteria needed to prove that result.
5. **Verification** — the smallest executable checks that prove those criteria, including the affected transition to adjacent steps; milestone-level walkthroughs separately prove the joined experience.

An implementation ticket must be closable with repository-controlled work and evidence. Human participation, provider approval, legal review, spending, production configuration, promotion, research cohorts, and public activation belong in a separate dependent gate issue. A broader feature may use a parent issue as a map, but each implementation child still owns one result. Split an untouched oversized issue before work starts; do not churn an active reviewed pull request solely to match the newer format.

A ticket is invalid when it contradicts the plan, relies on an unmerged plan proposal, lacks a controlling plan citation, addresses only a symptom, cannot prove its criteria, or mixes implementation with an external gate. An authorized plan-amendment ticket may exist before its amendment merges, but it authorizes only that plan pull request. Invalid tickets must not carry `ready-for-agent` or `task`.

## Ticket-to-closure traceability

The implementation and review must preserve this chain:

`ticket reason -> controlling plan requirement -> scoped change -> mapped acceptance check -> commit/PR evidence -> closure evidence`

Before implementation, verify the ticket against current `main`, not a stale branch. Before merge, verify the diff still matches the problem, outcome, and cited requirement. Passing tests cannot excuse plan divergence.

An implementation ticket is complete when its repository outcome is merged, every acceptance criterion has evidence, applicable local and required hosted checks pass, and required review has no unresolved finding. `Closes #N` performs closure at merge. A later discovered failure reopens the issue; routine post-merge repetition of already-passing checks is not required.

External gate issues close only when their named real-world evidence exists. An open external gate blocks activation, not implementation that is safely staged off. Never describe an implementation ticket as blocked merely because its dependent external gate remains open.

Review and verification are proportional to risk. Documentation-only changes need relevant document/contract checks. Application changes need focused tests and repository build checks. UI changes add targeted browser/accessibility proof. Database, authorization, security, payment, or deployment changes add their boundary-specific checks. Independent review is required for plan amendments and for code affecting security, privacy, authorization, money, migrations, destructive lifecycle behavior, or release activation; other tickets use the repository's normal pull-request review. Pin review to the source candidate SHA. A later evidence-only commit preserves that source review after a focused evidence-delta check; any executable, requirement, configuration, fixture, or migration change invalidates the affected review and checks.

## Enforcement

- `.github/ISSUE_TEMPLATE/plan-governed-ticket.yml` is the required implementation-ticket intake form; blank issues are disabled.
- `scripts/plan-governance-contract.mjs` validates ticket and pull-request bodies.
- `.github/workflows/issue-plan-governance.yml` marks malformed tickets `plan-invalid` and removes implementation-ready labels.
- `.github/workflows/pr-plan-governance.yml` rejects pull requests without ticket/plan traceability and rejects protected-plan changes without an `update plan` authorization receipt plus an append-only changelog entry.
- `main` branch protection must require pull requests, `web`, `database`, and `plan-governance` checks. Repository files cannot prove that hosted protection is enabled; verify it in GitHub after changing the rule.

## Plan and implementation verification

Before implementation starts, its ticket must cite the current contract and own one repository-controlled outcome. It closes when a clean checkout proves its mapped acceptance criteria with the applicable source, migration, allow/deny, UI, accessibility, failure, rollback, and security/privacy checks. External evidence and authorization close in separate gate issues. AI output is never a substitute for a failed executable check or required human gate.

Boundary-specific security verification is defined in [SECURITY_AND_TRUST.md](SECURITY_AND_TRUST.md#required-pre-launch-testing).

The plan itself is accepted only when a fresh seven-lens review of the current full manifest finds no material P1/P2 contradiction, omission, untestable gate, privacy/security defect, design reproducibility defect, or unauthorized scope path. A numerical score is reported only with that finding set; the document cannot self-award 100.

Plan amendments must verify manifest coverage, local file/heading references, JSON parsing, diff whitespace, and absence of stale policy language before final review. An archival flow lab may establish concept provenance but cannot prove current interaction, visual, or package acceptance; parsing source alone is insufficient. For application browser acceptance, try the Codex in-app browser first and record any isolation failure before using the available Playwright browser against the running build at phone and desktop widths. The artifact must exist before claiming its check passed.

Engineering owns implementation/automated proof, Security owns authorization/privacy review, Design owns interaction/visual/accessibility acceptance, and Operations owns deployment/recovery evidence for their named scope; human approval requirements remain human and cannot be replaced by agents. Package identifiers describe capability boundaries and actual prerequisites, not a blanket lock across unrelated ready work.

## Proportional checks

| Change | Required proof |
| --- | --- |
| Documentation or workflow | Relevant contract tests and `git diff --check` |
| TypeScript or application behavior | Focused tests, typecheck, lint, format, and build |
| UI behavior or layout | Application checks plus the targeted browser and ticket-named accessibility states |
| SQL, RLS, RPC, Edge authorization, security, payment, or destructive lifecycle | Focused allow/deny tests, clean database test environment, and applicable security checks |
| Provider or production activation | Only the ticket-named provider/production checks, with authorized credentials and real receipts |

A missing required environment is `UNAVAILABLE`, not `PASS`. Do not run unrelated suites to create the appearance of evidence.

## Applying the implementation workflow

Before claiming an implementation issue, verify that it is open, passes the ticket validator, has merged/closed dependencies with evidence, and has no active PR or branch already owning the outcome. Refresh main, live issues/PRs, and matching branches; inspect actual shared files before treating work as parallel. Use a clean isolated worktree and `codex/issue-N-short-name`; when publication is authorized, push ownership promptly so another agent can see it.

Map every acceptance criterion to executable proof, inspect the complete diff, and stage/commit only task-owned files. For an authorized delivery, use `Closes #N` in the PR, resolve findings, pass required hosted checks, and merge only the reviewed source candidate and evidence. A failed accepted result reopens its issue. External activation remains limited to its separately authorized gate and evidence.
