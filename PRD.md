# Product Requirements Document

Approved scope: 2026-10-06. Product Owner: “I approve this cleanup and scope.” [ADR 0012](docs/adr/0012-shopper-first-scope.md) records the decision and preservation boundary. This is the target product; existing deployment availability is separate.

## Purpose, people, and product promise

Find antique stores worth visiting, save and share them, build an outing, and remember where to return. Stores maintain useful listings and fund the ad-free service through optional photo plans.

The original problem is a couple collecting stores from websites and social media, transferring them into maps to plan a day, then needing private memories of what they found and whether they would return. The complete outing is the first product milestone.

## Brand and positioning

**Vintage Day Out** is the Product Owner’s selected product name. The name connects antique and vintage store discovery with the enjoyment of an outing; trip planning remains subject to its existing stage decisions. Exact marketing copy and stage limits are owned by [DESIGN Brand messaging](DESIGN.md#brand-messaging).

**Preferred domain candidate:** `vintagedayout.com`. Verisign RDAP returned HTTP 404, with no registration record, on 2026-09-28 ([lookup](https://rdap.verisign.com/com/v1/domain/vintagedayout.com)). This does not establish registrar purchase availability, ownership rights, or trademark clearance. Earlier name research also disclosed the [Vintage Day Out Picker](https://chromewebstore.google.com/detail/vintage-day-out-picker/ihmmbeknfbhlhcjfnoinnogpoioaidnb) and [Vintage Day Out event use](https://www.helenrollason.org.uk/shop/events/marvellous-vintage-2026/); selection does not claim exclusivity or clearance.

Before implementing a rename, inventory every reference across rendered screens, PWA/install metadata, titles/sharing/accessibility text, images/logos, emails, print/QR materials, documents, fixtures/tests, code/configuration, domains/URLs, and external settings. Give each reference a migration action and verification result, checking rendered output as well as source text. Record dispositions for immutable history, third-party references, and compatibility-sensitive values that could break data, links, authentication, or integrations. Do not mass-replace identifiers or claim completion until every item has a disposition and proof. A separate scoped implementation owns this migration and its proof.

The name selection itself authorizes no application-wide rename, homepage redesign, deployment, public promotion, domain purchase or spending. Preserve the approved visual identity and active work. Product sequencing and the target location/trip scope now follow [Stage dependencies](#stage-dependencies) below; their implementation and exposure still require separate bounded work and proof.


## What it is

A mobile-first React/TypeScript/Vite Progressive Web App, usable on desktop and tablet. Supabase supplies authentication, PostgreSQL and Storage; Vercel hosts the frontend. Stripe remains the selected provider for a later paid-photo launch. Installed users still use the web application. Docker is local/CI testing infrastructure, not a customer installation requirement or a prerequisite for ordinary frontend development.

## Core users

- Anonymous visitors browse and open shared public store links without an account.
- Shoppers sign in for favorites, trips and private memories.
- Store Owners manage an approved store listing; initially one responsible owner per store.
- Site Admin approves store authority and controlled changes and handles operational support. This grants no routine access to shopper-private data.

Visitor is an access state, not a fourth account type. Store access is scoped permission, not a reason to create duplicate identities. Existing roles/grants remain intact pending any separately reviewed migration.

## Core features

1. **Discover:** search by store name, town and category; optionally find nearby stores using explicitly requested device location and a radius such as 20 miles. Manual location works without permission. No advertising or behavioral profiling of anonymous visitors.
2. **Explore:** store details, hours, address/contact, description, photos/photo wall and simple store updates. Social links open externally.
3. **Favorite and share:** favorite a store, share its public link through normal sharing/text tools, open it and choose Favorite or Add to Trip. Sharing includes no private notes, rating, trip or account identifiers. An in-app recipient inbox is deferred.
4. **Plan:** create a dated day trip; Add to Trip from details, favorites or an opened shared store; choose an existing trip or create one. Add an unlisted shop as a private stop with name, address, optional source link and hours. Include browsing duration. Suggest a stop order using driving time and opening hours; allow manual adjustment and explain uncertain inputs.
5. **Visit:** follow the selected stops, explicitly hand each navigation leg to Maps/Waze, mark visits/skips and end the outing. No turn-by-turn engine, background location or automatic continuous replanning.
6. **Remember:** private 1–5 rating, notes, would-return choice and what was found. Free-text notes cover item details and personal recommendations; no inventory/collection subsystem or public rating is required.
7. **Maintain listings:** guided owner setup, verified claim and Site Admin approval; owners manage details, hours, approved photos, social links and simple updates such as store news. Sensitive facts and photos retain review protections.
8. **Fund the service:** Free listing and optional paid photo capacity. Photos occupy capacity until replaced or explicitly removed; no recurring monthly deletion. Prices and paid capacities remain unresolved and cannot block the first unpaid outing/owner evaluation.

## The connected shopper experience

One shopper favorites stores and sends public store links to another. The recipient opens those stores, adds them to a trip, includes any privately entered unlisted shop, reviews a suggested order and hours, visits, and records memories. Each shopper owns their favorites, trips and notes; a public store link shares no private state. One organizer controls each trip initially. Shared private trip views, partner editing and an app inbox are deferred.

## The store and administrator experience

A responsible owner creates or claims a listing, confirms store facts, establishes verified identity/MFA and receives exact-store approval. They maintain hours, details, photos and updates. Site Admin verifies authority and reviews controlled changes. Store teams, analytics and marketing tools are not requirements for this journey. Detailed owners: [authority](docs/specs/store-owner-authority.md), [onboarding](docs/specs/owner-onboarding.md), [photo plans](docs/specs/store-membership-spec.md).

## Next milestone: one complete shopping outing

Prove the following connected journey on computer and phone with admitted data/accounts:

- Wife favorites and shares several stores; recipient opens a shared link without signing in and successfully adds its store after sign-in.
- Recipient creates/reuses a trip and adds an unlisted stop without creating a public listing or owner relationship.
- A suggested order accounts for driving, browsing duration and known hours; the shopper can keep or change the order. Missing hours, permission denial and routing failure remain understandable and recoverable.
- During a real outing, navigation opens the intended store, visits/skips can be recorded, and private memories survive reopening.
- A permitted store owner can set up and maintain their listing, hours, photo wall and a simple update; Site Admin approval and cross-account/store denial work.
- Record actual friction, failures and whether the couple would use it again. No invented time-saving percentage or market validation. Privacy, authorization, accessibility and data-loss failures must be fixed before accepting the affected journey.

## Stage dependencies

1. Reconcile source and missing connections against this scope; produce small implementation contracts with resolved behavior and runnable proof.
2. Verify the connected journey locally with synthetic data and real local service boundaries where applicable.
3. Conduct an explicitly admitted real outing and owner evaluation with applicable hosting, account, media, routing, privacy and recovery evidence.
4. Decide the paid offer using observed owner value and operating cost, then verify billing and obtain explicit paid activation.

The existing catalog-only public test is a separate maintained exposure. This amendment does not enable trips, registration, location, owner intake or payments there. A showcase alone is not acceptance of the complete outing. Regional expansion, public reviews, team/offline completeness and live billing are not prerequisites for the unpaid milestone.

## Deferred implementation boundary

Defer AI item research, consumer subscriptions, public reviews/ratings/replies/appeals, simultaneous trip editing, Navigator transfer, mutable offline synchronization, owner teams, advanced analytics/promotions, regional/community programs, custom billing schedules/paid-to-paid transitions, dedicated weekend grouping, native Android packaging, taste profiles, collections, automated external-site extraction and in-app recipient sharing.

Separate daily trips can represent a weekend initially. First scope is online-first; PWA installation does not promise offline private writes. Preserve existing code, records, permissions, subscriptions and retained-data obligations. No blanket deletion, rewrite, gate removal or new implementation assignment follows from this documentation approval.

## Non-goals

Scope guard: proposed work must directly support the connected outing, basic owner listing management, or a necessary safety/retained-data obligation. A historical checklist or available technology alone is not justification. Detailed memory and destination behavior belongs to [capabilities](docs/specs/product-capabilities.md); unresolved provider and interface choices remain bounded planning inputs, not permission to grow the feature set.

Advertising, paid placement, marketplace transactions, turn-by-turn navigation, background tracking and a social network are outside the product. Paid storage never buys shopper data, ranking or approval.

## Public test publication

The existing bounded test remains governed by [ADR 0010](docs/adr/0010-free-public-test-publication.md) and [public test admission](docs/operations/PUBLIC_TEST_ADMISSION.md), with canonical entry `https://antique-trail.vercel.app/`. Its actual enabled capabilities require current evidence; scoped saved-account wording in older receipts is not permission to enable saving or registration today.

[ADR 0011](docs/adr/0011-market-at-macvicar-public-listing.md) retains the exact Market at Macvicar listing, media and provider boundaries. This scope approval does not publish that listing, activate its benefit or widen any account grant.

## Provider and external-action prerequisites

Applicable hosting, email, routing, media, audit and support prerequisites remain for their actual exposure. Use [security](SECURITY_AND_TRUST.md) and the relevant operational runbook. Do not require a deferred feature's provider or historical cohort to prove an unrelated selected capability. Approval here grants no deployment, spending, provider mutation, external communication or data cleanup.

## Assessment environment boundary

Local synthetic proof, configured local services, hosted/provider proof, canonical production and human observations are distinct. Preserve current public-test restrictions and all existing data until separately reviewed implementation and activation authorize a change.

## Human usability acceptance

Evaluate the actual computer/phone journey and applicable assistive-technology behavior, including permission denial, sign-in interruption and safe recovery. Record failures and Product Owner continue/revise/stop disposition. A fixed historical cohort count or a complete synthetic owner business suite is not a prerequisite for this first evaluation. WCAG 2.2 AA and the approved design system remain required.
