# Antique Trail Planning and Evidence Index

Document classification for the store-first system adopted through the 2026-09-11 amendment. [README source precedence](README.md#source-precedence) owns the responsibility table; [PLAN_CHANGELOG.md](PLAN_CHANGELOG.md) records change and closure history; the store-first amendment (2026-09-11) and its bounded successors govern current scope.

## Current requirements

- [PRD.md](PRD.md): short store-first purpose, offered scope, showcase/pilot acceptance and stage progression.
- [Product capability reference](docs/specs/product-capabilities.md): detailed current and deferred behavior delegated by the PRD. Stage profiles in old decisions/roadmaps are historical, not a competing queue.
- [DESIGN.md](DESIGN.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [SECURITY_AND_TRUST.md](SECURITY_AND_TRUST.md), [PACKAGE_CONTRACTS.md](PACKAGE_CONTRACTS.md): linked specialist detail; Package 1 technical requirements now live with the other capability contracts.
- [Store membership](docs/specs/store-membership-spec.md), [invited-owner onboarding](docs/specs/owner-onboarding.md), and approved [design references](docs/design/README.md): detail for explicitly delegated boundaries.
- [Accepted ADRs](docs/adr/): architecture constraints; ADR0009 narrowly scopes the store-first stages; [ADR0010](docs/adr/0010-free-public-test-publication.md) owns the named free public-test provider exception. ADR0007/0008 retain only their original assessment scope and provide no replacement test authority.
- [Operational runbooks](docs/operations/): executable procedures and named gate criteria under the applicable security/architecture contract; inspect each artifact's date, scope, and status.

## Navigation and workflow

- README.md, CODEX_START_PROMPT.md, repository agent guides: entry instructions and links, not extra product policies.
- PLAN_CHANGELOG.md: append-only amendment history and closure receipts.
- Repository issue/PR templates and the append-only changelog: the ticket-to-closure workflow; no live backlog copies. The former `OPEN_TICKET_TODO.md` and `docs/agents/issue-tracker.md` are archived history.
- PLAN_ACCEPTANCE.md: linked capability navigation and historical acceptance receipts.
- PRODUCT.md: compatibility link to the PRD.
- manifest.json: handoff file inventory and reading order, not the PWA manifest.

## Facts and evidence

- PROJECT_STATE.md: dated implementation and environment facts with scoped evidence; GitHub is authoritative for live issues and PRs.
- PRODUCT_DECISIONS.md: preserved decisions and reasons, linked to current requirements; PLAN_CHANGELOG.md: append-only amendment history.
- IMPLEMENTATION_PLAN.md: historical phase/package roadmap, with links to migrated requirements.
- PHASE_0_REVIEW.md, DEEP_SPEC_REVIEW.md, ROLE_BASED_SITE_REVIEW.md, REVIEW_VERDICTS.md: dated reviews, not current whole-product acceptance.
- Removed corpus files (PLAN.md, PLAN_TICKET_SEQUENCE.md, GATES.md, OPENCODE_TICKET_REVIEW_TODO.md, PLAN_GOVERNANCE.md, CONTEXT.md, AGENTS.md, ADRs 0001–0004, gates/, docs/agents/, and obsolete research documents): archived by the 2026-09-14 corpus slimming; do not recreate as live authority.
- Issue #56 closure and its former `docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md` (archived): historical row states; surviving gate procedures live in [DEPLOYMENT_READINESS_CHECKLIST.md](docs/operations/DEPLOYMENT_READINESS_CHECKLIST.md) and the release runbooks, and issue #56's closure does not waive surviving requirements.
- USER_RESEARCH.md, COMPETITIVE_LANDSCAPE.md, SEED_STORE_NOTES.md, docs/research/, docs/testing/, and docs/evidence/: discovery, synthetic notes, or dated evidence at their stated scope.
- docs/design/antique-trail-flow-lab.html: archival concept evidence, not product implementation or acceptance.

Untracked local artifacts do not become published authority by appearing in a checkout. Promote intended changes only through the authorized amendment; preserve original findings and label supersession instead of rewriting old evidence as current fact.
