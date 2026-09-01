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

## 2026-09-01 — Register current operational ledgers and generalize the review-handoff roles

- Authorization directive: `update plan`
- Product Owner direction: register `OPEN_TICKET_TODO.md` and `OPENCODE_TICKET_REVIEW_TODO.md` as current operational sources so current record-keeping is discoverable, and express the implementation/review handoff in agent-system-neutral terms so any agent system may implement and a different system performs the independent review.
- Reason: `PLANNING_INDEX.md` did not register the current ordered execution ledger or the review handoff queue, leaving current shared operational ledgers undiscoverable. The review queue also named two specific systems, which could mislead a different agent system about who may implement and who may review.
- Evidence: the Product Owner issued `update plan` during Issue #182 review correction (2026-09-01); the queue/ledger rows were corrected from invalid `[!]` external-blocker marks to plain scheduling states; the review queue and one-ticket protocol now state the different-system review rule; the `codex/issue-N-*` branch name is documented as a shared convention with a prefix-agnostic collision scan.
- Changed sources: `PLANNING_INDEX.md`, `PLAN_CHANGELOG.md`, `OPEN_TICKET_TODO.md`, `OPENCODE_TICKET_REVIEW_TODO.md`.
- Consequences: current ledgers are registered and discoverable; any agent system may implement a ticket and must hand off to a different system (or a fully separate agent session) for independent review; the `[R]`/`[A]`/`[F]`/`[!]` verdict marks remain reserved for the independent reviewer. No product, design, security, or release requirement changes.
- Affected tickets: Issue #182 (this registration and role generalization); all future implementation tickets inherit the different-system review rule and the registered ledger locations.
