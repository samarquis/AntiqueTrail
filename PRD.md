# Antique Trail product requirements

Status: store-first product direction authorized 2026-09-11 by the Product Owner: **`update plan to the proposed store-first PRD`**. Effective on reviewed merge of #346. This amendment changes intended scope and stage requirements; it performs no application implementation, deployment, outreach or billing activation.

## Purpose, people, and product promise

Help antique stores present their shop and interesting merchandise through trustworthy information and photographs. Shoppers explore without an account. Approved store representatives maintain their listing and may later buy a larger photo gallery. The immediate test is whether this showcase is useful to the owner, shoppers and participating stores.

Retain React/TypeScript/Vite, Supabase Auth/PostgreSQL, Stripe, and the approved visual identity. Use one account system with server-enforced permissions. Do not rebuild authentication, payment collection or the gallery without evidence of a specific defect. Design remains mobile-first and age-inclusive; the owner evaluates computer first, then phone.

## People and permissions

| Person or state | Permitted experience | Boundary |
| --- | --- | --- |
| Anonymous visitor | Browse/search; details, approved photos, hours and official links | No sign-in or location permission needed to browse. |
| Registered shopper | Sign-in and optional private saved stores | Own private data only; registration grants no store authority. |
| Store applicant | Own invitation/application and draft | No representative grant or publication before independent approval. |
| Store representative | Permitted details, hours, photos and membership of the approved exact store | Existing verified-email, MFA, recent-auth where required, admission and server-side scope controls remain. |
| Administrator | Approve listings/claims/photos, handle corrections/support and manage exact-store authority | Separate privileged session, no self-approval or default shopper-private access. |

An applicant is an account state, not a separate login system. Roles never grant unrelated-store access. Privileged revocation, auditing, privacy, content rights and moderation remain mandatory under [SECURITY_AND_TRUST.md](SECURITY_AND_TRUST.md).

## The connected shopper experience

1. Browse/search without signing in. Open a store, see permitted photographs, truthful details, full hours and official contact/directions links.
2. Return to useful browsing context. Missing information, failed media and sparse galleries stay understandable.
3. Optionally save a store. Just-in-time sign-in preserves the interrupted action and context; cancellation writes nothing.

Trip building, partner handoff, route optimization, Go/offline navigation, public reviews and private visit history are deferred from this milestone. Their existing code and findings remain recoverable; they are not showcase prerequisites. See [deferred implementation boundary](#deferred-implementation-boundary).

## The store and administrator experience

Start with the existing invited-store onboarding variant: consent → verified account/MFA → own draft → independent authority/listing approval → exact scope and Free → first Portal use. The representative updates permitted facts and submits photos; the interface distinguishes direct publication from reviewed fields/media. The administrator approves permitted content, which then appears on the listing.

Public self-service claim/add intake is a later, separately approved pilot extension if invitation-assisted onboarding suffices initially. Neither an application nor payment grants publication or Administrator authority. Detailed behavior lives in [business accounts](docs/specs/product-capabilities.md#business-accounts), [owner onboarding](docs/specs/owner-onboarding.md) and [membership](docs/specs/store-membership-spec.md).

## First offer

Free retains cover plus five approved gallery photographs, without a subscription charge. Initially offer only paid Gallery: cover plus fifteen approved gallery photographs. The owner selected larger galleries first; featured placement is deferred. Payment buys capacity, never ranking, reviews, verification, moderation outcomes or shopper data. Prices are unset until the separate commercial decision.

Use Stripe-hosted Checkout, supported customer-portal management and verified webhooks. The server binds the exact store/customer/subscription, approved price and consent; only verified events apply paid entitlements. Failed or cancelled Checkout preserves Free. Retain cancellation, failed-payment, refund, photo-limit and reconciliation behavior in the [membership spec](docs/specs/store-membership-spec.md).

Do not offer Full Gallery or new custom paid-to-paid changes in the initial pilot. Preserve existing code and servicing duties for any verified incumbent obligation; inspect actual provider state before a later migration or disabling servicing. A Gallery membership does not authorize a hosting upgrade, R2 migration, new storage-retention rule or spending.

## Next milestone: usable internal store showcase

Use an exact recorded build, existing clearly labeled fictional stores and permitted synthetic imagery. The owner attempts Browse → store → photos/details → return, followed by one representative edit and one Administrator approval demonstration, on computer then phone. Existing favorites may be evaluated separately. The goal is a usable, understandable showcase and concrete feedback, not completion of every implemented feature.

Present the showcase through the stage-specific composition and action hierarchy in [Store-showcase presentation](DESIGN.md#store-showcase-presentation). Evaluate whether shoppers can discover a distinctive store, reach its photographs and practical visit details, and return to browsing. Preserve the approved identity; appearance changes are bounded to these named presentation improvements.

### Evaluation scope and evidence

Reuse existing local fixtures and evaluation packets; do not generate a new content library or testing framework without a demonstrated gap. The existing fixture-only 50-photo profile remains an optional, clearly labeled internal evaluation profile under [DESIGN.md](DESIGN.md#fixture-only-50-photo-evaluation-profile), never the Free entitlement. Use realistic synthetic data without real logos, names, reviews or implied affiliation.

Record exact candidate/fixture, routes, setup, each observed transition, errors and limitations. Identify fixture-backed actions versus actual local Auth/Edge/RPC behavior. Simulated personas are hypotheses, not recruited humans or proof of demand. No screenshot or fixture pass establishes backend, deployed or provider acceptance.

### Evaluation acceptance and disposition

1. The named build and routes start reproducibly and the selected shopper/representative/admin transitions have scoped browser evidence. A broken selected-path transition is recorded and fixed or explicitly excluded from the demonstrated claim.
2. The owner attempts the computer-then-phone journey and records actual usefulness, clarity, appearance, ease, problems and a reasoned continue/revise/stop decision.
3. The handoff supplies the command or verified permitted URL, access/setup steps, source identity, fixture/service distinctions and known limitations.

Do not withhold a safe, bounded internal candidate until unrelated trip work or a whole-product persona score is complete. Selected-path privacy/authorization/data-loss failures block that unsafe path. Repository preparation and firsthand observations close in separate issues.

### Assessment environment boundary

The default showcase is local and synthetic. This amendment grants no new shared-hosting, provider, real-data or external-participant authority. ADR0007/0008 retain their original limited task/backend/expiry scope; old receipts are not renewed. Any hosted review requires valid current, appropriately scoped authorization and protection. See [ADR0009](docs/adr/0009-store-first-stage-applicability.md).

## Following milestone: small real-store pilot

The owner selects the bounded participants, store set, exposure, duration and stop/support owners in an explicit pilot decision. Use invited onboarding first. Before real use, satisfy the applicable hosting/account/email, consent/content-rights/media, exact-store authorization, auditing, backup/recovery, support, security and accessibility evidence in [store-first stage applicability](SECURITY_AND_TRUST.md#store-first-stage-applicability). Existing provider/funding controls still apply.

The pilot receipt binds a reviewed route/capability inventory, candidate/config/schema, permitted participants/data and passing applicable evidence. Unapproved routes and commands must deny at the server boundary, not merely disappear from navigation. Existing closed server predicates stay closed until a separately reviewed implementation supports this stage; do not forge old regional receipts. Public indexing/discovery, self-service acquisition and promotion require their own exposure decision and public controls.

No trip benchmark, complete regional package chain, public-review system, RG-01 or community expansion is a prerequisite to this bounded pilot. This does not waive controls for functionality actually exposed or retained data.

## Following milestone: paid Gallery pilot

Require an approved exact Gallery offer and terms, permitted owner feedback, authorized Stripe test-mode purchase/portal/cancellation/failed-payment/webhook evidence, entitlement isolation, refund/support/recovery handling, verified incumbent obligations and explicit live activation approval. Bind these to the exact pilot scope, candidate, immutable commercial configuration and current applicable provider/security/CI evidence through [Package 13](PACKAGE_CONTRACTS.md#package-13--photo-tier-memberships-moderation-and-staged-off-billing).

Regional launch, RG-01 and three community expansions are removed as prerequisites to this bounded first offer. Full Gallery acceptance and new paid-to-paid changes are not first-offer requirements. Applicable existing-servicing obligations remain. Private commercial research, authorized provider testing, public price display and live charging are distinct states; research or this amendment alone permits no Stripe call or charge.

## Stage dependencies

| Stage | Necessary predecessor/evidence | Does not require |
| --- | --- | --- |
| Local internal showcase | Reproducible synthetic candidate and selected-path checks | New hosting, real participants, trips, routing or billing |
| Controlled real-store pilot | Owner scope decision; selected-path and applicable real-data/security/operations evidence | Full regional program, public reviews, geographic expansion |
| Paid Gallery pilot | Approved offer; permitted owner evidence; authorized test-provider and entitlement/servicing proof; explicit live activation | RG-01, three communities, Full Gallery sales, custom paid-to-paid features |
| Public discovery/acquisition or wider release | Separate approved exposure and relevant public security/legal/accessibility/operations evidence | Automatic activation from completing any previous row |

Each gate owns only its named evidence. An external gate blocks the relevant activation, not safe repository work. One independently closable code outcome per ticket, usually two or three observable criteria; real shared-file/service seams determine parallelism. Preserve active reviewed PRs rather than splitting completed code for ticket-count targets. [PLAN_GOVERNANCE.md](PLAN_GOVERNANCE.md) continues to control amendments, review and closure.

## Provider and external-action prerequisites

Supabase and Stripe remain selected; Vercel/Supabase topology and provider eligibility/funding controls remain under ADR0005/0006 as narrowly scoped by ADR0009. Relevant H-01 hosting/recovery, L-01 shared privileged audit, E-01 real email, M-01 real media, S-01 legal/trust and HC-01 human support obligations are not waived. R-01 is unnecessary when routing is unexposed. Public B-01/SEC-01/HC-02 duties apply before their named public exposure. Missing applicable evidence is unavailable, never implicitly passed.

An accepted plan is not provider configuration, legal consent, participant recruitment, permission to spend, deployment or billing activation. Existing default-off controls remain until conforming implementation and real approval. Local, synthetic, hosted-CI, provider, production and human evidence remain distinct.

## Human usability acceptance

The owner provides actual computer-then-phone showcase observations. The controlled pilot's owner-approved protocol names participants and accessibility needs appropriate to its selected paths; no simulated person supplies their evidence. Existing eight-person public/cohort procedures apply to the later public exposure and its exposed capabilities, not as a prerequisite to showing the internal candidate. Preserve actual keyboard, screen-reader, touch, zoom and error-recovery checks for selected paths; do not call a screenshot human accessibility proof.

Before public exposure, test the exposed shopper capabilities with at least eight participants aged 55+, including at least three aged 70+ and at least two with relevant low-vision, motor or assistive-technology adaptations. At least 90% of required tasks must complete unaided, with no more than one average noncritical error per participant and zero safety, privacy or authorization failures. Fix and retest repeated critical failures. This is the current owner of those public shopper thresholds; the separate public owner-acquisition protocol remains in the membership spec. Neither cohort is an internal showcase or bounded invited-pilot prerequisite.

## Deferred implementation boundary

Preserve code and findings for trips/partner sharing, route planning, Go/offline navigation, Candidate Share, public reviews, private visit histories, community expansion, Full Gallery sales, featured placement, personalization, households, collections and Android packaging. These are later options, not promises to build now. The previous SLM-01/Regional program and its dated decisions are historical planning profiles for this reset, not the current queue. Reconsider them only after pilot evidence and a scoped decision.

Never erase incumbent obligations or weaken access controls because a capability is deferred. The pilot inventory must show each deferred path disabled, safely isolated or independently accepted for the expressly authorized exposure. Hiding links alone is insufficient. No empty scaffolding or speculative future tickets.

## Evidence that decides further investment

Continue when the owner can use the showcase, permitted owners can maintain useful listings and feedback supports testing the priced Gallery offer. Revise if the path is confusing or the offer lacks value. Stop expansion for core-path privacy, data-loss or payment-correctness failures, or absent owner value. Record the reasons and next bounded investment; do not add features merely to postpone feedback.

## Decisions still needed

The actual pilot participants/exposure/hosting, Gallery price and commercial terms, applicable provider and operational evidence, public brand/domain and any funded infrastructure require their named decisions. No prices, new spending, real outreach or live services are authorized here.

## How to use the detailed plan

[Product capability reference](docs/specs/product-capabilities.md) owns detailed current/deferred capability semantics, including Store Browser/details, business accounts and retained trip rules. [DESIGN.md](DESIGN.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [SECURITY_AND_TRUST.md](SECURITY_AND_TRUST.md), [PACKAGE_CONTRACTS.md](PACKAGE_CONTRACTS.md), membership, onboarding and accepted ADRs retain the exact ownership boundaries in [README.md](README.md#source-precedence). This PRD alone owns current scope and stage progression. Historical evidence cannot activate a stage.

The former full PRD remains recoverable at [f182871d](https://github.com/samarquis/AntiqueTrail/blob/f182871d9de0d5db2a30ad0de9ac8dc72467648b/PRD.md). The approved proposal and review are in [the September 11 review](docs/research/scope-review-2026-09-11/REVIEW.md). Live issue/PR status stays in GitHub.
