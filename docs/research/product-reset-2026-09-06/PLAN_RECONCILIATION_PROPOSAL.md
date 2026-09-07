# Proposed reconciliation of the product plan after review

Status: authorized local amendment draft under the exact 2026-09-07 direction `update plan as proposed, and show me the changes before publishing`. Earlier proposal wording below preserves the discussion; the final local migration receipt records the prepared changes and review status. No publication or implementation has been performed.

Baseline checked: fetched `origin/main` at `63a47ac499c0b52e6af7c0601e5b627c26fa08f0`, the completed product-reset review, and the recorded owner choices in OWNER_DECISION_WORKSHEET.md.

## Recommendation

Update the PRD and affected supporting contracts together before admitting tickets that depend on the new decisions. Preserve the original requirements that still apply, explicitly distinguish the first private experience test from later acceptance and release, and link historical evidence without treating it as current authority. This is a focused reconciliation, not a full product rewrite.

The current worksheet is discussion evidence. Its D1–D11 labels are local to that worksheet and must not overwrite any pre-existing product-decision numbering. Once reconciled, tickets must cite the authoritative requirement and heading, not this proposal or the discussion worksheet.

## Amendment A: incorporate settled owner decisions

This is the proposed scope for an `update plan as proposed` authorization referring to this document. Amendment B below is preparation only and still requires its own concrete authorization before hosted execution.

| Settled choice | Proposed authoritative treatment | Guard against conflicting interpretations |
| --- | --- | --- |
| Free private concept test first (D1) | Record the next delivery milestone as an owner-and-agent private experience evaluation of the approved Free capabilities | This is not public readiness, full Internal Alpha exit, or paid activation; it does not claim an environment is available |
| Usability, appearance, flow, enjoyment, and practical value (D2) | Add experience acceptance alongside functional acceptance: understandable next steps, readable/appealing presentation, natural transitions, preserved task context, and recorded owner feedback about enjoyment and return intent | A long session alone is not proof of enjoyment; no invented adoption or retention result |
| Discovery → photos → favorites → trip (D3/D8) | Make this the first connected evaluation journey and the intended memorable experience | Preserve approved list-first discovery, privacy, accessibility, manual planning, and current capability boundaries; do not introduce a video feed, recommendation system, marketplace, or redesign |
| Owner plus persona tests (D4) | Distinguish the owner's firsthand feedback, simulated persona observations, and actual software-path results | Personas do not replace the existing independent human tester, older-adult cohort, professional review, or external research requirements |
| Computer then phone (D5) | Record the owner's review sequence and require separate observations from both | This is a test order, not a change from the PRD's mobile-first product design or a replacement for the release device/accessibility matrix |
| Rich, clearly labeled fictional content (D6) | Use coherent synthetic stores and permitted synthetic imagery with traceable provenance and enough variety to exercise the selected journey | No real-store names/photos or implied affiliation; exact seed additions still obey the permitted fixture scope and environment authorization |
| Working name now; exhaustive later rename (D7) | Retain Antique Trail temporarily; add a rename completeness requirement covering all reference classes, rendered surfaces, operational settings, and compatibility dependencies | No final name, domain purchase, legal clearance, or current rename; identify immutable/third-party references and obtain an explicit disposition rather than silently skipping them |
| No out-of-pocket spending (D9) | Make the owner's current no-new-spending direction explicit, including costs outside the existing recurring-infrastructure rule; later financial commitments need a concrete budget funded by available site revenue | Revenue expectations or store counts are not funds; do not authorize automatic spending, overages, new subscriptions, or weakened release safeguards |
| Paid listing/photo-tier revenue later (D10) | Reference the approved store-membership contract and retain its Free/Gallery/Full Gallery boundaries | No shopper charges, sales commissions, paid ranking, new prices, or live billing inferred from “site sales” |
| Appearance judgment deferred (D11) | Record that a connected walkthrough precedes any owner-selected redesign; evaluate against the existing approved design first | Neither approval nor rejection of the existing appearance is implied; specific layout, palette, typography, interaction, or copy changes need concrete subsequent amendments |

### Proposed first-pass acceptance wording

1. The owner can complete discovery, store/photo exploration, saving favorites, and trip building on computer and then phone, with exact successes, failures, and interruptions recorded.
2. The review records where the owner hesitates, what attracts interest, whether transitions make sense, and whether the owner wants to continue or return; the owner gives a continue/revise/stop disposition with reasons.
3. Persona coverage maps approved shopper, partner/navigator, representative, and administrator roles to appropriate tasks and relevant device/accessibility variations; simulated opinions are not reported as participant evidence.
4. Actual server-path and account-isolation results remain distinct from simulated UI results; missing evidence remains incomplete rather than passed.
5. This disposition approves only the next bounded investment/revision decision, not any later release, participant, provider, or commercial gate.

These are proposed milestone-level requirements, not a single implementation ticket. Each implementation child must still own one result and one to five focused checks. Existing safety/privacy blocking conditions continue to apply regardless of an owner's positive experience judgment.

## Document changes and ownership

| Document or group | Specific reconciliation |
| --- | --- |
| PRODUCT_DECISIONS.md | Record settled milestone, experience priorities, tester/device order, temporary-name/full-rename requirement, and budget/monetization boundaries; cross-reference the existing “Internal Alpha before external participation,” “Startup Learning MVP,” “Startup free-service and hosting boundary,” and photo-tier decisions without erasing their later-stage requirements |
| PRD.md | Align “Working title,” “Product summary,” “Product vision,” “Product goals,” and affected acceptance/stage sections with the proposed milestone and experience criteria; distinguish intended distinctiveness from demonstrated market differentiation |
| DESIGN.md | Add the selected review focus under “Product promise and audience” and reference the connected Browse/Details/photo/saving/trip journey; keep current interaction rules and visual direction |
| DESIGN_SYSTEM.md | Align screen acceptance/review references with the new milestone only where needed; retain exact tokens, component states, accessibility, and responsive requirements |
| PLAN_ACCEPTANCE.md | Distinguish this first owner experience evaluation from SLM-01, full Internal Alpha exit, external participation, public release, and paid activation; preserve the existing independent human/provider requirements |
| IMPLEMENTATION_PLAN.md and PACKAGE_CONTRACTS.md | Reconcile milestone/dependency wording that could make code completion depend on unrelated external proof; preserve actual feature and stage requirements and cite the authoritative new milestone rather than duplicating all of it |
| SECURITY_AND_TRUST.md and applicable ADR/runbook references | Verify that the new milestone does not imply access under expired ADR0007/0008 permissions; preserve all current controls; mark a new hosted test as requiring Amendment B and live prerequisites |
| PRODUCT.md | Align the concise product register with the approved PRD/decisions rather than introducing another source of requirements |
| PROJECT_STATE.md | Refresh dated implementation/review statements against current main and evidence; identify confirmed failures, untested paths, completed teardown, and unresolved test setup; no issue-status ledger or blanket acceptance claim |
| CODEX_START_PROMPT.md, PLANNING_INDEX.md, README.md | Route agents to the current authoritative decisions and milestone; clarify applicable first-test versus release requirements and the expired task-specific test authority |
| docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md and related operational indexes | Annotate the archived tracking issue and dated evidence; preserve still-applicable requirements and their authoritative references; do not reopen #56 or mark its requirements passed by this amendment |
| PLAN_CHANGELOG.md | Append the actual owner authorization, rationale, affected documents, consequence, and remaining boundaries |
| Review worksheet, review checklist, and dated research reports | Preserve original observations; add a short status/cross-reference to the eventual merged amendment so recommendations and old deployment blockers cannot masquerade as current requirements |

Edit only passages actually affected; inspect cross-references across the document set. Do not churn every file solely because it appears in this table. If another controlling source repeats an affected requirement, reconcile it in the same amendment and identify it in the final change record.

## Amendment B: replacement hosted private-test context

This is a known separate plan dependency, not an approved implementation detail. ADR0007 authorizes only the completed product-reset task. ADR0008 fixes its backend to `ykyrvqddgnfmgftjwpts`, which the teardown report records as deleted, and permits internal authorization records for at most 24 hours with no automatic renewal.

Before proposing the replacement authority for approval:

- Verify a permissible $0 provider/resource path without spending or disturbing the existing beta.
- Prepare the exact new assessment scope, permitted operator identities and role accounts, synthetic fixture scope, backend binding process, and permitted capabilities.
- Specify test duration, explicit renewal, who operates and tears down the environment, and a practical way to conduct the owner's computer/phone pass.
- Preserve isolated data, every-host protection, server-side identity/scope/MFA checks, expiry/revocation, and truthful evidence classification.
- Identify every affected ADR and mirrored contract/runbook section; propose a narrowly superseding ADR rather than silently rewriting the historical authorization.

Amendment A does not authorize resource creation, upload, broader admissions, longer sessions, real email, external participants, public access, or spending. Amendment B must be concrete and approved through the plan-change process before dependent hosted-test implementation is ready.

## What the review changes without changing requirements

The reported authorization, login, hours, trip-edit, and saved-state defects are repair evidence. Where current main still violates an existing requirement, create a conforming repair ticket; do not rewrite the requirement to match the defect. Confirm current reproduction and exact controlling headings before admission.

The 2 failed / 5 partial / 53 blocked scenario counts describe the dated review scope; they are neither a count of distinct bugs nor a permanent current-state score. Preserve source and date when quoting them. Setup issues fixed later in the review and automation-only input discrepancies must not become duplicate product bugs.

Market opportunity and legal/name clearance remain unresolved. Owner goals about enjoyment and uniqueness belong in the plan as intended outcomes, not evidence of success. Keep the current release-security and human evidence obligations explicit even where their old tracking issue was archived.

## Completion checks for reconciliation

- Trace every recorded owner choice to an authoritative requirement, an existing unchanged requirement, or an explicitly deferred decision.
- Search the controlling set and active agent-entry documents for inconsistent milestone, audience, imagery, spending, release, tester, naming, and test-authorization wording.
- Resolve affected contradictions; label historical evidence and supersession without deleting original observations or rewriting immutable history.
- Run the repository's relevant document/plan-governance checks and obtain independent review of the exact amendment candidate.
- Merge the amendment before dependent implementation tickets receive ready status; existing conforming repair drafts can be prepared in parallel.

No final GitHub ticket set or protected plan modification has been published by this proposal.

## Revised document structure proposal

### Discussion decision and amendment boundary

The owner answered `yes i would like this` to the proposed keep/consolidate/reference/archive map: one readable product plan, linked specialist detail, preserved decision history and evidence, and shorter agent instructions. This accepts the structural direction; it is not the exact `update plan` directive required by the existing governance contract.

This revision replaces the earlier "Document changes and ownership" approach. Combine the accepted structure with Amendment A's recorded owner choices in one coherent proposed amendment. Amendment B, replacement hosted-test authority, remains excluded. Preserve the original proposal above as the discussion record rather than creating another plan file.

Next authorized preparation, once the owner gives the scoped directive: prepare the changed documents locally and show the owner the resulting plan and migration evidence before publishing. Do not create or modify GitHub issues, publish a branch or PR, merge, implement application changes, or provision a test environment as part of that local document-review checkpoint. Subsequent publication must still follow the dedicated amendment PR, independent review, checks, and merge requirements in PLAN_GOVERNANCE.md.

### What the owner will read

PRD.md becomes the product reading path, with these sections in this order:

1. **Purpose, people, and product promise.** The problem Antique Trail solves, intended audiences, the working name, and the experience people should want to return to.
2. **The connected shopper experience.** A readable account of discovery, store details and photos, favorites, trip planning, partner handoff, using the trip, and private visit memory, with explicit links to detailed requirements.
3. **The store and administrator experience.** How trusted listings are created and maintained, how applications and corrections are reviewed, and how these roles support the shopper journey without access to shopper-private data.
4. **The next milestone: Free private experience evaluation.** Amendment A's priorities, owner plus simulated-persona coverage, computer then phone, permitted demo-content intent, and continue/revise/stop evaluation; test-environment availability and authority remain separate.
5. **Capability requirements and acceptance.** Preserve the current detailed product headings where practical; each capability names observable outcomes and links to its interaction, design, security, and technical details.
6. **Product-wide commitments.** Privacy, accessibility, trustworthy information, recovery, budget, and commercial boundaries in understandable terms, with exact specialist rules linked by heading rather than copied.
7. **Later stages, deferred scope, and unresolved choices.** Preserve SLM-01, full Internal Alpha, external readiness, beta, public release, expansion, and paid activation as distinct outcomes with their existing prerequisites; the new evaluation does not replace them.

The first sections explain the whole product without requiring the owner to reconstruct it from tickets. Detailed sections remain reachable by stable headings. Existing requirement identifiers remain intact; worksheet D1-D11 labels do not replace existing decision identifiers.

### One owner for each kind of requirement

| Document | Proposed responsibility | Material to remove or replace with links |
| --- | --- | --- |
| PRD.md | Product outcomes, capability behavior, user-visible success, stage purpose and product admission conditions, deferred scope | Exact visual values, operational retention schedules, architecture detail, copied decision prose, and copied temporary deployment exceptions |
| DESIGN.md | Detailed journeys, action behavior, recovery from interruptions/errors, interaction and copy intent | Repeated product scope, exact visual tokens, and independently maintained security policy |
| DESIGN_SYSTEM.md | Exact visual tokens, responsive layout, reusable component/accessibility rules, canonical routes, and visual screen acceptance | Repeated multi-step journey narratives; retain visual state requirements and link to DESIGN.md for transitions |
| SECURITY_AND_TRUST.md | Exact privacy, authorization, retention, recovery, abuse, and security acceptance controls | Copies of architecture exception text and whole product-stage narratives; link to the applicable ADR and PRD section |
| PACKAGE_CONTRACTS.md | Unique technical contracts by capability, including retained schema, commands, jobs, concurrency, failure handling, technical verification, and rollback | Repeated product behavior, full interaction scripts, security policy copies, and obsolete implementation order; preserve package headings as compatibility anchors |
| Existing specialist specifications | Nonduplicated detail for their explicitly named boundary, linked from the parent capability | Requirements already owned by a parent or other specialist; clarify ambiguous precedence rather than silently demoting an approved amendment |
| Accepted ADRs | Architecture choices and constraints for their named boundary, including the exact scope of any temporary exception | Mirrored copies in other documents; preserve original ADRs and record supersession when appropriate |

PRD.md is the authoritative product entry point; it does not override specialist controls. PLAN_GOVERNANCE.md and README.md must explicitly assign these boundaries and retain the stop-on-conflict rule. A concise product promise may link to a precise security or accessibility requirement without restating its numbers or independently redefining its conditions.

### Concrete source-to-destination map

| Existing source and section | Proposed destination or disposition |
| --- | --- |
| PRODUCT.md: Users, Product Purpose, Memorable Product Promise | PRD.md: Purpose, people, and product promise; connected experience; relevant stage acceptance |
| PRODUCT.md: Brand Personality, Anti-references, Design Principles | Unique interaction/voice intent to DESIGN.md; visual prohibitions to DESIGN_SYSTEM.md; references from the PRD |
| PRODUCT.md: Accessibility & Inclusion; PRD.md: Age-inclusive usability requirements | PRD retains the inclusive product objective and human acceptance requirement; DESIGN_SYSTEM owns exact UI measurements and interaction checks |
| PRD.md: Private content lifetime, Operational retention, Recovery objectives, Break-glass emergency access | SECURITY_AND_TRUST.md owns exact controls; PRD retains user-facing consequences and direct references, including pending-decision boundaries |
| DESIGN.md: Implementation acceptance journeys | Keep as the detailed connected interaction checks; link from PRD capability and milestone acceptance rather than copy the full journeys |
| IMPLEMENTATION_PLAN.md: Bounded first development slice, Runtime and data flow, Minimal data model and security boundary | Unique Package 1 technical material to PACKAGE_CONTRACTS.md; security rules to SECURITY_AND_TRUST.md; architecture decisions remain governed by applicable ADRs |
| IMPLEMENTATION_PLAN.md: PWA, dependency, and developer-experience choices; Failure modes and required behavior; Test coverage contract; Performance contract; Execution order, gates, and rollback | Technical requirements to Package 1 in PACKAGE_CONTRACTS.md; product-wide controls to their specialist owner; distinguish obsolete build sequence from still-applicable requirements |
| IMPLEMENTATION_PLAN.md: Cross-phase Internal Alpha gate; phase and work-package roadmap sections | Unique product/stage acceptance to PRD; security/recovery obligations to SECURITY_AND_TRUST; retain superseded roadmap text as historical evidence after mapping |
| PACKAGE_CONTRACTS.md: Packages 2-13 outcome, route/state, schema, command/job, verification, and rollback paragraphs | Split by responsibility in the preceding table; retain unique engineering detail locally and replace repeated rules with exact source links |
| PLAN_ACCEPTANCE.md: Release dependency chain, Provider and external-decision boundary, Intentional exclusions | PRD stage/deferred sections own product requirements; ADR/security/provider references own exact constraints; the old file becomes a linked navigation and historical-receipt document |
| PLAN_ACCEPTANCE.md: Independent-builder acceptance | Workflow requirements to PLAN_GOVERNANCE.md and technical/security acceptance to the appropriate contract; preserve the current full-plan review obligation unless separately amended |
| PLAN_ACCEPTANCE.md: Traceability and Independent review receipt | Keep a link-only capability map and preserve the dated review receipt with its original scope; neither introduces current policy or current readiness claims |
| PRODUCT_DECISIONS.md: Confirmed decisions and Remaining deferred or provider-gated decisions | Preserve decision headings/IDs, reasons, original evidence, and unresolved choices; link to the current requirement owner, with active restrictions migrated before removing their authority here |
| Repeated Protected internal synthetic review exception and Governed internal synthetic admission sections | Link to ADR0007/0008 for exact scope; preserve dated evidence of task completion/teardown separately; no automatic renewal or replacement resource authority |

Retain store-membership-spec.md for exact membership/commercial mechanics and owner-onboarding.md for the detailed invited-owner interaction variant. Their parent PRD/DESIGN sections must identify the delegated boundary explicitly, including the distinction between invited pilot onboarding and public applications. Do not flatten their different consent, approval, or activation rules into a generic owner journey.

### Entry points, history, and evidence

- **PRODUCT.md:** after migration, retain a short link to the PRD for existing consumers; it has no independent requirements.
- **IMPLEMENTATION_PLAN.md:** after all unique requirements are mapped, label the roadmap historical and point readers to the current requirement owners; retain old heading anchors for evidence and ticket references.
- **PLAN_ACCEPTANCE.md:** retain linked navigation and dated acceptance history, with all live requirements moved to their named owners; it cannot remain a second acceptance authority.
- **PRODUCT_DECISIONS.md and PLAN_CHANGELOG.md:** preserve decision/change history and references to current requirements; do not rewrite past approvals as if they approved this structure.
- **README.md:** one short human/agent entry page plus the authoritative responsibility table, installation guidance, and links.
- **PLANNING_INDEX.md:** document inventory and current/historical classification; reference README's responsibility table instead of maintaining a competing one.
- **CODEX_START_PROMPT.md and repository agent guides:** brief reading and execution instructions that link to PLAN_GOVERNANCE, the PRD's overview, and task-specific requirements; no copied deployment or milestone policies.
- **PLAN_GOVERNANCE.md and docs/agents/issue-tracker.md:** governance owns amendment, admission, review, and closure rules; the issue guide describes their application without redefining them; OPEN_TICKET_TODO.md remains a short workflow pointer, never a backlog ledger.
- **PROJECT_STATE.md:** dated implementation and environment facts with evidence links; GitHub retains live issue/PR state; plan proposals do not become implemented facts.
- **Research, worksheets, review reports, operational runbooks, and receipts:** preserve provenance and dates; retain executable operational procedures and any unique required gate detail under an explicit specialist owner before classifying material as evidence-only.

Update manifest.json and affected links/checks to reflect the chosen roles. Do not delete historical records, move unrelated local files, or publish the untracked research folder wholesale. Preserve current required CI checks and protected-source enforcement.

### How a small ticket retains the whole experience

Keep the existing five ticket sections. Under Plan, link to the PRD's short product overview, the connected journey, the exact capability requirement, and only the relevant specialist headings. Under Outcome, state the result and its place in that journey. Under Acceptance and Verification, cover the changed behavior plus the affected transition to adjacent steps; retain one to five observable acceptance criteria.

For example, a future stop-removal repair would connect back to building a useful day from discovered stores, cite the existing trip-removal and authorization requirements, and verify that removal persists, the remaining itinerary stays usable, and another account cannot remove the stop. This example is not a new issue or implementation instruction. Diagnose the actual path and supply concrete checks before assigning it.

The full owner walkthrough remains a milestone-level check of discovery through photos, favorites, and trip building. Passing isolated tickets cannot establish enjoyment or a connected successful experience. Simulated-persona findings, actual server checks, and human feedback remain separate evidence. Small scope supports smaller-model work; model suitability still depends on the actual task and review findings.

### Reviewable migration and completion criteria

Prepare the local amendment against refreshed main in the existing isolated amendment checkout, preserving all unrelated work. Within this proposal, append a compact migration receipt mapping each moved normative passage to its exact destination heading, retained requirement, or documented historical disposition. This is amendment evidence, not another live product plan.

Before declaring the local draft ready for owner review:

1. Trace every Amendment A owner choice and every moved unique requirement to its destination; any ambiguous or conflicting rule remains explicitly unresolved and prevents retirement of its old authority.
2. Show the rewritten PRD reading path and the actual source diff, with a list of any intended semantic change beyond Amendment A; none is authorized by document consolidation alone.
3. Check local links and heading references, the manifest, repeated-policy references, relevant document/governance checks, and diff whitespace; retain existing protection and required review obligations.
4. Show that exact security, accessibility, stage, commercial, consent, privacy, and architecture constraints survived the move, and that dated receipts did not become live permission or acceptance.
5. Stop at the owner's document-review checkpoint before publishing; later ticket preparation follows the agreed plan, and implementation resumes only when directed.

This proposal is ready for a scoped authorization to prepare the local amendment. It is not a completed migration, an independent review, or approval to publish.

## Local migration receipt and owner review

### Scope and checkpoint

Baseline: fetched main `63a47ac499c0b52e6af7c0601e5b627c26fa08f0`. Exact owner direction: `update plan as proposed, and show me the changes before publishing`. Work is isolated in the existing `codex/private-experience-plan` checkout; the user's older main checkout and unrelated local files are preserved. This is a local amendment for owner review, not a publication, ready implementation backlog, hosted environment, or accepted release.

The PRD now opens with the full connected experience and the next Free private evaluation. README contains the one responsibility table; agent entry documents link to it. Package 1 engineering detail joins the other capability contracts. Current policy links replace repeated decision/phase/acceptance authority; original decisions and roadmap text remain as history. All worksheet identifiers remain local discussion labels.

### Owner-choice trace

| Worksheet choice | Current draft requirement |
| --- | --- |
| D1: Free private evaluation first | [Next milestone](../../../PRD.md#next-milestone-free-private-experience-evaluation) |
| D2: usability, appearance, flow, enjoyment and usefulness | [Evaluation acceptance and disposition](../../../PRD.md#evaluation-acceptance-and-disposition) |
| D3/D8: discovery, photos, favorites and trip; intended distinctive appeal | [Connected shopper experience](../../../PRD.md#the-connected-shopper-experience) and [product promise](../../../PRD.md#purpose-people-and-product-promise) |
| D4: owner plus simulated personas | [Evaluation scope and evidence](../../../PRD.md#evaluation-scope-and-evidence) |
| D5: computer, then phone | [Evaluation scope and evidence](../../../PRD.md#evaluation-scope-and-evidence) |
| D6: realistic labeled synthetic content with permitted imagery | [Evaluation scope and evidence](../../../PRD.md#evaluation-scope-and-evidence) and [environment boundary](../../../PRD.md#assessment-environment-boundary) |
| D7: working name now, complete later rename | [Working title](../../../PRD.md#working-title) |
| D9: no new out-of-pocket spending | [Budget and commercial direction](../../../PRD.md#budget-and-commercial-direction) |
| D10: store photo-capacity revenue later | [Budget and commercial direction](../../../PRD.md#budget-and-commercial-direction) and [membership contract](../../specs/store-membership-spec.md) |
| D11: experience the connected journey before judging appearance changes | [Evaluation acceptance and disposition](../../../PRD.md#evaluation-acceptance-and-disposition) |

### Requirement migration map

Each row identifies a source passage and its current owner. "Existing current owner" means the richer current contract retains the requirement rather than copying older approval wording into a new active section; this is a reviewed semantic mapping, not a claim that a string-matching check proves equivalence. Earlier emergency-access clocks and build-from-zero claims remain historical; their newer current controls are preserved. Original decision identifiers, original roadmap headings, and dated receipts remain available.

| Source passage at the baseline | Current destination | Treatment |
| --- | --- | --- |
| `PRD.md` / Private content lifetime | [SECURITY_AND_TRUST.md / Privacy by default](../../../SECURITY_AND_TRUST.md#privacy-by-default) | Existing current owner |
| `PRD.md` / Operational retention | [SECURITY_AND_TRUST.md / Operational retention](../../../SECURITY_AND_TRUST.md#operational-retention) | Existing current owner |
| `PRD.md` / Recovery objectives | [SECURITY_AND_TRUST.md / Backups](../../../SECURITY_AND_TRUST.md#backups) | Existing current owner |
| `PRD.md` / Break-glass emergency access | [SECURITY_AND_TRUST.md / Break-glass emergency access](../../../SECURITY_AND_TRUST.md#break-glass-emergency-access) | Existing current owner |
| `PRD.md` / Age-inclusive usability requirements | [DESIGN_SYSTEM.md / Age-inclusive usability baseline](../../../DESIGN_SYSTEM.md#age-inclusive-usability-baseline) | Moved |
| `PRODUCT_DECISIONS.md` / Public, multi-user product | [PRD.md / Purpose, people, and product promise](../../../PRD.md#purpose-people-and-product-promise) | Existing current owner |
| `PRODUCT_DECISIONS.md` / PWA first | [PRD.md / Product type](../../../PRD.md#product-type) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Login platform | [SECURITY_AND_TRUST.md / Authentication](../../../SECURITY_AND_TRUST.md#authentication) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Public ratings resemble Google-style ratings | [PRD.md / Rating model](../../../PRD.md#rating-model) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Separate rating concepts | [PRD.md / Rating model](../../../PRD.md#rating-model) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Preference profile belongs to the user account | [PRD.md / Deferred Phase 5 — Onboarding and taste profile (not authorized for Regional Public MVP)](../../../PRD.md#deferred-phase-5--onboarding-and-taste-profile-not-authorized-for-regional-public-mvp) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Directory data sources and provenance | [PRD.md / Public store directory](../../../PRD.md#public-store-directory) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Store Browser is the shopper front door | [PRD.md / Store Browser requirements](../../../PRD.md#store-browser-requirements) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Official Store Profile Photos | [PRD.md / Official Store Profile Photos](../../../PRD.md#official-store-profile-photos) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Age-inclusive usability baseline | [DESIGN_SYSTEM.md / Age-inclusive usability baseline](../../../DESIGN_SYSTEM.md#age-inclusive-usability-baseline) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Current visual direction | [DESIGN_SYSTEM.md / Selected visual direction](../../../DESIGN_SYSTEM.md#selected-visual-direction) | Moved |
| `PRODUCT_DECISIONS.md` / Listing freshness and stale behavior | [PRD.md / Listing freshness](../../../PRD.md#listing-freshness) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Trip app owns the itinerary | [PRD.md / Today's Trip requirements](../../../PRD.md#todays-trip-requirements) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Routing location privacy | [SECURITY_AND_TRUST.md / Location privacy](../../../SECURITY_AND_TRUST.md#location-privacy) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Professional and commercial standard | [PRD.md / Product goals](../../../PRD.md#product-goals) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Security is launch-blocking | [PRD.md / Regional Public MVP](../../../PRD.md#regional-public-mvp) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Regional launch | [PRD.md / Regional launch strategy](../../../PRD.md#regional-launch-strategy) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Staged release gates | [PRD.md / Delivery and release boundary](../../../PRD.md#delivery-and-release-boundary) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Regional Public MVP boundary | [PRD.md / Regional Public MVP](../../../PRD.md#regional-public-mvp) | Existing current owner |
| `PRODUCT_DECISIONS.md` / In-person store-partner pilot | [PRD.md / First Store Partner onboarding](../../../PRD.md#first-store-partner-onboarding) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Topeka Private Beta Pilot Area | [PRD.md / First Pilot Store Record](../../../PRD.md#first-pilot-store-record) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Internal Alpha before external participation | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Separate Internal Alpha accounts | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Recipient-specific Candidate Share | [PRD.md / Candidate-link capture and Trip Ideas](../../../PRD.md#candidate-link-capture-and-trip-ideas) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Candidate Share expiry and cleanup | [PRD.md / Candidate-link capture and Trip Ideas](../../../PRD.md#candidate-link-capture-and-trip-ideas) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Candidate Share delivery and abuse protection | [PRD.md / Candidate-link capture and Trip Ideas](../../../PRD.md#candidate-link-capture-and-trip-ideas) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Representative Test Account | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Store Representative publishing split | [PRD.md / Business accounts](../../../PRD.md#business-accounts) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Administrator approval during Internal Alpha and Private Beta | [PRD.md / Business accounts](../../../PRD.md#business-accounts) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Internal Alpha feature boundary | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Internal Alpha shopper-trip exit gate | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Internal Alpha privileged-workflow exit gate | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `PRODUCT_DECISIONS.md` / No store-owner participation before readiness | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `PRODUCT_DECISIONS.md` / External Testing Readiness gate | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `PRODUCT_DECISIONS.md` / First Store Partner onboarding | [PRD.md / First Store Partner onboarding](../../../PRD.md#first-store-partner-onboarding) | Existing current owner |
| `PRODUCT_DECISIONS.md` / First Pilot Store Record | [PRD.md / First Pilot Store Record](../../../PRD.md#first-pilot-store-record) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Initial Private Beta Cohort | [PRD.md / Initial Private Beta Cohort](../../../PRD.md#initial-private-beta-cohort) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Initial Private Beta Expansion Gate | [PRD.md / Initial Private Beta Expansion Gate](../../../PRD.md#initial-private-beta-expansion-gate) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Controlled Private Beta Expansion | [PRD.md / Controlled Private Beta Expansion](../../../PRD.md#controlled-private-beta-expansion) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Regional Public Readiness Gate | [PRD.md / Regional Public Readiness Gate](../../../PRD.md#regional-public-readiness-gate) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Regional growth sequence | [PRD.md / Regional launch strategy](../../../PRD.md#regional-launch-strategy) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Community Expansion Gate | [PRD.md / Regional launch strategy](../../../PRD.md#regional-launch-strategy) | Existing current owner |
| `PRODUCT_DECISIONS.md` / In-person Store Partner QR invitation | [PRD.md / Store Partner Invitation](../../../PRD.md#store-partner-invitation) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Store Partner pilot-consent capture | [PRD.md / Pilot consent capture](../../../PRD.md#pilot-consent-capture) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Pilot Store Draft review and approval | [PRD.md / Pilot Store Draft](../../../PRD.md#pilot-store-draft) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Representative activation and first login | [PRD.md / Representative activation and first login](../../../PRD.md#representative-activation-and-first-login) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Store Partner Pilot Support | [PRD.md / Store Partner Pilot Support](../../../PRD.md#store-partner-pilot-support) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Product promise and first arrival | [PRD.md / Core workflow](../../../PRD.md#core-workflow) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Trip construction and readiness | [PRD.md / Today's Trip requirements](../../../PRD.md#todays-trip-requirements) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Active trip and private visit memory | [PRD.md / Active-trip actions](../../../PRD.md#active-trip-actions) | Existing current owner |
| `PRODUCT_DECISIONS.md` / One-trip partner handoff | [PRD.md / One-trip roles and invitation](../../../PRD.md#one-trip-roles-and-invitation) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Offline active trip | [PRD.md / Offline active trip](../../../PRD.md#offline-active-trip) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Offline active-trip storage | [PRD.md / Offline active trip](../../../PRD.md#offline-active-trip) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Offline synchronization and device precedence | [PRD.md / Offline active trip](../../../PRD.md#offline-active-trip) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Store Portal and publishing states | [PRD.md / Store Portal home and publishing labels](../../../PRD.md#store-portal-home-and-publishing-labels) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Hours editing | [PRD.md / Hours editor](../../../PRD.md#hours-editor) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Store Updates and Vendor Contributor boundary | [PRD.md / Store Updates, images, and social links](../../../PRD.md#store-updates-images-and-social-links) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Official images and social links | [PRD.md / Store Updates, images, and social links](../../../PRD.md#store-updates-images-and-social-links) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Store Update lifecycle and support | [PRD.md / Store Updates, images, and social links](../../../PRD.md#store-updates-images-and-social-links) | Existing current owner |
| `PRODUCT_DECISIONS.md` / New-store discovery | [PRD.md / Store Browser requirements](../../../PRD.md#store-browser-requirements) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Administrator home and review workspace | [PRD.md / Administrator workspace](../../../PRD.md#administrator-workspace) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Access & Safety | [PRD.md / Access & Safety](../../../PRD.md#access--safety) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Historical implementation authorization transition | [PRODUCT_DECISIONS.md / Historical implementation authorization transition](../../../PRODUCT_DECISIONS.md#historical-implementation-authorization-transition) | Historical sequencing only |
| `PRODUCT_DECISIONS.md` / Bounded first development slice | [PRODUCT_DECISIONS.md / Bounded first development slice](../../../PRODUCT_DECISIONS.md#bounded-first-development-slice) | Historical sequencing only |
| `PRODUCT_DECISIONS.md` / Startup Learning MVP | [PRD.md / Startup Learning MVP (`SLM-01`)](../../../PRD.md#startup-learning-mvp-slm-01) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Startup free-service and hosting boundary | [PRD.md / Budget and commercial direction](../../../PRD.md#budget-and-commercial-direction) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Product promotion is not monetization | [PRD.md / Regional launch strategy](../../../PRD.md#regional-launch-strategy) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Correction, claim, and review-delete closure decisions | [PRD.md / Business accounts](../../../PRD.md#business-accounts) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Private shopper-content lifetime | [SECURITY_AND_TRUST.md / Privacy by default](../../../SECURITY_AND_TRUST.md#privacy-by-default) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Private-content deletion and backup aging | [SECURITY_AND_TRUST.md / Privacy by default](../../../SECURITY_AND_TRUST.md#privacy-by-default) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Inactive-account lifecycle | [SECURITY_AND_TRUST.md / Privacy by default](../../../SECURITY_AND_TRUST.md#privacy-by-default) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Operational-record retention | [SECURITY_AND_TRUST.md / Operational retention](../../../SECURITY_AND_TRUST.md#operational-retention) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Recovery objectives | [SECURITY_AND_TRUST.md / Backups](../../../SECURITY_AND_TRUST.md#backups) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Break-glass emergency access | [SECURITY_AND_TRUST.md / Break-glass emergency access](../../../SECURITY_AND_TRUST.md#break-glass-emergency-access) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Inactive-account timing | [SECURITY_AND_TRUST.md / Privacy by default](../../../SECURITY_AND_TRUST.md#privacy-by-default) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Completed-trip location | [SECURITY_AND_TRUST.md / Operational retention](../../../SECURITY_AND_TRUST.md#operational-retention) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Candidate Share terminal states | [SECURITY_AND_TRUST.md / Privacy by default](../../../SECURITY_AND_TRUST.md#privacy-by-default) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Invitation terminal states | [SECURITY_AND_TRUST.md / Operational retention](../../../SECURITY_AND_TRUST.md#operational-retention) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Participant exit | [SECURITY_AND_TRUST.md / User controls](../../../SECURITY_AND_TRUST.md#user-controls) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Freshness | [PRD.md / Listing freshness](../../../PRD.md#listing-freshness) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Duplicate merge | [SECURITY_AND_TRUST.md / Directory data provenance and integrity](../../../SECURITY_AND_TRUST.md#directory-data-provenance-and-integrity) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Account scope | [PRD.md / Account scope requirements](../../../PRD.md#account-scope-requirements) | Moved |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Authentication | [SECURITY_AND_TRUST.md / Authentication](../../../SECURITY_AND_TRUST.md#authentication) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Trip duration and Check My Day | [PRD.md / Package 5B planning factors and output](../../../PRD.md#package-5b-planning-factors-and-output) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Account-deletion cancellation and recent authentication | [SECURITY_AND_TRUST.md / Privacy by default](../../../SECURITY_AND_TRUST.md#privacy-by-default) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Portability | [SECURITY_AND_TRUST.md / User controls](../../../SECURITY_AND_TRUST.md#user-controls) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Browser/device baseline | [DESIGN_SYSTEM.md / Browser and device acceptance matrix](../../../DESIGN_SYSTEM.md#browser-and-device-acceptance-matrix) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Older-adult cohort | [PRD.md / Human usability acceptance](../../../PRD.md#human-usability-acceptance) | Moved |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / External support | [SECURITY_AND_TRUST.md / External support requirements](../../../SECURITY_AND_TRUST.md#external-support-requirements) | Moved |
| `PRODUCT_DECISIONS.md` / Closed lifecycle, portability, usability, and release decisions / Metric gate RG-01 | [PRD.md / Operating scorecard and RG-01](../../../PRD.md#operating-scorecard-and-rg-01) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Public review and scalable claim policy | [PRD.md / Review requirements](../../../PRD.md#review-requirements) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Social sign-in for admitted accounts | [SECURITY_AND_TRUST.md / Authentication](../../../SECURITY_AND_TRUST.md#authentication) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Photo-tier memberships: onboarding, pilot grandfathering, and tier changes | [docs/specs/store-membership-spec.md / Tier model](../../../docs/specs/store-membership-spec.md#tier-model) | Existing current owner |
| `PRODUCT_DECISIONS.md` / Photo moderation criteria (#92) | [docs/specs/store-membership-spec.md / Photo moderation criteria](../../../docs/specs/store-membership-spec.md#photo-moderation-criteria) | Moved |
| `PRODUCT_DECISIONS.md` / Remaining deferred or provider-gated decisions | [PRD.md / Unresolved product and provider choices](../../../PRD.md#unresolved-product-and-provider-choices) | Moved |
| `IMPLEMENTATION_PLAN.md` / Phase 0 — Product and security foundation | [SECURITY_AND_TRUST.md / Foundation acceptance](../../../SECURITY_AND_TRUST.md#foundation-acceptance) | Moved |
| `IMPLEMENTATION_PLAN.md` / Phase 1 — Public directory foundation | [PRD.md / Public store directory](../../../PRD.md#public-store-directory) | Existing current owner |
| `IMPLEMENTATION_PLAN.md` / Cross-phase Internal Alpha gate | [PRD.md / Internal Alpha](../../../PRD.md#internal-alpha) | Existing current owner |
| `IMPLEMENTATION_PLAN.md` / Phase 2A — Store claims, Store Portal, and administration before external testing | [PRD.md / Business accounts](../../../PRD.md#business-accounts) | Existing current owner |
| `IMPLEMENTATION_PLAN.md` / Phase 2B — Public reviews and moderation after Internal Alpha | [PRD.md / Review requirements](../../../PRD.md#review-requirements) | Existing current owner |
| `IMPLEMENTATION_PLAN.md` / Phase 3 — Trip planner | [PRD.md / Today's Trip requirements](../../../PRD.md#todays-trip-requirements) | Existing current owner |
| `IMPLEMENTATION_PLAN.md` / Phase 4 — Personal finds and households | [PRD.md / Deferred Phase 4 — Find capture (not authorized for Regional Public MVP)](../../../PRD.md#deferred-phase-4--find-capture-not-authorized-for-regional-public-mvp) | Existing current owner |
| `IMPLEMENTATION_PLAN.md` / Phase 5 — Personalization | [PRD.md / Deferred Phase 5 — Onboarding and taste profile (not authorized for Regional Public MVP)](../../../PRD.md#deferred-phase-5--onboarding-and-taste-profile-not-authorized-for-regional-public-mvp) | Existing current owner |
| `IMPLEMENTATION_PLAN.md` / Phase 6 — Regional launch | [PRD.md / Regional launch strategy](../../../PRD.md#regional-launch-strategy) | Existing current owner |
| `IMPLEMENTATION_PLAN.md` / Repository structure baseline | [PACKAGE_CONTRACTS.md / Repository structure baseline](../../../PACKAGE_CONTRACTS.md#repository-structure-baseline) | Moved |
| `IMPLEMENTATION_PLAN.md` / Bounded first development slice — execution contract | [PACKAGE_CONTRACTS.md / Package 1 — Local Synthetic catalog foundation](../../../PACKAGE_CONTRACTS.md#package-1--local-synthetic-catalog-foundation) | Moved |
| `PLAN_ACCEPTANCE.md` / Release dependency chain | [PRD.md / Stage dependencies](../../../PRD.md#stage-dependencies) | Moved |
| `PLAN_ACCEPTANCE.md` / Provider and external-decision boundary | [PRD.md / Provider and external-action prerequisites](../../../PRD.md#provider-and-external-action-prerequisites) | Moved |
| `PLAN_ACCEPTANCE.md` / Intentional exclusions | [PRD.md / Deferred implementation boundary](../../../PRD.md#deferred-implementation-boundary) | Moved |
| `PLAN_ACCEPTANCE.md` / Independent-builder acceptance | [PLAN_GOVERNANCE.md / Plan and implementation verification](../../../PLAN_GOVERNANCE.md#plan-and-implementation-verification) | Moved |
| `PRODUCT.md` / Brand Personality | [DESIGN.md / Product brand personality](../../../DESIGN.md#product-brand-personality) | Moved |
| `PRODUCT.md` / Anti-references | [DESIGN_SYSTEM.md / Product anti-references](../../../DESIGN_SYSTEM.md#product-anti-references) | Moved |
| `PRODUCT.md` / Design Principles | [DESIGN.md / Product design principles](../../../DESIGN.md#product-design-principles) | Moved |
| `PRODUCT.md` / Product Purpose | [PRD.md / Startup Learning MVP (`SLM-01`)](../../../PRD.md#startup-learning-mvp-slm-01) | Existing current owner |
| `PRODUCT.md` / Users | [PRD.md / Primary users](../../../PRD.md#primary-users) | Existing current owner |
| `PRODUCT.md` / Accessibility & Inclusion | [DESIGN_SYSTEM.md / Age-inclusive usability baseline](../../../DESIGN_SYSTEM.md#age-inclusive-usability-baseline) | Existing current owner |

Additional consolidations: Package contracts now link to current product outcomes and security controls while retaining schemas, commands, concurrency, technical failure checks, and rollback. Detailed authentication interaction moved from DESIGN_SYSTEM to DESIGN, preserving the old anchor as a reference. Deterministic plan checks and Engineering/Security/Design/Operations accountability moved from the historical roadmap to PLAN_GOVERNANCE; its proportional-check table preserves the former workflow detail. ADR0007/0008 definitions and ordinary required CI/security enforcement remain unchanged.

### Independent review record

Initial local candidate `13e646c9ed9cbec80fa000222a19a1ecb784fdbd` received separate Standards and Spec reviews. Findings are preserved here before their corrections:

| Axis | Finding | Correction in the revised local draft |
| --- | --- | --- |
| Standards P1 | Copying older emergency-access policy reintroduced its obsolete review deadline beside the current frozen-packet/reviewer-enrollment control | Removed the copied policy and linked the decision record to the current security section; retained current disabled-stage and deadline rules |
| Spec P1 | A paragraph-deduplication attempt removed Required/Excluded labels from copied Alpha lists | Restored source block structure, then integrated exit checks into the existing Internal Alpha section with explicit scope lists |
| Both P2 | Package status still pointed at retired requirement owners; Package 1 copied an obsolete zero-code/zero-coverage claim | Corrected current ownership and made the diagram a list of test obligations, not a current-coverage report |
| Both P2 | Copied policy/phase blocks left extensive active duplication | Consolidated 102 generated sections into existing owners, preserving unique clauses, direct links, and historical evidence |
| Spec P2 | Deterministic plan checks and delivery responsibility could lose current authority when the roadmap became historical | Moved current checks and role accountability to PLAN_GOVERNANCE, preserving obsolete chronology only as history |
| Standards P2 | Browser/device and RG-01 rules were assigned to security despite their product/design ownership | Routed them to DESIGN_SYSTEM acceptance and PRD success metrics |

The initial verdict does not approve the revised candidate. The final verification and follow-up review result are recorded below when available; a full-manifest acceptance review and hosted checks remain separate from this owner-review checkpoint.
