# Antique Trail Plan Changelog

Append-only record of authorized changes to the controlling plan. Status-only updates to `PROJECT_STATE.md` do not belong here unless they also change a controlling requirement.

## 2026-08-30 — Lock plan and ticket governance

- Authorization directive: `update plan`
- Product Owner direction: design may change only when the Product Owner specifically says to update the plan; the plan must drive every ticket and decision; every ticket must address its reason and be checked against plan requirements.
- Reason: the reconciled documents need a durable control that prevents tickets, critiques, and implementation from silently changing intended product or design behavior.
- Evidence: planning reconciliation merged in PR #160; the prior source-precedence map did not require an authorization phrase, an amendment receipt, or machine-checked ticket traceability.
- Changed sources: `PLAN_GOVERNANCE.md`, `PLAN_CHANGELOG.md`, `README.md`, `PLANNING_INDEX.md`, `CODEX_START_PROMPT.md`, `docs/agents/issue-tracker.md`, repository issue/PR templates, validation script/tests, and governance workflows.
- Consequences: the plan and design are locked by default; an explicit `update plan` direction and merged amendment precede divergent implementation; tickets and pull requests must cite current plan requirements and carry acceptance evidence.
- Affected tickets: all tickets created or edited after this governance contract reaches `main`; existing tickets must pass the same admission contract before receiving or retaining an implementation-ready label.
