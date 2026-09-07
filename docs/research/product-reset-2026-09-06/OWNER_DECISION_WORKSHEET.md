# Review follow-up: decisions and small-ticket draft

Prepared 2026-09-07 for discussion. Confirmed discussion decisions are recorded below; the remaining worksheet is a proposal, not a changed product plan or an approved GitHub backlog.

## Recorded owner choices

### D1 — Free private concept test

- **Status:** Confirmed by the Product Owner on 2026-09-07.
- **Owner's words:** “yes free test so i know if this concept works.”
- **Context:** In response to the proposed next milestone of a dependable Free experience tested privately before inviting real shoppers or store owners.
- **Decision:** Prioritize a dependable Free experience and private testing to assess the concept; paid activation and public-launch readiness are not the selected next milestone.
- **Ticket consequence:** Shape the first ticket set around repairs and verification needed for that test; separate later research, provider, commercial, and launch outcomes.
- **Follow-up resolution:** Success, testers, devices, demo content, and budget are addressed by D2–D10. Test-environment authority remains unresolved as detailed below.
- **Authority boundary:** This records milestone selection; it does not amend protected requirements or authorize deployment, outreach, spending, or activation.

### D2 — Success means useful, attractive, enjoyable exploration

- **Status:** Confirmed by the Product Owner in the follow-up discussion.
- **Owner's words:** “your rec is great. for me success is usability, appearance, flow. the feeling of being in the site and losing track of time. kind of like the trend with tictoc people get in and enjoy so much they dont want to get out.”
- **Accepted practical benefit:** “This makes planning and taking an antique-shopping day easier than my current method, and I would choose to use it again.”
- **Experience priorities:** Usability, appearance, flow, and exploration enjoyable enough that the person wants to continue spending time in the site.
- **Interpretation for review:** Assess whether people understand what to do, enjoy the presentation, move naturally between activities, and voluntarily want to explore further or return. Confirm concrete tasks and pass criteria before ticket admission.
- **Evidence to gather:** Where a tester hesitates, gets confused, or loses interest; what they enjoy looking at; whether transitions feel natural; and their own explanation of whether they want to continue or return. These are proposed observations, not results already obtained.
- **Ticket consequence:** Functional repairs alone will not satisfy the selected milestone; include an integrated experience review against these priorities. Longer time spent is ambiguous without evidence of enjoyment and ease, because confusion can also prolong a visit.
- **Scope boundary:** TikTok is an analogy for enjoyment and immersion, not an approved requirement for short videos, an endless feed, recommendation algorithms, or other specific features. This discussion does not itself amend the approved design.
- **Follow-up resolution:** D3 selects the journey and D4 selects the testers. Concrete evaluation tasks still need preparation; appearance judgments are deferred under D11.

### D3 — Prioritize discovery through trip creation

- **Status:** Confirmed by the Product Owner in the follow-up discussion.
- **Owner's words:** “absolutely agree” in response to prioritizing discovering stores and browsing their photos, then naturally saving favorites and building a trip.
- **Decision:** Make this connected shopper journey the first focus of the usability, appearance, flow, and enjoyment review.
- **Ticket consequence:** Map repairs and experience acceptance to discovery → store/photos → saved favorites → trip building; include the account transitions needed along that journey. Check the joined experience as well as each individual feature.
- **Scope boundary:** This prioritizes review of existing approved capabilities; it does not approve new interface behavior, a redesign, or removal of other requirements.
- **Follow-up resolution:** D4–D6 settle testers, devices, and content. Test-environment authority and concrete acceptance tasks remain to be prepared.

### D4 — Owner testing plus simulated persona coverage

- **Status:** Confirmed by the Product Owner in the follow-up discussion.
- **Owner's words:** “I will test yes and I will have you set up persona's of all the type of people we think will use the site and test with those persona's”.
- **Decision:** The Product Owner will perform the first human experience test. The assistant will prepare personas representing the expected site users and test their relevant journeys.
- **Ticket consequence:** Include persona preparation and executable scenario coverage, then record findings by persona, task, device, and evidence type. Cover the D3 shopper journey first while retaining the broader approved user-role coverage for subsequent tests.
- **Proposed persona coverage:** First-time casual shopper; experienced antique enthusiast; visiting shopper unfamiliar with the area; returning trip planner; invited trip companion; store representative maintaining a listing; administrator approving and supporting stores. Apply relevant variations in digital confidence, age, keyboard/screen-reader use, vision, device, and connection quality rather than assuming these traits from a role or age alone. Verify this roster against the approved product roles before finalizing it.
- **Evidence boundary:** Personas are test models, not actual recruited participants. Record observed software behavior separately from inferred persona reactions. Simulated testing can identify usability barriers and workflow failures; the Product Owner's actual experience supplies human feedback. Neither simulated reactions nor a single owner's approval establishes wider market demand or replaces required external usability research.
- **Follow-up resolution:** D5/D6 settle device order and content. Prepare exact tasks and resolve test-environment authority; later independent human acceptance remains a separate requirement.

### D5 — Computer first, then phone

- **Status:** Confirmed by the Product Owner in the follow-up discussion.
- **Owner's words:** “computer then phone”.
- **Decision:** The Product Owner tests on a computer first and a phone second.
- **Ticket consequence:** Prepare the connected D3 journey for both device types and record results separately. Assess layout, readability, navigation, photo browsing, saving, and trip editing on each; computer acceptance does not establish phone acceptance.
- **Still to determine during test setup:** Actual browsers and phone platform; do not assume them from this device-order decision.

### D6 — Realistic, clearly labeled demo content

- **Status:** Confirmed by the Product Owner in the follow-up discussion.
- **Owner's words:** “agree” in response to using realistic, clearly labeled demo stores with attractive photos we have permission to use and enough variety for meaningful browsing and trip planning.
- **Decision:** Use that demo content for the first private test.
- **Ticket consequence:** Prepare a coherent sample catalog supporting discovery, photo browsing, saving favorites, opening-hours checks, and trip planning. Keep fictional content visibly identified and retain image-source/use-permission evidence. Determine the smallest sufficient dataset when writing the content ticket.
- **Evidence boundary:** Demo content can support experience and functionality testing; it does not prove real-store accuracy, owner participation, catalog maintenance, or actual shopping-day usefulness.
- **Scope boundary:** This selects test content; it does not authorize real-store outreach, unlicensed imagery, asset purchases, or public publication.

### D7 — Defer the final name; make the eventual rename comprehensive

- **Status:** Confirmed by the Product Owner in the follow-up discussion.
- **Owner's words:** “yes i just want to make sure when the name is changed it is changed every single reference.”
- **Decision:** Keep Antique Trail as the temporary working name through the private test; decide the final name later. When the name changes, the rename must address every reference rather than only the visible heading or logo.
- **Ticket consequence:** Before implementing a rename, inventory references across application screens, install/PWA metadata, page titles and sharing metadata, accessibility text, images/logos, email templates, printed/QR materials, documents, fixtures/tests, code/configuration, domains/URLs, and external service settings. Assign each reference a migration action and verification result; inspect rendered output as well as searchable text. Design linked small tickets from that inventory and a final completeness check.
- **Unresolved constraints:** Identify immutable historical records, third-party references, external settings, and any rename that would break stored data, existing links, authentication, or integrations; present an explicit handling proposal rather than silently omitting references or rewriting history. The inventory is required before promising exhaustive completion.
- **Authority boundary:** No final name is selected and no rename or domain purchase is authorized by this decision; apply the required plan amendment when the name is selected.

### D8 — Distinctive appeal is part of concept success

- **Status:** Desired outcome and experiential focus confirmed by the Product Owner; distinctiveness remains to be tested.
- **Owner's words:** “I also want to make sure our site / app is unique enough to capture the users.”
- **Decision:** Assess whether the site/app has a recognizable, compelling experience that attracts interest and gives people a reason to return, in addition to usability, appearance, and flow.
- **Ticket consequence:** Include a focused distinctiveness assessment of the D3 journey and record what users find memorable or compelling. Separate visual originality, asset provenance, practical value, and demonstrated user preference; none automatically proves the others.
- **Confirmed experiential focus:** The owner answered “yes” to emphasizing “the feeling of exploring interesting antique shops through photography, discovering favorites, and turning that inspiration into your own shopping day.” Use this as the review focus for existing approved capabilities; specific design amendments still need their own concrete proposal and required authorization.
- **Evidence boundary:** The desire for uniqueness is not evidence of market differentiation, legal clearance, or adoption. Persona assessments supply hypotheses and usability findings; broader preference claims require real-user evidence and comparable tasks.

### D9 — No out-of-pocket spending; later costs funded by site revenue

- **Status:** Confirmed budget direction from the Product Owner in the follow-up discussion.
- **Owner's words:** “until i get stores i need to be budget aware. once we have enough stores i am find spending money from what i am making from the site sells. i am trying to make this not cost me any out of pocket money”.
- **Decision:** Plan the private test and pre-revenue work with no new out-of-pocket spending. Once the site earns revenue, operating expenditure may be funded from that revenue rather than personal funds.
- **Ticket consequence:** Use existing available resources and assets with documented free-use rights; identify hosting, image, provider, model/tool, or operational costs before depending on them. Do not assume an existing subscription has spare capacity or that a free service prevents overage charges. Separate no-cost implementation from any unfunded external prerequisite.
- **If a required capability cannot be delivered within this budget:** Document the concrete cost and propose a smaller test or deferral; do not silently incur charges, waive safeguards, or claim the prerequisite is satisfied.
- **Later spending remains unresolved:** No dollar ceiling, revenue allocation, paid provider purchase, or activation is selected. Verify actual available revenue and agree a concrete spending limit before new financial commitments; store count or expected sales alone is not available funding.
- **Scope boundary:** This records the budget direction, not a claim that all launch requirements can be met at zero cost or authorization to change the approved monetization model.

### D10 — Revenue from upgraded store listings and photo space

- **Status:** Confirmed by the Product Owner in the follow-up discussion.
- **Owner's words:** “yes that is what i am planning” in response to clarifying that “site sales” means stores paying for upgraded listings and photo space, as currently planned.
- **Decision:** Retain the planned store-membership/photo-tier revenue model. The D9 revenue-funded spending direction refers to income from that model.
- **Ticket consequence:** Keep the first milestone focused on the Free private experience; keep paid activation and its provider/commercial requirements in separate later work. Do not introduce marketplace sales, commissions, or shopper charges from the phrase “site sales.”
- **Still unresolved for later commercial work:** Actual price/configuration approval, demonstrated store value, activation prerequisites, and the operating budget available from actual revenue. This confirmation sets none of those values and does not authorize live billing.

### D11 — Defer appearance-change decisions until the owner can experience the site

- **Status:** Owner has explicitly deferred judgment; no appearance change selected.
- **Owner's words:** “well i have not seen enough of the site and site flow to know if anything needs to change.”
- **Decision:** Do not infer a requested redesign or approval of the current appearance. The owner needs enough of the connected site experience to judge usability, appearance, and flow before choosing changes.
- **Ticket consequence:** Prepare the approved experience with the required functional repairs and representative demo content for an integrated computer-then-phone review. Keep specific redesign proposals separate from conforming repairs; bring concrete observed screens and flow problems to the owner when available.
- **Evaluation:** Use D2/D3/D8 as experience goals, not as evidence that the current design passes or fails. Record the owner's observations during the first complete pass, then derive bounded change proposals from that evidence.

## Verified remaining human requirements after D11

Checked against fetched `origin/main` at `63a47ac499c0b52e6af7c0601e5b627c26fa08f0`. These are findings, not additional owner decisions. Having enough product direction to draft repair tickets does not mean all human requirements for hosted testing or launch are resolved.

| Item | Verified requirement or uncertainty | When it matters | Next action |
| --- | --- | --- | --- |
| New private-test authorization | ADR0007 authority lasts only for the completed product-reset review; ADR0008 binds admission to the now-deleted backend `ykyrvqddgnfmgftjwpts`, named fixtures, and records lasting at most 24 hours with no automatic renewal | Before a replacement hosted environment or new hosted persona test; not before drafting ordinary conforming repair tickets | Prepare a concrete scoped plan-amendment proposal for the new owner-and-agent-only test, replacement backend/fixture binding, test duration/renewal, $0 limit, protection, and teardown; obtain the required owner direction before dependent execution |
| Later independent human acceptance | PRODUCT_DECISIONS “Internal Alpha before external participation” names the owner's wife as the Independent Internal Tester and requires her own account/phone; AI cannot substitute | Before completing that later acceptance stage or inviting external participants; not the owner's first solo pass | Retain the existing requirement unless the owner requests a specific amendment; confirm availability before scheduling that stage |
| External research and operating responsibility | Recruitment/consent, support/recovery ownership, professional/security/name/provider evidence and launch approval remain unresolved or unproved | Before their respective external activity or release, not unrelated implementation | Keep separate future outcomes; do not equate an archived gate issue with removed requirements |
| Free-hosting feasibility | D9 settles the budget, but current provider eligibility, available free capacity, and no-overage behavior still need live proof | Before resource creation/upload | Investigate first; return a concrete smaller-scope or deferral proposal only if the $0 path cannot satisfy the applicable requirements |

Demo-image clarification from current main: PRODUCT_DECISIONS “Internal Alpha before external participation” requires synthetic store content and excludes real names/logos/photos/reviews. D6's permission requirement does not supersede that restriction. Default to compliant existing synthetic imagery with documented provenance; any proposed use of real store photography needs separate reconciliation before use.

The archive-versus-gates discrepancy is relevant to later stages. The accepted ADR0007/0008 already separate owner-only assessment from H-01 dual signatures, full shared-stage recovery certification, and external-participant gates, but their old task/backend authorization cannot simply be reused for a different test.

## What the review means

The review recorded 2 failed scenarios, 5 partly completed scenarios, and 53 scenarios that could not be fully tested. Those are test outcomes, not a count of separate bugs. Several problems can affect one scenario, and one missing test prerequisite can block many scenarios.

The clearest reported defects affect trip privacy, staying signed in, store opening hours, editing trips, and whether a saved store looks saved. Other features still need testing with the appropriate accounts, services, or people. Passing automated checks did not prove the actual trip-editing database operations worked.

Some early deployment blockers were subsequently repaired. Read the final delivery and latest evidence before turning an older finding into new work. The temporary review environment was removed; another hosted test requires a suitable environment and its own authorization. The report's beta-health statement is a dated observation, not a fresh health check in this follow-up.

Live GitHub checked during this follow-up: no open issues; PR #211 remains open for an older project-state documentation change. Remote main is 63a47ac499c0b52e6af7c0601e5b627c26fa08f0; this checkout is at a different commit and contains untracked work. Ticket implementation instructions must be checked against current main before admission.

## Human choices, in the order they become useful

| Choice | What you actually decide | Recommendation | What depends on it |
| --- | --- | --- | --- |
| 1. Next milestone — decided (D1–D6, D8) | A dependable Free experience; owner plus simulated persona tests; computer then phone; realistic demo content | Success includes usability, appearance, flow, enjoyment, and distinctive discovery through trip building | Which outcomes belong in the first ticket set |
| 2. Release requirements | Whether to retain the existing safeguards and track them in smaller tasks, or propose specific changes | Retain the safeguards; replace the giant tracking issue with separate outcomes | External testing and launch preparation, not unrelated code repairs |
| 3. Research — first testers decided (D4) | Owner testing and simulated personas first; external interview arrangements remain undecided | Resolve outreach, consent, retention, and compensation only before actual recruitment | Later participant research, not private persona preparation |
| 4. Operating the service — budget decided (D9) | No new out-of-pocket spending; later spending funded by actual site revenue; operating roles remain undecided | Identify any unfunded prerequisites and assign operating roles before external reliance | Provider commitments, real-user operations, and release |
| 5. Visible behavior changes — judgment deferred (D11) | Owner must experience enough of the connected site before selecting changes | Prepare the approved experience; review concrete problems after the integrated pass | Specific design amendments, not conforming repairs |
| 6. Name — deferred (D7) | Keep the working name for the private test; eventual rename must account for every reference | Inventory and verify all references when the final name is selected | Final identity, domain, public materials |
| 7. Commercial direction — model confirmed (D10) | Stores pay for upgraded listings/photo space; paid activation remains later | Validate the Free experience first; settle prices and activation prerequisites separately | Commercial commitments and payment activation |

Archiving GitHub issue #56 did not establish that the release requirements were satisfied. Its September 5 comment says the formal ledger was descoped, while the controlling documents retain those requirements. Reconcile this discrepancy before dependent work; it does not require reopening the old giant issue.

You do not need to choose database permissions, technical login storage, or test implementations. The existing security and design documents already specify session storage and revocation. An engineer should first identify any actual conflict; restoring approved behavior is a repair, not a new product decision. Staying signed in while following links and returning after a browser restart are distinct cases to verify.

Changes to intended product behavior or release requirements need the explicit `update plan` direction required by PLAN_GOVERNANCE.md. Selecting repair priorities does not itself change the plan.

## Proposed repair tickets in plain English

These are candidate outcomes, not implementation-ready issues. Confirm each on current main, attach its exact requirement, and check existing closed issues before publishing it.

| Candidate title | A non-coder's definition of done | Review reference | Likely work group |
| --- | --- | --- | --- |
| Keep another person's trip details private, including repeated requests | Another account or a signed-out/revoked account gets no private trip details; the owner can safely retry | SEC-02 | Trip database; independent security review |
| Stay signed in while browsing stores | Open stores and return to the trip without being unexpectedly asked to sign in again | TL-02, hosted navigation result | Account/navigation |
| Restore a returning shopper's session according to the approved rules | Refresh/restart behavior follows the agreed contract; sign-out and removed access remain effective | TL-02 | Account/session; split diagnosis from repair if unresolved |
| Show today's hours using the store's local time | Near midnight, display the store's actual local day and hours | TF-06 | Catalog/hours |
| Distinguish a closed store from missing hours | A known closed day says closed; genuinely missing information remains unknown | TF-06 | Catalog/hours; sequence with the previous ticket if files overlap |
| Remove a stop from a trip and undo a newly added stop | The stop disappears as intended; another account cannot change the trip | TF-08 | Trip database |
| Change a stop's importance | The chosen priority survives reopening the trip | TF-09 | Trip database |
| Change how long to spend at a stop | The selected visit length survives reopening the trip | TF-09 | Trip database |
| Move a stop to a different position | The new order survives reopening the trip | TF-09 | Trip database |
| Show when a store is already saved | Browse and details agree with the person's saved-store list | TF-07 | Saved-store controls |
| Cancel sign-in and continue browsing | Cancel returns to a public page; successful sign-in still resumes the intended task | UI-01 | Account/navigation |
| Make verified-email links complete sign-in for the correct account | A valid link admits the correct person; expired/reused/wrong-account cases are handled safely | TF-02 | Account/session; provider evidence separate |
| Finish resetting a forgotten password | The new password works and required old-session/link restrictions hold | TF-03 | Account/session; provider evidence separate |
| Show the proposed trip order before accepting it | The person can inspect the actual stop sequence and keep their existing order | UI-03 | Trip interface |
| Provide useful installation instructions | The relevant device gets an install action or usable browser-specific instructions | TF-05 | Install page |
| Explain that New Since needs sign-in before opening it | A signed-out person sees the account requirement in navigation | UI-04 | Navigation |
| Connect the approved Free store-application flow | The normal application works in its permitted stage and remains unavailable when not permitted | TF-01 | Owner intake; split further if current-path diagnosis reveals multiple outcomes |

Trip-edit error recovery (UI-07), sign-out discoverability (UI-06), missing reviewer/admin workflow screens (TF-04/TL-01), and the initial catalog layout (UI-05) need requirement reconciliation before deciding whether they are repairs or design amendments.

Privileged-account setup (TL-03), session-check traffic (OPS-01), and remaining workflow coverage need bounded investigation/verification outcomes before speculative fixes. A version difference alone (TL-04) is not a defect. The earlier trip-creation/date-entry automation discrepancy must not become a bug ticket without current reproduction. Small grammar corrections (UI-02) and asset records/licenses/history (PV-01–04) form separate lower-priority work; unclear rights require evidence, not an assumed permission.

## Parallel work without tickets colliding

Proposed concurrent groups: account/navigation, catalog/hours, trip database, and saved-store controls. These are provisional groups until current-main file ownership is checked. Shared components, fixtures, migrations, and evidence files can create conflicts even when ticket titles differ.

Within each group, finish one small ticket before starting another that edits the same files. Use separate worktrees for independent groups. Trip privacy, removal, priority, dwell, and ordering remain distinct outcomes, but shared database setup/tests or migration dependencies can require an ordered merge. Do not label every trip fix as freely parallel.

Research preparation, asset-record investigation, and operating-cost worksheets can proceed independently where they need no contact, spending, or unsettled product decision. Full joined-up shopper acceptance follows the relevant repairs; each repair still owns its own focused proof.

## Making tickets suitable for a smaller model at low effort

Do the investigation and decisions before assigning implementation. Each ready ticket must include:

1. A plain-English problem and one visible result.
2. The exact approved requirement, current reproduction, and confirmed cause where known.
3. The specific code entry points, permitted scope, non-goals, and dependencies.
4. One to five observable acceptance checks, with exact commands and required setup supplied by the preparer.
5. Clear closure evidence: the change merged, its required checks passed, and its review resolved; separate any later human/provider proof.

If the cause or design is still unknown, create a small diagnosis outcome first instead of asking a low-effort implementation model to guess. Diagnosis can itself require a stronger model. Small size improves the chance of success; it cannot guarantee every security, session, or database change is safe at the lowest capability setting. Preserve required independent review and escalate when evidence shows the task exceeds that model's capability.

Example: **Show when a store is already saved**

- **Problem:** A saved store still offers “Save store,” making the person doubt whether saving worked.
- **Plan:** Attach the verified current saved-store requirement before issue admission; the review report alone is not authority.
- **Outcome:** The store's button accurately reflects this account's saved state.
- **Acceptance:** An already-saved store displays as saved; an unsaved store displays as unsaved; switching accounts does not carry over the previous account's state.
- **Verification:** Exercise the actual state-loading path and targeted browser behavior, then the required application checks; the issue preparer must provide runnable commands before assigning it.

## Evidence used

- REVIEW_PROGRESS.md and RESET_REVIEW_DELIVERY.md: final scope, counts, latest priority and teardown summary.
- CONSOLIDATED_FINDINGS.md and IMPROVEMENT_PROPOSAL.md: findings, later corrections, proposed outcomes.
- PLAN_RECONCILIATION.md, GATE_REGISTER.md, RESEARCH_PROTOCOL.md: unresolved requirements and human work.
- PLAN_GOVERNANCE.md, OPEN_TICKET_TODO.md, docs/agents/issue-tracker.md: ticket, review, and decision rules.
- SECURITY_AND_TRUST.md, “Session storage and next-request revocation”; DESIGN_SYSTEM.md, “Authentication screen flow”: existing session requirements.
- Live GitHub issue #56 comments and open issue/PR inventory: current backlog and archived-gate direction.

No application fixes, plan amendments, GitHub issues, provider changes, or outreach were performed by this worksheet.
