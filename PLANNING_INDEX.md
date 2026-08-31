# Antique Trail Planning and Evidence Index

Status: current document-role map as of 2026-08-30. When documents conflict, use the source precedence in `README.md` and stop dependent work until the controlling documents are reconciled.

## Root Markdown inventory

| File                        | Classification                                                  |
| --------------------------- | --------------------------------------------------------------- |
| `README.md`                 | Orientation and source-precedence map                           |
| `PLAN_GOVERNANCE.md`        | Locked-plan, decision, amendment, and ticket-admission contract |
| `PLAN_CHANGELOG.md`         | Append-only authorized plan-amendment ledger                    |
| `PROJECT_STATE.md`          | Current-state index                                             |
| `PLANNING_INDEX.md`         | Document-role and maintenance map                               |
| `CODEX_START_PROMPT.md`     | Current execution authority and stop conditions                 |
| `PRODUCT_DECISIONS.md`      | Controlling product policy                                      |
| `PRD.md`                    | Controlling product requirements                                |
| `PRODUCT.md`                | Concise supporting product register                             |
| `DESIGN.md`                 | Controlling interaction contract                                |
| `DESIGN_SYSTEM.md`          | Controlling visual/component/screen contract                    |
| `SECURITY_AND_TRUST.md`     | Controlling security, privacy, and operations policy            |
| `IMPLEMENTATION_PLAN.md`    | Original roadmap plus Package 1 contract                        |
| `PACKAGE_CONTRACTS.md`      | Packages 2-13 execution contracts                               |
| `PLAN_ACCEPTANCE.md`        | Dependency/acceptance index and historical plan-quality receipt |
| `PHASE_0_REVIEW.md`         | Historical 2026-07-30/31 review snapshot                        |
| `DEEP_SPEC_REVIEW.md`       | Historical 2026-08-16 spec-gap snapshot                         |
| `ROLE_BASED_SITE_REVIEW.md` | Historical 2026-08-18 role review snapshot                      |
| `REVIEW_VERDICTS.md`        | Append-only dated verification ledger                           |
| `PLAN.md`                   | Historical 2026-08-24 ticket-execution plan                     |
| `GATES.md`                  | Historical Issue #122 gate ledger                               |
| `PLAN_TICKET_SEQUENCE.md`   | Historical 2026-08-29 ordered ticket ledger                     |
| `OPENCODE_TICKET_REVIEW_TODO.md` | Current OpenCode-to-Codex independent review queue             |
| `CONTEXT.md`                | Historical discovery context, non-normative                     |
| `USER_RESEARCH.md`          | Research evidence, non-normative                                |
| `COMPETITIVE_LANDSCAPE.md`  | Research evidence, non-normative                                |
| `SEED_STORE_NOTES.md`       | Synthetic fixture notes, not product or release authority       |

## Current controlling sources

| Document                 | Role                                                                              | Maintenance rule                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PLAN_GOVERNANCE.md`     | Controls plan authority, design lock, decisions, amendments, and ticket admission | Amend only after an explicit Product Owner `update plan` directive; record the amendment in `PLAN_CHANGELOG.md` |
| `PROJECT_STATE.md`       | Current implementation, backlog, decision, and release-state index                | Refresh from `main`, live GitHub, and dated gate evidence; never use it to invent product policy                |
| `PRODUCT_DECISIONS.md`   | Approved scope and policy decisions                                               | Append or amend only with Product Owner authority; keep deferred choices explicit                               |
| `PRD.md`                 | Product behavior, outcomes, MVP boundary, and acceptance requirements             | Change when intended product behavior changes, not merely when implementation status changes                    |
| `DESIGN.md`              | Canonical journeys, interaction behavior, and copy intent                         | Promote accepted interaction changes here                                                                       |
| `DESIGN_SYSTEM.md`       | Exact tokens, responsive rules, component states, and screen acceptance           | Promote stable critique lessons and verified design-system contracts here                                       |
| `SECURITY_AND_TRUST.md`  | Security, privacy, authorization, retention, and operational policy               | Keep implementation and release claims separate from required controls                                          |
| Most recent accepted ADR | Architecture decision for its named boundary                                      | A newer accepted ADR may supersede only the boundary it names                                                   |

## Delivery and acceptance contracts

| Document                              | Role                                                | Current interpretation                                                                                                     |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `IMPLEMENTATION_PLAN.md`              | Original roadmap plus normative Package 1 contract  | Roadmap sequencing is historical where packages have already shipped; package requirements remain useful unless superseded |
| `PACKAGE_CONTRACTS.md`                | Normative Packages 2-13 engineering contracts       | Contracts do not prove completion; Package 13 includes staged-off Stripe billing                                           |
| `PLAN_ACCEPTANCE.md`                  | Cross-document dependency and independent-build map | The 2026-08-03 score is a historical plan-quality receipt, not current readiness                                           |
| `docs/specs/store-membership-spec.md` | Public owner acquisition, photo-tier, and Stripe flow contract | Free-only public intake starts at 10B; paid activation remains separately gated                                  |
| `docs/specs/owner-onboarding.md`      | Detailed invited-owner onboarding interaction amendment | Pilot/invitation variant; public applicants reuse protections only through the membership contract                 |
| `docs/specs/TDD_DEVELOPMENT_PLAN.md`  | 2026-08-23 ticket-cut plan                          | Historical execution snapshot; use current issues and `PROJECT_STATE.md` for status                                        |

## Current operational sources

| Document                                            | Role                                         | Current interpretation                                                                     |
| --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md` | Human/provider release-gate ledger           | Gate contract remains current; 2026-08-23 counts are historical until refreshed row by row |
| `OPENCODE_TICKET_REVIEW_TODO.md`                   | OpenCode implementation-to-Codex review queue | Operational handoff only; `[x]` requests review and never means merged, closed, or production-approved |
| Other `docs/operations/*.md`                        | Runbooks, receipts, and readiness procedures | A template, DRAFT, SCAFFOLDED, NO-GO, or unexecuted runbook is not passing evidence        |
| GitHub issues and pull requests                     | Live work state and acceptance scope         | Refresh live; closed issue scope is not equivalent to release readiness                    |
| Hosted CI and committed evidence                    | Commit-specific verification                 | Record exact SHA/scope; synthetic harness evidence is not provider/production proof        |

## Historical snapshots and ledgers

| Document                             | Snapshot meaning                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `PHASE_0_REVIEW.md`                  | 2026-07-31 product/security/architecture review that approved the original bounded build plan   |
| `DEEP_SPEC_REVIEW.md`                | 2026-08-16 browser/spec gap snapshot; its eight named findings were later ticketed and repaired |
| `ROLE_BASED_SITE_REVIEW.md`          | 2026-08-18 role-based review-harness snapshot; not a current full-site verdict                  |
| `REVIEW_VERDICTS.md`                 | Append-only dated acceptance evidence and caveats; entries retain their original scope          |
| `PLAN.md`                            | 2026-08-24 eleven-ticket execution plan; not the current backlog                                |
| `GATES.md`                           | Issue #122 completion ledger; not the global project gate file                                  |
| `PLAN_TICKET_SEQUENCE.md`            | 2026-08-29 ordered ticket execution ledger; completed rows remain historical evidence           |
| `docs/testing/*.md` and `gates/*.md` | Per-ticket/agent review and gate evidence; never global product state                           |

Untracked `PLAN_*.md` or `gates/*.md` files in a working tree are local execution artifacts until deliberately reviewed and committed. They cannot override any controlling source.

## Research and design evidence

- `USER_RESEARCH.md`, `COMPETITIVE_LANDSCAPE.md`, `CONTEXT.md`, and `docs/research/*` provide discovery or technical research evidence; they are not current requirements unless promoted into a controlling source.
- `docs/design/*` contains approved references, placement rules, gauntlets, and concept artifacts. `DESIGN_SYSTEM.md` controls values and reusable rules; the flow lab remains concept-only.
- `docs/evidence/*` records dated, scope-bounded verification. Evidence should not be rewritten into broader claims than its own boundary permits.
- `PRODUCT.md` is a concise product register and orientation summary. `PRD.md` wins for detailed behavior.

## Where a new fact belongs

| New fact                                                       | Update                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Product Owner explicitly directs `update plan`                 | Follow `PLAN_GOVERNANCE.md`; update every affected controlling source and append `PLAN_CHANGELOG.md` before dependent implementation |
| Product Owner chooses a provider, policy, feature, or deferral | `PRODUCT_DECISIONS.md`, then the affected PRD/design/security/package contract and `PROJECT_STATE.md`                                |
| A visual critique establishes a reusable rule                  | `DESIGN_SYSTEM.md` or `DESIGN.md`, plus dated evidence                                                                               |
| Code merges or an issue changes status                         | `PROJECT_STATE.md`; preserve the original ticket/evidence ledger                                                                     |
| A human/provider/release gate passes                           | Its signed operational receipt, the G56 ledger, GitHub #56, then `PROJECT_STATE.md`                                                  |
| An old review becomes stale                                    | Add a prominent historical/superseded banner; do not erase the evidence                                                              |

Tickets never become controlling sources. Every ticket must pass the admission contract in `PLAN_GOVERNANCE.md`, cite the current controlling file and heading for each requirement, and map its reason through acceptance and closure evidence. A critique or ticket that proposes different intended behavior remains non-normative until an authorized plan amendment is merged.
