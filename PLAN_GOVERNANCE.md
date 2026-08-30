# Antique Trail Plan Governance

Status: locked governance contract. Effective 2026-08-30.

## One source of truth

The plan is the controlling document set listed in `PLANNING_INDEX.md`; it is not a ticket, chat summary, critique, mockup, branch, or implementation detail. `README.md` defines precedence inside that set. `PROJECT_STATE.md` reports current state but cannot create or change product, design, security, architecture, or delivery requirements.

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

- Product, scope, provider, policy, release, or design decisions belong in `PRODUCT_DECISIONS.md` and every affected controlling contract.
- Architecture decisions belong in a new or superseding ADR and every affected controlling contract.
- Tickets and pull requests may apply an approved decision; they may not become the only record of one.
- A critique finding may show that implementation violates the plan. If it proposes different intended behavior, it remains a proposal until the plan is explicitly updated.
- Status and evidence updates belong in `PROJECT_STATE.md` and dated evidence ledgers; they must not rewrite the requirement.

## Ticket admission contract

Every ticket must contain:

1. **Reason for ticket** — the user, operational, security, quality, or conformance problem that justifies the work.
2. **Current evidence** — reproducible evidence of the problem or the explicitly bounded discovery task.
3. **Plan requirements** — exact controlling file and heading references. Historical evidence alone is insufficient.
4. **Plan conformance** — a gap against the existing plan, an authorized plan-amendment ticket carrying the Product Owner's `update plan` directive, or a reference to an authorized plan amendment already merged to `main`.
5. **What must change** — a narrow, end-to-end outcome that addresses the stated reason.
6. **Acceptance criteria** — observable criteria mapped to the cited plan requirements, including required roles, states, responsive/accessibility behavior, authorization, and failure handling.
7. **Verification** — executable checks and required evidence.
8. **Dependencies and non-goals** — prerequisites and explicit scope boundaries.

A dependent implementation ticket is invalid when it contradicts the plan, relies on an unmerged plan proposal, lacks a controlling plan citation, addresses only a symptom while leaving the stated reason unresolved, or cannot prove its acceptance criteria. An authorized plan-amendment ticket may exist before its amendment merges, but it authorizes only the plan pull request; dependent implementation remains blocked. Invalid tickets must not carry `ready-for-agent` or `task`.

## Ticket-to-closure traceability

The implementation and review must preserve this chain:

`ticket reason -> controlling plan requirement -> scoped change -> mapped acceptance check -> commit/PR evidence -> closure evidence`

Before implementation, verify the ticket against current `main`, not a stale branch. Before merge, verify the diff still matches both the ticket reason and every cited requirement. Before closure, record evidence for each acceptance criterion and confirm that no controlling requirement was weakened or silently changed.

Passing tests cannot excuse plan divergence. A ticket is complete only when its reason is addressed, its mapped plan requirements are satisfied, required checks pass, and the evidence is tied to the accepted commit.

## Enforcement

- `.github/ISSUE_TEMPLATE/plan-governed-ticket.yml` is the required ticket intake form; blank issues are disabled.
- `scripts/plan-governance-contract.mjs` validates ticket and pull-request bodies.
- `.github/workflows/issue-plan-governance.yml` marks malformed tickets `plan-invalid` and removes implementation-ready labels.
- `.github/workflows/pr-plan-governance.yml` rejects pull requests without ticket/plan traceability and rejects protected-plan changes without an `update plan` authorization receipt plus an append-only changelog entry.
- `main` branch protection must require pull requests, `web`, `database`, and `plan-governance` checks. Repository files cannot prove that hosted protection is enabled; verify it in GitHub after changing the rule.
