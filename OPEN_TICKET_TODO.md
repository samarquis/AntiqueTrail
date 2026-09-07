# Ticket Workflow

GitHub owns live issue and pull-request state. [PLAN_GOVERNANCE.md](PLAN_GOVERNANCE.md) owns admission, dependencies, review, proportional verification, and closure; [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) explains applying the workflow.

Before selecting work, refresh main and live issue/PR/branch state, check duplicate ownership and dependencies, and read the [PRD overview](PRD.md#purpose-people-and-product-promise), connected journey, and cited capability/specialist rules. Keep one independently closable outcome and the five-section ticket format, including affected journey transitions.

Use isolated worktrees for independent work. Serialize actual shared source/schema/fixture/evidence seams, not unrelated capability work. Preserve unrelated files and stage only task-owned changes. Finish the applicable checks, required independent review, and hosted checks before authorized merge and confirmed closure; no environment or failed check can be reported as passing.

Keep external evidence and activation in their separate gate outcomes. Follow the owner's current scope and review checkpoint before publishing or implementing.
