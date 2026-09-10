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

## 2026-09-05 — Scheduled downgrades with uninterrupted self-service cancellation

- Authorization directive: `update plan`
- Product Owner direction: `update plan`, supplied in this task after the explanation of same-subscription scheduled downgrades and authenticated application cancellation when Stripe portal cancellation is unavailable.
- Reason: the literal subscription-update API clause does not define provider-controlled future phase transitions, and Stripe portal cancellation is unavailable while a scheduled update is attached.
- Evidence: base `5b03ff79328ae07a2b3586b1e4ea549fb87463f9`; Stripe Subscription Schedules and Customer Portal limitations; independent issue-178 readiness review.
- Changed sources: PRODUCT_DECISIONS.md, PACKAGE_CONTRACTS.md, SECURITY_AND_TRUST.md, DESIGN.md, PRD.md, docs/specs/store-membership-spec.md, PROJECT_STATE.md, PLAN_CHANGELOG.md.
- Consequences: same-subscription scheduled downgrades, uninterrupted authenticated self-service cancellation, reconciliation of current/future schedule state, and explicit race/replay acceptance; no change to prices, tier capacities, refund windows, or activation authority.
- Affected tickets: #178 servicing and schedule reconciliation; #179 pending-obligation/closure integration; #180 composite activation and cross-ticket proof.

## 2026-09-06 — Protected owner-only synthetic review deployment

- Authorization directive: `update plan`
- Proposed exact directive: `update plan: authorize the protected internal synthetic review deployment described in DEPLOYMENT_DECISION.md, with no paid resources or public activation.`
- Actual Product Owner confirmation: `yes approved and authorized`, approving that specific proposal in this task; the proposed directive was not typed verbatim by the owner.
- Reason: the owner requires current-source publication and live verification before workflow review; the existing release-only CI/H-01 contract did not define a bounded internal assessment path.
- Evidence: main408f4ae; PR224 repaired actual Vercel Build Output validation and SPA routing; local configured artifact4cb98d69b67072c286218645de8ac5ba30c7f3ca66672464fa290a1f3a996323 is preparation only; hosted backend history conflicts and six accounts require isolation.
- Changed sources: ADR0007, ADR0006, PRODUCT_DECISIONS.md, PRD.md, SECURITY_AND_TRUST.md, PLAN_ACCEPTANCE.md, PACKAGE_CONTRACTS.md, IMPLEMENTATION_PLAN.md, CODEX_START_PROMPT.md, PLANNING_INDEX.md, H01_VERCEL_RELEASE_RUNBOOK.md and this append-only ledger.
- Consequences: a reviewed local prebuilt artifact may be used only after merge and all ADR0007 prerequisites; provider eligibility, zero-spend, isolated synthetic data, every-host protection, truthful receipts and teardown remain required. Existing data and gate validators remain untouched. No H-01/public/paid/security/human acceptance, provider eligibility or deployment success is created by the amendment.
- Affected ticket: #225 owns this amendment only; deployment and review retain their separate evidence obligations.
- Approval-source reconciliation: `docs/research/product-reset-2026-09-06/DEPLOYMENT_DECISION.md` now records the later actual confirmation and is preserved with this amendment as nonnormative authorization evidence.

## 2026-09-06 — Governed internal synthetic assessment admission

- Authorization directive: `update plan`
- Actual Product Owner confirmation: `approved`, answering the scoped `update plan` proposal in INTERNAL_REVIEW_UNBLOCK_PROPOSAL.md; the owner did not type the proposed directive verbatim.
- Reason: protected source1549c6f is published, but the isolated backend has no gateway role membership or legitimate internal admission context; publication alone cannot enable the requested hosted workflow review.
- Changed sources: ADR0008, ADR0007, PRODUCT_DECISIONS.md, PRD.md, SECURITY_AND_TRUST.md, PLAN_ACCEPTANCE.md, PACKAGE_CONTRACTS.md, IMPLEMENTATION_PLAN.md, CODEX_START_PROMPT.md, PLANNING_INDEX.md; approved proposal preserved as evidence.
- Consequences: define a distinct validated internal record, seven allowlisted synthetic aliases and manifest-owned fixtures, isolated-project/candidate/origin binding, at most24-hour expiry, revocation and cleanup. Preserve server scope/MFA/session/private-data controls, original gate meanings, free-resource eligibility and all external/provider/payment exclusions. No gate receipt is forged or declared passed.
- Affected ticket: #227 is the dedicated amendment; conforming gateway/admission implementation follows merge with separate independent checks and hosted acceptance evidence.

## 2026-09-07 — Consolidated product plan and Free private evaluation

- Authorization directive: `update plan`
- Exact Product Owner direction: `update plan as proposed, and show me the changes before publishing`.
- Approved scope: the revised document structure proposal plus Amendment A's previously recorded owner decisions; replacement hosted-test authority in Amendment B remains excluded.
- Reason: duplicated authority across product, decision, roadmap, acceptance, and agent-entry documents made the full experience hard to understand and changes difficult to reconcile.
- Evidence: baseline main `63a47ac499c0b52e6af7c0601e5b627c26fa08f0`; docs/research/product-reset-2026-09-06/OWNER_DECISION_WORKSHEET.md and PLAN_RECONCILIATION_PROPOSAL.md, including the migration receipt. Worksheet D1-D11 identifiers remain local discussion labels.
- Changed sources: CODEX_START_PROMPT.md, DESIGN.md, DESIGN_SYSTEM.md, IMPLEMENTATION_PLAN.md, OPEN_TICKET_TODO.md, PACKAGE_CONTRACTS.md, PLANNING_INDEX.md, PLAN_ACCEPTANCE.md, PLAN_GOVERNANCE.md, PRD.md, PRODUCT.md, PRODUCT_DECISIONS.md, PROJECT_STATE.md, README.md, SECURITY_AND_TRUST.md, docs/agents/issue-tracker.md, docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md, docs/research/product-reset-2026-09-06/OWNER_DECISION_WORKSHEET.md, docs/research/product-reset-2026-09-06/PLAN_RECONCILIATION_PROPOSAL.md, docs/specs/owner-onboarding.md, docs/specs/store-membership-spec.md, manifest.json, PLAN_CHANGELOG.md.
- Consequences: PRD is the main product reading path; specialist sources own exact detail; decision/roadmap/acceptance history no longer creates competing current requirements. Incorporate the Free private evaluation, connected shopper priority, separate persona/software/human evidence, computer-then-phone order, permitted synthetic content, no-new-spending direction, working-name/full-rename requirement, existing photo-tier revenue boundary, and deferred appearance judgment. Preserve all later human/security/provider/release/commercial obligations and exact architecture exceptions.
- Review checkpoint: local documents and verification only until the owner reviews the changes; no publication, issue edits, implementation, environment creation, spending, or activation is authorized here. Dedicated PR, required independent review, checks, and merge remain necessary before dependent implementation.
- Affected ticket: existing #235 describes the earlier Amendment A scope; its body will require reconciliation with this consolidation only after publication is authorized. No ticket is changed or closed by this local draft. Preserve the separate PROJECT_STATE work in PR #211 and refresh overlap before publication.

## 2026-09-07 — Adopt and publish the consolidated PRD system

- Authorization directive: `update plan`
- Prior amendment authority: `update plan as proposed, and show me the changes before publishing`.
- Publication/adoption authority after owner review: `ok publish and make this the new system`, narrowed and reaffirmed by `yes do that only update and publish the new prd and it new system`.
- Scope: publish and merge the reviewed PRD/document-ownership amendment only; replace temporary local-review instructions with durable system guidance and add the repository AGENTS.md entry point. No implementation-ticket workflow, issue mutation, application work, deployment, spending, or provider activation is included.
- Changed sources for this adoption delta: AGENTS.md, CODEX_START_PROMPT.md, PRD.md, PLANNING_INDEX.md, PROJECT_STATE.md, manifest.json, this changelog, and the existing proposal's publication/review record.
- Evidence: reviewed local source `53ed4c6715612de7d22286f1146758f75207409e`, evidence-only successor `44f216eae11bd21b3b759939c9e1856557ebc985`, and the owner's subsequent adoption instruction. Fresh publication review and required hosted checks must pass before merge.
- Consequences: PRD is the product entry point; README assigns specialist ownership; current requirements remain locked under existing amendment governance. Historical decisions, roadmaps, and review receipts retain their original scope. The recorded typography interpretation remains a bounded unresolved question for dependent design work, not an authorization to change visual values.
- Tracking: PR references existing amendment issue #235 for provenance only; this publication does not change or close it and does not modify the separate PR #211.

## 2026-09-07 — Reconcile publication-review document references

- Authorization directive: `update plan`; scope remains the approved consolidation and documentation-only publication above.
- Evidence: fresh independent publication review of `23fbc434a9633f6904ae6bfa390e81fb4801ba5d` found a stale design authority entry and inherited onboarding copy that described email MFA despite Package 2 requiring an authenticator app.
- Changed sources: docs/design/README.md now points to current README ownership; docs/specs/owner-onboarding.md aligns its guided MFA wording with the existing authentication contract; the proposal records the findings.
- Consequences: no new authentication method, visual values, or implementation is authorized; both corrections make linked documentation consistent with its existing controlling requirements. Issue #235 remains a provenance reference only.


## 2026-09-07 — Preserve remaining requirements and bound inherited conflicts

- Authorization directive: `update plan`; these corrections remain within the approved consolidation and documentation-only publication.
- Evidence: the fresh seven-lens publication review identified lost live ownership for the Topeka pilot boundary and controlled SLM-01 protocol, remaining historical-owner links, ambiguous orphan-account terminology, and an inherited social-admission predicate that conflicts with required metadata purge.
- Changed sources: PRD.md, USER_RESEARCH.md, PLAN_ACCEPTANCE.md, SECURITY_AND_TRUST.md, PACKAGE_CONTRACTS.md, docs/specs/owner-onboarding.md, docs/specs/store-membership-spec.md, docs/adr/0002-qr-partner-invitations-start-onboarding-not-authorization.md, docs/design/README.md, and the proposal review record.
- Consequences: preserve the exact pilot area and comparison protocol under the PRD; route current links to current owners; clarify admitted accounts versus provider-only orphans without granting access or changing the ADR boundary. The inconsistent social-admission predicate is explicitly non-executable pending a separate scoped reconciliation under the existing conflict rule; no replacement auth design or longer retention is approved. Historical identity exploration remains evidence.
- Affected work: dependent social-admission work remains blocked on that named reconciliation; this publication does not implement, enable, change, or close any issue or feature, including #235.

## 2026-09-09 — Full-width desktop Store Details composition

- Authorization directive: `update plan`
- Exact Product Owner instruction: `update plan for this full-width store layout.`
- Reason: the owner found the 720px desktop Store Details composition cramped and requested Apple-like page components and scrolling, explicitly retaining existing colors and fonts. The approved proposal uses the available desktop canvas for photographs and sections while bounding prose and tables locally.
- Changed sources: DESIGN.md — Store Details scroll sequence; DESIGN_SYSTEM.md — Space, shape, and elevation, Component contract, Responsive layout contract, and Full-width Store Details; PRODUCT_DECISIONS.md — Full-width desktop Store Details — 2026-09-09; this append-only receipt. README requirement ownership, PRD capability/journey scope, and the separate Store photo gallery page direction remain consistent and unchanged.
- Evidence: main baseline `fd8382f9adbe7bbd85c37b1a07a368cc9db490a2`; the owner-reviewed 2026-09-09 local full-width concept using existing synthetic Blue Finch imagery and existing fonts/colors; source inspection of the previous `.store-detail` and article `max-width: 45rem` rules; Apple homepage composition observed on 2026-09-09. Local concept checks showed full-width desktop imagery, narrow reflow without horizontal product overflow, section jumps, photo keyboard navigation, Escape close, and focus return. These are concept observations, not implementation, backend, full accessibility, or human usability acceptance. The controlling headings contain the reproducible rules and do not depend on a private local mockup being available.
- Consequences: replace only the desktop Store Details page-level width cap with broad sections and locally readable components; define the introduction/exploration/visit/context/continuation sequence, non-obscuring local navigation, responsive geometry, sparse/failed-media handling, and implementation acceptance checks. Preserve semantic color/type/identity/control tokens, ordinary scroll, existing authentication and private-action continuations, all current-tier permitted approved photos, and the dedicated gallery route. No runtime design controls, new photo capacity, application implementation, fixture expansion, deployment, provider calls, spending, public release, or paid activation are authorized by this amendment.
- Affected tickets: #310 owns this dedicated plan amendment and its reviewed/check-passing merge. #309 remains a separate, unresolved 50-photo evaluation proposal; this directive neither grants its fixture/entitlement/hosting authority nor starts its implementation. Later Store Details implementation must cite this merged amendment and own a separate repository-controlled outcome.

## 2026-09-09 — Fixture-only 50-photo synthetic store-wall evaluation profile

- Authorization directive: `update plan`
- Exact Product Owner direction: `update plan` for the 50-photo evaluation; the Product Owner chose the fixture-only evaluation profile rather than any tier or entitlement change.
- Reason: the deterministic Synthetic Store catalog carries only 15 generated images total (one cover per 12 stores plus three Blue Finch gallery images), which is too small to exercise a long editorial photo wall, while the approved public capacity is one cover plus five gallery images. An implementation cannot silently turn Free listings into 50-photo listings, so the amendment defines a separate, clearly labeled internal evaluation surface.
- Changed sources: PRD.md — Next milestone: Free private experience evaluation and Official Store Profile Photos; DESIGN.md — Store photo gallery page and the new Fixture-only 50-photo evaluation profile; DESIGN_SYSTEM.md — Production navigation and routes and Shared asynchronous-state matrix; PRODUCT_DECISIONS.md — Fixture-only 50-photo synthetic store-wall evaluation — 2026-09-09; this append-only receipt. README requirement ownership and the remaining plan documents are unchanged and consistent.
- Evidence: main baseline `8f74805`; the dedicated plan ticket #316 and issue #309 authorize the amendment and bound the delivery. The overarching directive was provided by the Product Owner on 2026-09-09; the fixture-only scope was chosen in response to the plan's product decision question. No application, asset, migration, deployment, or provider work is included in this receipt.
- Consequences: designate all 12 deterministic Synthetic Stores at approximately 50 distinct, locally hosted, generated fictional photo records each, with meaningful alt text, internal-only labels, and recorded provenance, rendered only through the existing photo gallery page interactions. The profile remains visibly synthetic, never becomes a public tier, and cannot be mistaken for a real or Free listing; sparse/empty-media, missing-image, keyboard/lightbox, reduced-motion, and return-to-details behaviors are preserved. Free/Gallery/Full Gallery capacity, real-media gating, public release, provider activation, and paid activation stay unchanged and require their own gates.
- Affected tickets: #316 owns this dedicated plan amendment and its reviewed/check-passing merge. #309 owns the delivered evaluation fixtures and their verification; it is unblocked to implement only after this amendment is merged and must keep its own evidence and closure separate.
