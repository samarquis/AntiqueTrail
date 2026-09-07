# Antique Trail Agent Guide

This guide applies to the repository; a more specific AGENTS.md applies only to its subtree.

## Start here

1. Read PLAN_GOVERNANCE.md for authority, amendment, review, and closure rules.
2. Read the PRD.md product overview, connected shopper experience, and next milestone to understand the whole intended experience.
3. Use README.md for requirement ownership, PROJECT_STATE.md for dated facts, and PLANNING_INDEX.md to find the relevant specialist sources.
4. Read the exact capability and specialist headings needed for the requested work, including only the applicable ADRs.
5. Use CODEX_START_PROMPT.md and docs/agents/issue-tracker.md for execution guidance; GitHub owns live work status, and OPEN_TICKET_TODO.md is a workflow pointer.

## Working rules

- Follow the user's authorized scope; a documentation amendment does not start application implementation or external activation.
- Preserve unrelated local work and stage only task-owned files.
- Refresh main and live GitHub state before relying on dated indexes or claims.
- Change protected intent only under PLAN_GOVERNANCE.md; keep one current owner for each requirement and link to it from other documents.
- Connect a small task to the PRD journey and verify the affected transition as well as its own outcome.
- Keep local, synthetic, hosted-CI, provider, production, and human evidence distinct; report unavailable evidence plainly.
- Use forward-only database migrations and server-boundary authorization when database work is authorized.

## References and history

docs/agents/domain.md routes domain vocabulary; CONTEXT.md is historical. OPENCODE_TICKET_REVIEW_TODO.md covers exact-SHA review handoffs. GATES.md, gates/, and docs/evidence/ contain scope-bound evidence, not global project status. Generated .planning/handoffs/ and historical decisions/roadmaps provide context, never independent product authority. Files under .github/skills/ are tooling references, not Antique Trail product requirements.
