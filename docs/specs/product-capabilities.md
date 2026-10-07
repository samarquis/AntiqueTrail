# Product capability reference

Current target: the 2026-10-06 approved shopper-first scope in [PRD](../../PRD.md). This file owns detailed capability behavior. Design, security and engineering keep their separate owners. Prior large-program behavior is available in [the pre-cleanup source](https://github.com/samarquis/AntiqueTrail/blob/d075998137c501c6ff7252880ad59500e59bec16/docs/specs/product-capabilities.md); it is not a second current queue.

## Stage applicability

Discovery, favorites/public-store sharing, Add to Trip, day planning, navigation handoff, private memory and simple owner/admin listing management are the target. Existing catalog-only exposure remains restricted. No complete team, analytics, promotion, public-review or offline suite is required even in synthetic testing. Retained data/reachable behavior keeps its protections. [PRD stages](../../PRD.md#stage-dependencies) owns progression.

## Working title

The selected name and migration boundary are in [PRD Brand and positioning](../../PRD.md#brand-and-positioning).

## Product type

Mobile-first web PWA with desktop/tablet support. Installation is optional. Online-first private actions; no promise of offline mutation or multi-device synchronization. Native packaging is deferred.

## Age-inclusive usability requirements

Apply [DESIGN_SYSTEM](../../DESIGN_SYSTEM.md#age-inclusive-usability-baseline), including keyboard, screen-reader, readable errors, non-drag ordering and safe draft recovery. No separate age mode or prerequisite preference survey.

## Public store directory

Show name, description, address, verified location, regular/exception hours, contact, official social links, categories, approved photos, store updates and provenance/freshness. Public reviews, aggregate ratings and personal match scores are deferred. Missing photos use a neutral placeholder rather than hiding a valid listing.

### Store data provenance

Owners confirm their own facts. Other public listings use manually verified public facts with source, verifier and verification date. Do not copy descriptions/media/reviews without permission, scrape or bulk-import sources, or turn a shopper's private stop into an approved listing. The existing [Macvicar exception](../adr/0011-market-at-macvicar-public-listing.md) keeps its exact approved boundaries.

### Listing freshness

Display freshness follows [DESIGN_SYSTEM](../../DESIGN_SYSTEM.md): “recent” for at most 30 days, then the date and “Verification overdue”; missing/invalid date shows “Freshness unavailable”. Existing server discovery eligibility (180-day verified interval, warning/exclusion from automatic ordering after day 180, normal-discovery hiding after day 365) is a separate retained rule, not a competing display label. A report triggers review immediately; never delete provenance automatically. Reconciliation must test both semantics before changing runtime behavior.

### Discovery and location

Anonymous browsing supports name, town, category and manual area. Optional Use my location requests permission only on explicit action and filters around that position using a chosen radius (20 miles is an example, not a mandatory default). Denial/unavailability falls back to manual entry without blocking browsing. Do not store movement history or use location for advertising. An area-centroid distance is not a claim of distance from the device.

### Official Store Profile Photos

Photo wall and details use approved media only. Require rights confirmation, meaningful alt text, validation, re-encoding, metadata stripping and review. Preserve the current approved image while reviewing a replacement. [Membership](store-membership-spec.md) owns capacity; no monthly automatic deletion. Existing exact-store curated admission does not authorize general uploads.

### Store Updates and official social links

New Finds, Sale, Announcement and Store News cover simple owner updates, including shop pets such as Carl the cat. Text publishes directly; an image-bearing update waits for its image approval. Sale requires an end date and auto-archives; other updates may be manually archived. Show latest three with See All. One image per update uses existing media controls. Official social links open externally; no scraping, embedded feed or social credentials. No separate social-network or promotion subsystem.

### Corrections

Keep existing public-test draft-only behavior and server denial. An admitted account may submit a correction only when its environment explicitly permits it; own status only, no internal case details. Reporting never silently edits a listing.

## Store categories and attributes

Reuse existing store categories, including furniture, architectural salvage, primitive, mid-century, china/pottery, copper/brass, books, tools and collectibles. More taxonomy, taste surveys and preference learning are deferred. Category information helps discovery without inventing a personalized match score.

## Favorites and store sharing

Favorite is the user-facing concept; existing Saved stores terminology/data refers to the same collection, not a second collection. Favorites are account-private. A store's Share action shares only its canonical public URL and safe public title through platform sharing or Copy link. A recipient can open it anonymously, then Favorite or Add to Trip with just-in-time sign-in. Sharing a store grants no access to either person's account, favorites, private rating, notes or trips. No recipient-email lookup, app inbox, delivery status, contact graph or share-payload retention is required.

## Candidate-link capture and Trip Ideas

For a store outside the catalog, the organizer can enter a private stop: name, address, optional source URL, optional hours and browsing duration. Validate address/location before treating it as a reliable navigation destination; missing hours remain unknown. A pasted URL is a reference, not permission to fetch, scrape or authenticate to a third-party site. Existing automated extraction and recipient-sharing code is retained but deferred. Creating a private stop publishes nothing and grants no store relationship. Private-stop details/notes remain accessible only to the organizer.

## Today's Trip requirements

### Add to Trip

Available from store details, favorites and a shared store landing page. Open an explicit chooser for editable existing trips or New trip, retaining the selected store through sign-in/setup. Success names the trip and offers View trip/Undo. Cancellation or failed authentication writes nothing. Retry must not create duplicate trips/stops. Explicitly confirm an intentional repeat visit rather than silently duplicating on retry.

### Day planning

One organizer, one shopping date and a set of catalog/private stops. Preserve existing one-to-eight active-stop limit for the first implementation. Each stop has editable duration (default 60 minutes; 30/45/60/90/Custom) and accessible manual ordering. Set departure/start location explicitly; optional account address is never auto-applied. Distinguish local store time zones and dated hours.

### Suggested order

Suggest an order using driving time, browsing durations and known opening hours. Explain missing/stale hours and impossible schedules; estimates are not guarantees. Shopper explicitly chooses Use suggested order or Keep my order. Never silently reorder or claim a mathematically optimal route. Missing routing service leaves manual ordering and hours review usable, labeled Travel time is not included; that fallback does not pass acceptance for the suggested-order capability. No continuous automatic replanning.

### Destination and routing inputs

Confirm each stop's destination before enabling Navigate or including it in a driving-time suggestion. Unresolved addresses may remain drafts; never silently choose an ambiguous match. Preserve a private stop's entered name, address, optional source URL, hours and duration. Unknown hours/time zones remain explicit uncertainties.

Use the selected date, departure time and explicit start location with an admitted routing adapter. Disclose location use; do not send private notes, ratings or source URLs to routing providers. Provider, configuration and exact RPC/data mapping must be resolved in the implementation contract before READY; this requirement is not evidence that an adapter exists or is admitted. Failure preserves the current order and offers manual ordering/hours review without travel-time claims.

Recheck catalog availability when adding a shared store. An unavailable store adds nothing and preserves the existing trip; creating a private stop is a separate explicit choice. Navigation hands off the confirmed destination, with Copy address/map link fallback. Returning from Maps does not mark a visit automatically.

### Visit controls

Explicit Navigate opens Maps/Waze for the selected stop. User confirms arrived/done/skipped; no tracking or geofencing. End early and reopen history. Keep private notes safe on network failure; do not claim server persistence or queue offline commands silently. Mutable offline work and shared Navigator authority are deferred. Existing signed-grant dependencies require a reviewed simplification contract before runtime removal.

## Rating model

One first-release rating: an optional account-private 1–5 store/visit rating. Include No/Maybe/Yes would-return and a note for finds, categories and personal recommendation. Never publish or include private fields in store shares. Public aggregates and personalized match scores are deferred.

## Private content lifetime

### Finding and revisiting memories

Keep the existing store-level personal summary distinct from individual stop/visit memories. Editing a summary is explicit; later visits never overwrite earlier visit notes or the summary automatically. Completed trip history opens its stop memories; store details and Favorites provide access to the shopper's store summary and visit history.

Private unlisted stops support the same rating, would-return and note fields without requiring a public store ID. Retain entered name/address with the memory; no automatic cross-trip matching, public listing conversion or collection subsystem. Removing a favorite or draft stop does not delete previously saved visit memories. An unavailable public listing does not erase private history. Explicit deletion and account lifecycle still apply.

Acceptance: save a brass-item note and would-return choice, reopen in a later session, record a later visit, and recover both memories without overwrite; another account cannot read either. Repeat for an unlisted stop. These are target checks, not claims of passing runtime proof.

### Retention

Favorites, trips, private stops and memories remain private until explicit deletion/account lifecycle applies; age alone does not expire them. Reopening retains saved memories. Existing export, deletion, recovery and account-switch protections remain; [security](../../SECURITY_AND_TRUST.md) owns their mechanics.

## Business accounts

One responsible Store Owner per store for new scope; verified email, MFA, verified authority and Site Admin approval. An existing person may retain independent grants for multiple stores; this creates no new team-management requirement. Existing Representative/team grants are not deleted by the plan. [Authority](store-owner-authority.md) owns exact boundaries; [onboarding](owner-onboarding.md) owns guided setup.

## Store Representative portal

The existing portal is reusable for the Store Owner journey: listing details, hours, photos, updates, links, pending changes and access/help. Clearly label direct versus reviewed publishing. Review name/address/ownership/permanent closure/categories/photos before publication; preserve current approved values. Hours, phone, website, description, temporary closure and official links use existing direct rules. No team, analytics, advertising, review-reply or custom billing requirement.

## Administrator workspace

Review owner authority, listing changes and images; handle support and exact-store access. Show requested versus current values, require reasons for rejection/revocation, preview effects and audit privileged attempts. No bulk approval, no editing owner-submitted values behind their back, no routine shopper-private access. Existing emergency/recovery obligations remain separately controlled.

## Membership

Free participation and optional paid photo capacity support an ad-free product. [Membership spec](store-membership-spec.md) is the only capacity/commercial owner. The first real outing and unpaid owner evaluation do not require billing activation. Existing billing data/obligations remain protected.

## Deferred capabilities

Use [PRD deferred scope](../../PRD.md#deferred-implementation-boundary). Historical detailed contracts are preserved at the pinned pre-cleanup source above for compatibility analysis, not new implementation assignments. Existing reachable paths retain authorization, privacy and lifecycle controls until safely retired through a separate change.
