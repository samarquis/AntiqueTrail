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

## 2026-08-30 — Add prospective-store acquisition and pricing journey

- Authorization directive: `update plan`
- Product Owner direction: incorporate the approved evidence and adversarial findings for a professional QR-card-to-owner-page journey that makes eligible store owners eager and confident to claim/add their store, while closing admission, trust, payment, promotion, and usability gaps before implementation.
- Reason: the prior plan had shopper promotion and invitation onboarding but no complete public owner-acquisition page; it also placed paid Checkout before final Administrator approval and used tier names that could imply paid prominence or literal unlimited service.
- Evidence: `docs/research/store-owner-acquisition-pricing-page-2026-08-30.md`; current comparable/service evidence recorded there; Product Owner clarification that the prospective-owner card is distinct from shopper promotion and secure invitations; dated adversarial planning review and corrected activation analysis.
- Changed sources: `PRODUCT_DECISIONS.md`, `PRD.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `SECURITY_AND_TRUST.md`, `PACKAGE_CONTRACTS.md`, `docs/specs/store-membership-spec.md`, `docs/specs/owner-onboarding.md`, `PLAN_ACCEPTANCE.md`, `PRODUCT.md`, `PLANNING_INDEX.md`, and `PROJECT_STATE.md`.
- Consequences: three QR classes are explicit; Package 6 owns Synthetic existing-claim/add-store and atomic Free provisioning, Package 10A owns an isolated access-protected Synthetic research artifact plus the private page/eligible-owner evidence, and Package 10B alone enables normal public Free intake; applicants remain ordinary/nonprivileged until approval atomically creates provenance/listing/scope/Free, and both intake types deny an already-granted Representative outside the transfer flow; paid upgrades use Free/Gallery/Full Gallery, a signed inactive commercial-research config/protocol, owner-value packet, final monetization decision ratifying that exact version, fresh bound consent, Stripe-hosted Checkout, `off_prelaunch|sales_open|servicing_only`, generation-bound pause/refund reconciliation, provider-finality-bound closure with signed late-obligation servicing reopen, and a composite receipt binding 10B, RG-01, three passing community reviews, and Package 13/current provider evidence. No price or live capability is authorized now.
- Affected tickets: any current or future owner onboarding, public claim/add-store, promotion/QR, Store Portal plan/billing, photo-tier, Stripe, support, accessibility, or Package 10A/10B/13 ticket must be reconciled to this amendment before implementation-ready status; no implementation ticket is created by this planning change alone.

## 2026-09-03 — Simplify delivery governance and rebuild the backlog

- Authorization directive: `update plan`
- Product Owner direction: `update plan: simplify the PRD and supporting controlling files, remove unnecessary closure bureaucracy, separate code completion from external release gates, and rebuild the open-ticket backlog from current main.`
- Reason: healthy repository work was remaining open because duplicated ledgers, universal checks, exact-head evidence loops, and external release evidence were treated as one implementation closure boundary.
- Evidence: current `main` at `ab8cee725a7f33b0db2a4f6186657db372ec4af9`; clean `npm run check` and `npm run security:contract`; 23 open issues and six draft pull requests reviewed on 2026-09-03; Issue #168/PR #203 demonstrated implementation mixed with deployment, external participant, registration, and teardown gates; PR #206 demonstrated the smaller proportional workflow.
- Changed sources: `PLAN_GOVERNANCE.md`, `README.md`, `PLANNING_INDEX.md`, `CODEX_START_PROMPT.md`, `PRODUCT_DECISIONS.md`, `PRD.md`, `PACKAGE_CONTRACTS.md`, `PLAN_ACCEPTANCE.md`, `PROJECT_STATE.md`, `OPEN_TICKET_TODO.md`, `docs/agents/issue-tracker.md`, repository issue/PR templates, and plan-governance validation/tests.
- Consequences: GitHub alone owns live backlog state; implementation tickets own one repository-controlled outcome and at most five acceptance criteria; external evidence moves to separate gate issues; checks and independent review are risk-proportional; evidence-only commits do not invalidate accepted source review; issue closure follows the merging `Closes #N` pull request and later disproved acceptance causes reopening.
- Affected tickets: #56, #117, #123, #124, #126, #130, #131, #135, #168–#173, #176–#182, #187, #205, and #207 must be re-triaged against current `main` after this amendment merges; active implementation pull requests retain valid work and are narrowed at closure rather than churned solely for format.

## 2026-09-05 — Permit safeguarded existing-subscription upgrades

- Authorization directive: `update plan`
- Product Owner direction: `update plan as proposed`, approving the paid-ticket unblock proposal presented in this task: permit Gallery-to-Full-Gallery upgrades with fresh consent and compensate paused in-flight changes without cancelling the pre-existing subscription; retain initial Free-only Checkout and every production activation gate.
- Reason: the global Free-store upgrade predicate conflicted with the approved immediate prorated mid-cycle upgrade requirement and prevented #178 implementation.
- Evidence: current main `e0d97c3710b117267ac53c07cd87898908ee6452`; SECURITY_AND_TRUST.md Public store-owner acquisition and paid-consent security; PRODUCT_DECISIONS.md Mid-cycle tier changes; Package 13 Commands and consent; live #178 blocker comment. The #179/#180 resume/composite circular dependency was separately removed by reallocating ticket ownership without changing product requirements.
- Changed sources: SECURITY_AND_TRUST.md, PACKAGE_CONTRACTS.md, PRODUCT_DECISIONS.md, docs/specs/store-membership-spec.md, PRD.md, DESIGN.md, PROJECT_STATE.md, and this append-only PLAN_CHANGELOG.md.
- Consequences: initial purchase remains Free-only hosted Checkout; existing Gallery subscriptions can upgrade with exact-scope/MFA/recent-auth, immutable source-version/config/generation-bound consent, server-derived proration, one subscription/invoice stream, and verified-event-only application. Pause requires idempotent compensation of the attempted modification and incremental charge while preserving prior valid entitlement and later valid lifecycle events; unknown compensation blocks finality. Mandatory compensation is not limited by the voluntary 48-hour refund window. Required tests now distinguish initial-purchase cancellation from existing-subscription compensation. No provider call, spending, distribution, or live activation is authorized.
- Affected tickets: #178 owns paid-change servicing and compensation; #179 owns pause/close/reopen and unresolved-obligation denial; #180 owns composite promotion/resume and cross-ticket stage/concurrency proof. Archived #181 supplies no live acceptance evidence.
