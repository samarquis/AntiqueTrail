# Product Requirements Document

## Purpose, people, and product promise

Antique Trail makes a fun day of antique shopping easy to see, easy to plan, and easy to trust. It brings store discovery, trustworthy details and photographs, hours-aware trip planning, navigation handoff, and private visit memory into one connected experience.

The product serves individual shoppers and explicitly invited trip partners, with separate Store Representative and Administrator workflows that keep listings useful and trustworthy. Design first for shoppers roughly 50-80+ while keeping the product usable by all ages; [primary users](#primary-users) and [age-inclusive usability](#age-inclusive-usability-requirements) retain the full requirements. It is a public, multi-user PWA, with mobile-first design and desktop/tablet support; a later Android package remains possible.

The intended memorable experience is exploring interesting antique shops through photography, discovering favorites, and turning that inspiration into a shopping day. Usefulness, ease, appearance, natural transitions, enjoyment, and a reason to return are desired outcomes. They are not evidence of market demand or demonstrated differentiation.

## The connected shopper experience

1. **Discover shops.** Open directly into readable, list-first browsing, search by name, town/area, or category, and explore without signing in or granting device location. Photos invite exploration while freshness and hours help the shopper judge the information. See [Store Browser requirements](#store-browser-requirements).
2. **Look closer.** Open a store to explore its permitted gallery, details, full hours, official links, and provenance, with a clear route back to browsing. Missing information and neutral photo fallbacks remain understandable. See [Store details requirements](#store-details-requirements).
3. **Keep a favorite or start a day.** Save a store or add it to a chosen/new trip. If sign-in is needed, preserve the selected store and interrupted action; successful sign-in completes the permitted action and returns to context, while cancellation writes nothing. See [shopper entry and authentication](DESIGN.md#shopper-entry-browsing-and-authentication).
4. **Build a usable trip.** Choose a date, arrange stops, set priorities and visit lengths, and review hours. Manual planning works without provider-backed routing; travel-time or suggested-order claims require the separately approved provider capability. The shopper controls changes. See [Today's Trip requirements](#todays-trip-requirements).
5. **Share and use the day when that stage is available.** An explicitly invited partner can access that one trip; one Navigator/device controls Go and hands the current leg to external navigation. Handle interruptions, offline recovery, and stop changes without losing private work. See [shared-trip handoff](DESIGN.md#shared-trip-handoff) and [Go mode](DESIGN.md#go-mode).
6. **Remember the visit privately.** Retain personal ratings, notes, and visit memory for the author, with the approved deletion and account controls. These remain separate from public ratings, future match scores, and store/administrator data. See [rating model](#rating-model) and [private content lifetime](#private-content-lifetime).

Each capability must work on its own and at its transitions into adjacent steps. Detailed interaction acceptance lives in [Implementation acceptance journeys](DESIGN.md#implementation-acceptance-journeys); the first owner walkthrough focuses on discovery through photos, favorites, and trip building.

## The store and administrator experience

Store Representatives maintain verified details, hours, updates, photos, and support requests for their exact store. The interface distinguishes direct publication from changes requiring independent Administrator approval. Administrators handle applications, corrections, moderation, support, and exact-scope access without default access to shopper-private activity.

The [business-account requirements](#business-accounts) connect these roles to a trustworthy catalog. [Owner onboarding](docs/specs/owner-onboarding.md) owns the detailed invited-owner interaction variant; [store membership](docs/specs/store-membership-spec.md) owns exact acquisition and commercial mechanics. Public Free applications remain a separately gated variant, and neither an application nor payment grants publication or administrative authority.

## Next milestone: Free private experience evaluation

The next milestone is a dependable Free private concept evaluation by the Product Owner, supported by agent-run tests. Prioritize discovery, store/photo exploration, saving favorites, and building a trip. The purpose is to judge whether the connected experience is useful, understandable, appealing, enjoyable, and worth returning to before choosing appearance changes or investing in later stages.

### Evaluation scope and evidence

- The owner tests on a computer first and a phone second, with separate observations for each; select actual browsers and phone platform during test setup. This order does not replace mobile-first product design or the later device/accessibility matrix.
- Prepare simulated personas covering the approved shopper, partner/Navigator, Representative, and Administrator roles and relevant device, accessibility, and digital-confidence variations. Cover the shopper journey first and retain broader role coverage for subsequent tests. Do not infer ability from age alone.
- Use realistic, clearly labeled fictional stores and permitted synthetic imagery with recorded provenance, enough variety to exercise photos, favorites, hours, and trip planning. Existing synthetic-content restrictions still apply; no real names, logos, photos, reviews, or implied affiliation. Dataset size and actual setup must fit the separately authorized fixture scope.
- Record actual software behavior, simulated-persona hypotheses, and the owner's firsthand feedback separately. Persona reactions do not count as recruited-participant evidence, and one owner's experience does not prove wider demand or replace later independent research.
- A long visit is not success by itself: confusion also takes time. Record hesitation, interruptions, lost context, what attracts interest, whether transitions make sense, and the owner's stated desire to continue or return.

### Evaluation acceptance and disposition

1. Record the owner's actual completion, failures, and interruptions across discovery, photos, favorites, and trip building on computer and then phone.
2. Record usefulness, readability/presentation, ease, flow, enjoyment, memorable elements, and return intent with the owner's reasons; the owner chooses `continue`, `revise`, or `stop` for the next bounded investment or revision.
3. Map persona tasks to approved roles and relevant device/accessibility variations, keeping simulated opinions distinct from actual participant observations.
4. Keep actual server-path, authorization, and account-isolation proof distinct from fixture/browser simulation; missing evidence stays incomplete. Security/privacy/data-loss failures cannot be waived by a positive experience judgment.
5. The disposition applies only to this evaluation and its next bounded decision; it does not pass SLM-01, full Internal Alpha, external testing, public release, or paid activation.

Appearance judgment is deferred until the owner experiences the connected journey. Evaluate the existing approved design first; this milestone approves neither a redesign nor acceptance of the current appearance. Specific later changes to layout, palette, typography, interaction, or copy require their own concrete amendment. The analogy to immersive social browsing expresses enjoyment, not a video feed, endless feed, recommendation algorithm, or new feature requirement.

### Assessment environment boundary

Selecting this milestone does not supply a hosted environment or authority to create one. ADRs [0007](docs/adr/0007-protected-internal-synthetic-review.md) and [0008](docs/adr/0008-governed-internal-synthetic-admission.md) describe only the earlier task-specific assessment and its exact backend/admission constraints; they cannot be reused as permission for this new test. Before any replacement hosted test, prepare and obtain a separate scoped amendment for resource eligibility/capacity, operator identities, fixture/backend binding, duration/renewal, protection, expiry/revocation, and teardown. No new spending or external participation is authorized here.

## How to use the detailed plan

The remaining sections specify capability outcomes, product-wide commitments, later stages, and deferred choices. Each requirement has one current owner under [README source precedence](README.md#source-precedence): product behavior here; detailed interactions in DESIGN; exact visual/accessibility values and routes in DESIGN_SYSTEM; privacy/security/retention/recovery in SECURITY_AND_TRUST; engineering mechanics in PACKAGE_CONTRACTS and the named specialist specifications; architecture constraints in accepted ADRs.

Small tickets link to this overview, their place in the connected journey, the exact capability heading, and the relevant specialist rules. Their checks include affected transitions, while the milestone walkthrough checks the joined experience. Current implementation and dated evidence live in [PROJECT_STATE](PROJECT_STATE.md), and GitHub owns live work status.

Status: consolidated product-requirements draft authorized 2026-09-07 for local owner review before publishing. The amendment must complete governance review and merge before dependent implementation. Current implementation and evidence remain separate from intended behavior.

## Working title

**Antique Trail**

Keep Antique Trail as the temporary working name through the private evaluation. The final brand name has not been selected.

When a final name is approved, inventory and account for every reference: rendered screens, PWA/install metadata, titles/sharing/accessibility text, images/logos, emails, print/QR materials, documents, fixtures/tests, code/configuration, domains/URLs, and external settings. Give every reference a migration action and verification result, checking rendered output as well as text. Present an explicit disposition for immutable history, third-party references, and changes that could break data, links, authentication, or integrations; do not silently omit them or promise completeness without that inventory. No rename or domain purchase is authorized by this milestone.

## Product type

- Public consumer Progressive Web App
- Mobile-first
- Desktop and tablet compatible
- Future Android packaging through Capacitor

## Product summary

Antique Trail helps people find trustworthy antique-store information, see a fun day take shape, plan a feasible multi-store trip, hand that trip to the person navigating, and privately remember each visit.

It is not merely a store directory. Its differentiator is the combination of:

1. List-first Store Browser with trusted details, hours, photos, updates, and official links
2. Store-hours-aware trip planning with explained warnings and explicit user control
3. One-trip partner handoff and one-stop-at-a-time navigation
4. Private personal ratings, notes, and visit history
5. Verified Store Representative and Administrator workflows

Public reviews enter at the Regional Public MVP after moderation passes. Finds, households, and personalization are later phases, not implementation-baseline differentiators.

## Product vision

Make a fun day of antique shopping easy to see, easy to plan, and easy to trust.

The long-term product should be able to answer:

> We are visiting a city this weekend. Which antique stores fit our interests, in what order should we visit them, and which stops are unlikely to be worth our limited time?

## Primary users

### Antique shopper

Needs:

- Browse readable store cards by name, town or area, and category without granting location access
- Understand at a glance what a store offers, whether it is open, and whether its information is current
- Find nearby or route-adjacent antique stores
- Capture a store, inventory page, sale, or event lead from a shared or pasted link without retyping it
- Send one candidate to one named authenticated planning partner without exposing other private data
- See trustworthy hours and store details
- Save stores
- Review stores
- Build a preference profile
- Receive personalized recommendations
- Build and execute a multi-stop shopping trip
- Record possible purchases and collections privately

### Shopping partner

Needs:

- Send one Candidate Link to one named authenticated recipient and accept or dismiss a Candidate Share
- Receive a verified-email-bound invitation to one trip
- Co-edit that draft trip without receiving access to any other trip or account data
- Let either participant become Navigator
- Follow read-only trip progress when not Navigator
- Keep personal ratings and notes private from the other participant

### Antique-store owner

Needs:

- Claim and verify a listing
- Correct business information
- Maintain hours and holiday hours
- Add official photos and descriptions
- Post native Store Updates
- Add validated official social profile links
- Understand direct-publish versus Administrator-reviewed changes
- Request help and follow ticket status

### Moderator or administrator

Needs:

- Review reports and disputes
- Manage fraudulent or abusive reviews
- Verify business claims
- Audit sensitive administrative actions
- Correct duplicate, closed, or misleading listings
- Review onboarding, store changes, images, and support in one type-aware queue
- Revoke and regrant exact Store Representative scopes without seeing shopper activity

## Product goals

1. Maintain a useful, trustworthy antique-store directory.
2. Let users browse immediately and build a usable trip with progressive setup.
3. Suggest a feasible order around hours, drive time, browsing time, and priorities without silently reordering or claiming unproved optimization.
4. Hand off the current destination to Waze or Google Maps in one tap.
5. Support a safe one-trip handoff from Trip Creator to Navigator.
6. Keep private notes, ratings, trips, and later personal data securely separated from public and privileged content.
7. Support consent-based, non-monetized regional product promotion through flyers, ordinary QR codes, organic search, and permissioned local channels.
8. Scale without rebuilding the authorization and data model.

### Delivery and release boundary

Product behavior, repository implementation, and external activation are distinct outcomes. A feature may be implemented and accepted while safely staged off. Human participation, provider approval, legal review, spending, production configuration, promotion, and public release are proved and authorized in separate gate issues; they block only the external action they name. This separation never weakens the security, privacy, accessibility, data-integrity, or stage controls required by the feature.

## Age-inclusive usability requirements

Design first for shoppers roughly 50-80+ while remaining usable by all ages, without a separate age mode. Meet the exact [age-inclusive usability baseline](DESIGN_SYSTEM.md#age-inclusive-usability-baseline) and the later [human usability acceptance](#human-usability-acceptance); the owner's first evaluation does not replace that release evidence.

## Private content lifetime

Private saves, trips, personal ratings, notes, and accepted Trip Ideas remain the owner's private memory until the approved deletion/account-lifecycle rules apply; age alone does not expire them. Exact controls: [Private content lifetime](SECURITY_AND_TRUST.md#product-private-content-lifetime-controls).

## Operational retention

Operational records have defined deletion deadlines and must not become a second store of shopper-private content. Exact controls: [Operational retention](SECURITY_AND_TRUST.md#product-operational-retention-controls).

## Recovery objectives

Every stage must prove its required recovery of both database and Storage; a provider promise or database-only restore does not establish recovery. Exact controls: [Recovery objectives](SECURITY_AND_TRUST.md#product-recovery-objectives-controls).

## Break-glass emergency access

Emergency private-data access remains disabled where the stage or independent-review requirements prohibit it and is never routine support. Exact controls: [Break-glass emergency access](SECURITY_AND_TRUST.md#product-break-glass-emergency-access-controls).

## Non-goals for MVP

- Native turn-by-turn navigation
- Automatic antique authentication
- Professional appraisal
- Marketplace transactions
- Nationwide social network
- Background location tracking
- General-purpose road-trip planning
- AI-first antique identification as the main product
- Household-wide access or shared accounts
- Embedded or synchronized social-media feeds
- Store-owner analytics, paid placement/advertising products, sponsored ranking, or access to shopper activity

## Rating model

The application has three separate rating concepts.

### Public store rating

A public aggregate from user reviews.

Example:

> 4.6 ★ · 328 reviews

### Personal store rating

A private rating belonging to the user.

Example:

> Your rating: 5 ★

### Personal match score

A recommendation estimate based on the user's private profile and store attributes.

Example:

> 92% match for you

These values must never be merged or presented as interchangeable.

## Public store directory

Public store records may include:

- Name
- Address
- Coordinates
- Phone
- Website
- Social links
- Regular hours
- Holiday-hour overrides
- Store type
- Public rating and review count
- Category tags
- Approved Official Store Profile Photos
- Accessibility details
- Estimated size
- Estimated browsing time
- Last verified date
- Active, temporarily closed, or permanently closed status
- Claimed or unclaimed listing status

### Store data provenance

- Store Partners provide and confirm their records.
- Non-partner listings use only manually verified public facts: name, address, phone, hours, website, and categories.
- Record owner confirmation or source URL, verifier, and verification date for each imported or manually entered fact set.
- Do not copy descriptions, photos, or reviews without permission.
- Do not scrape or bulk-import any source without written license review.
- Do not use Google Places content as the stored catalog. A Google place ID may be retained only for a separately approved live lookup that follows current attribution and provider terms.

### Official Store Profile Photos

- Internal Alpha uses generated fictional storefront/interior images for Synthetic Stores.
- Real photos require an authorized Store Partner submission or specific documented permission.
- Do not capture or copy automatic website/social screenshots or third-party images.
- Process every real image through private quarantine, validation, re-encoding, metadata removal, accessible alternative text, and Administrator approval before display.
- Allow the current tier's approved Store Profile capacity: Free one cover + five gallery, Gallery one cover + fifteen gallery, Full Gallery one cover + no plan-count cap under its published non-count limits. Allow one image per Store Update.
- Require preview/crop, rights confirmation, and meaningful alternative text before submission.
- Keep the current approved profile image live while its replacement is reviewed. Hold an image-bearing Store Update in full until its image is approved.
- A neutral placeholder appears when no approved photo exists; lack of a photo does not hide a valid listing.
- Shopper/review photo submissions remain deferred until after the Regional Public MVP.

### Listing freshness

- Treat a listing as verified for 180 days after Store Partner confirmation or manual source verification.
- A correction or closure report triggers immediate review regardless of age.
- From day 181 through day 365, show `Verification overdue`, keep the listing searchable with a warning, and exclude it from Open Now and automatic trip ordering.
- After day 365, hide the listing from normal discovery until reverified.
- Never automatically delete the listing or its provenance.
- Successful reverification resets the freshness clock.

### Store Updates and official social links

- A verified Store Representative may publish native text updates of type New Finds, Sale, Announcement, or Store News.
- Show the latest three updates on Store Details with `See All`.
- Sales require an end date and auto-archive. Announcements may use an end date; New Finds and Store News archive manually. Archive is reversible.
- Update text publishes directly. Any attached image follows the Official Store Profile Photo processing and approval boundary; no part of an image-bearing update publishes early.
- A verified Store Representative may publish one validated official business-profile link for each of Facebook, Instagram, YouTube, Pinterest, and TikTok.
- Validate supported domains, reject URL shorteners, show the final destination in preview, and audit publication and Undo.
- Never request social credentials, embed or synchronize a feed, scrape posts, import tracking parameters, or imply that the external profile is Antique Trail content.
- A separate Vendor Contributor role is deferred until pilot demand and authorization testing justify it. MVP may label vendor-supplied content posted by the Store Representative.

## Store categories and attributes

Possible tags:

- Antique mall
- Curated vintage
- Furniture
- Architectural salvage
- Primitive
- Mid-century
- Transferware
- Stoneware
- Copper and brass
- Books
- Advertising
- Collectibles
- Clothing
- Jewelry
- Industrial
- Garden
- Repurposed
- Home décor
- Tools
- Toys
- Kitchenware
- Seasonal

Possible evaluation attributes:

- Furniture quality and variety
- Curated presentation
- Repurposing potential
- Architectural salvage
- Primitive inventory
- Mid-century inventory
- China and pottery
- Metalware
- Collectibles
- Value
- Inventory turnover
- Inspiration

Users choose which attributes matter to them.

## Deferred Phase 5 — Onboarding and taste profile (not authorized for Regional Public MVP)

New users should answer a short preference survey.

Example questions:

- What categories do you shop for?
- What store types do you prefer?
- Which styles or eras interest you?
- How far will you travel for a strong match?
- How long do you typically browse?
- Do you prefer large malls or small curated stores?
- Which categories do you generally avoid?

The taste profile should improve through:

- Public and personal ratings
- Saved stores
- Hidden stores
- Visit history
- Saved finds
- Purchases
- Search and category behavior
- Explicit feedback on recommendations

## Core workflow

1. Open the app.
2. Browse stores immediately in the approved area; sign in only when a private write is requested.
3. Open Store Details, review trusted hours/photos/updates/official links, then Save or Add to Trip.
4. Choose a named existing trip or create one with area and date; preserve the selected store.
5. Complete Plan progressively: starting point, departure, optional return, and per-stop duration.
6. Run Check My Day; review explanations and warnings, then explicitly use the suggested order or keep the current order.
7. Invite one Trip Partner if wanted and assign one Navigator.
8. Start Go, hand one leg to Waze or Google Maps, and mark arrival manually.
9. Finish or skip the stop, optionally record a private rating/return choice/note, and continue.
10. Finish or end early, review the summary, and retain private visit history or clone with Plan Again.

Candidate Link capture and recipient-specific Candidate Share remain an additional private intake path; they never replace Store Browser as the first-arrival workflow.

## Candidate-link capture and Trip Ideas

Required:

- Accept a shared URL through a device/browser PWA share target where supported and through an always-available paste-link fallback.
- Accept only HTTP or HTTPS Candidate Links. Preserve the original URL, capture time, sender identity, optional sender note, and extraction status as private data.
- Let one authenticated sender address one Candidate Share to one named authenticated recipient.
- Let only the named recipient read, accept, or dismiss the share. Acceptance creates a recipient-owned Trip Idea; it does not grant either account access to the other's other private data.
- Address the share by an existing account's verified email. Resolve the address server-side and deliver the payload only to that matched verified account.
- Return the same generic asynchronous `202` response no earlier than 500ms whether the address is matched, unmatched, unverified, or blocked. Do not invite or deliver a payload to an unregistered address; pass the fixed 100-trial/under-50ms median-difference timing test in `SECURITY_AND_TRUST.md`.
- Let the recipient Accept, Dismiss, Block, or Report. Block closes the share, deletes payload within 24 hours, and retains only a pseudonymous block edge until the recipient unblocks or deletes the account. Report closes the share, copies only approved minimum evidence into the moderation case, and deletes the share payload within 24 hours.
- Show the sender only `Pending`, `Accepted`, or `Closed`. Never distinguish an unknown or unverified address, dismissal, block, report, revocation, or expiry through status, errors, or timing.
- Expire a pending share 30 days after send. Let its sender revoke it while pending. Make expired, revoked, or dismissed unaccepted payloads unreadable and unclaimable immediately, then delete them from the primary database and associated Storage within 24 hours.
- On acceptance create the recipient-owned Trip Idea as the independent copy; retain the sender-only outbound envelope for 30 days, then delete URL/note and retain only content-free `Accepted` status through day 90. The recipient copy follows private-content lifetime.
- Suggest available title, business name, address, hours, contact, inventory, or event hints with their source and retrieval time. Label every extracted value unverified until the recipient reviews it.
- Keep blocked, private, unsupported, or failed sources usable by retaining the URL and offering manual fields. Do not authenticate to or bypass access controls on Facebook or another source.
- Never auto-create or publish a directory store, Event record, review, owner claim, or Store Partner relationship from a Candidate Link.
- Treat an event link as a private link/note in this slice; the public Event model and owner event publishing remain deferred.
- Permit the recipient to add a reviewed Trip Idea to Plan, then keep subsequent recipient edits, notes, ratings, and trip activity private from the sender.
- Apply sender/account/IP/device rate limits and keep Candidate Share distinct from the separately approved one-trip partner invitation.

## Trail Map requirements

The map must support:

- Search
- Current area
- Pins
- Clustering
- Public ratings
- Personal match indicators after Phase 5
- Open-now filtering
- Visited/unvisited filtering
- Saved-store filtering
- Category filtering
- Distance filtering
- State or region filtering
- Claimed-store status
- Store detail preview
- Add to trip
- Navigate
- Save

## Today's Trip requirements

Regional Public MVP supports one to eight active stops per trip. Adding a ninth explains the limit and preserves the existing plan. Default dwell is a verified store estimate or 60 minutes; presets are 30/45/60/90, and Custom accepts whole minutes from 5 through 720.

### Inputs

- Editable trip area name and required date at creation
- Private start location and departure time before Package 5B Check My Day or Start Trip; manual ordering and Package 5A Review Hours do not require them
- Candidate stores
- Per-stop expected browsing time: verified value or 60-minute default, editable to 30, 45, 60, 90, or Custom
- Optional return destination
- Required stops
- Optional food or rest stops
- User priority for each stop
- Maximum drive distance or total trip duration

### Location privacy

- Request device location only after explicit while-in-use permission for a user-requested route.
- Allow manual start entry; denying device location must not block directory browsing or manual trip planning.
- Send only coordinates necessary for the requested route to the routing provider named in the privacy notice.
- Never collect background or continuous location or raw movement history.
- Never place precise coordinates in analytics, application logs, email, or support records.
- Keep saved trip locations private to their shopper.
- Apply the separately approved retention policy to completed-trip location data.
- Do not create a profile-level `Home` field. Do not use geofencing for arrival.

### Package 5A Review Hours

Package 5A checks the current manual order against known store-day hours and freshness only. It states `Travel time is not included`, provides accessible Move Up/Down controls, and never produces arrival, finish, feasibility, travel time, reason-for-placement, or suggested-order claims. Starting with unresolved warnings requires explicit acknowledgement.

### Package 5B planning factors and output

- Opening and closing time
- Holiday or special-event hours
- Travel time
- Expected browsing duration
- User priority
- Personal match score after Phase 5
- Required stops
- Backtracking
- Return destination
- Whether a store can reasonably be reached before closing

### Output

For every stop:

- Order
- Estimated arrival
- Store closing time
- Planned browsing time
- Estimated departure
- Drive time to next stop
- Schedule risk indicator
- Reason for placement in route

`Check My Day` previews this output before applying it. It must explain warning severity with icon, text, and corrective action; preserve user changes; and offer separate `Use Suggested Order` and `Keep My Order` actions. It never silently reorders and must not use `best` or `optimized` unless that claim is proven. Amber means attention, red means likely infeasible or closed, and gray means unknown or stale. A user may start after one explicit warning confirmation.

### Active-trip actions

- Start
- Navigate
- Arrived
- Completed
- Skipped
- Store Appears Closed (`observed_closed`, private only, with Undo)
- Extend visit
- Shorten visit
- Add stop
- Remove stop
- Reorder
- Recalculate
- End trip

The application owns the itinerary. Waze or Google Maps owns turn-by-turn navigation for the current leg.

Arrival is manual. Go stays quiet and one-stop-at-a-time. `Done Here` offers an optional private 1–5 rating, No/Maybe/Yes return choice, and note. Skip applies immediately with Undo, records history, and recalculates the remaining trip without automatically opening navigation. `Store Appears Closed` is a separate private trip action for Planned/Arrived stops: it records `observed_closed`, states that no public listing changed, advances/recalculates like Skip, offers operable Undo, and optionally links to a separately authenticated correction report when online. Last-stop completion, observed-closed, or confirmed `End Early` creates a private summary. Visit history is immutable; private ratings and notes remain editable. `Plan Again` clones rather than mutates history.

### One-trip roles and invitation

- A Trip Creator may invite one Trip Partner to one trip. Both may edit the draft.
- Either participant may be Navigator, but only the assigned Navigator controls Go. The other participant sees read-only progress.
- Personal ratings and notes remain visible only to their author. No role grants access to unrelated trips or account data.
- Invitation is bound to the recipient's verified matching email, single-use, valid seven days, and shareable through the native share sheet or QR code.
- Creator may cancel an invitation or remove the partner; the accepted partner may leave immediately. Either action ends access on the next request, rejects/purges offline state on reconnect, and pauses Go when the departing participant was Navigator until reassignment.

### Offline active trip

- Cache only the minimum active-trip snapshot and pending mutations for the assigned Navigator in encrypted IndexedDB, bound to the authenticated account and local PWA installation.
- Use a non-extractable device-local Web Crypto key. Never place authenticated trip data in the public service-worker cache.
- Support refresh/restart resume plus offline arrival, completion, skip, private rating, and private note with visible pending-sync state.
- Keep draft collaboration online-only. Show the Trip Partner when progress was last updated.
- Purge after completed-trip changes successfully synchronize, on account switch, and on logout. When logout would discard unsynced changes, show a plain warning and require explicit confirmation.
- On known authorization loss, delete the key and cache. After offline revocation, recheck authorization on reconnect and purge before sync or refreshed private display. Disclose that already decrypted data cannot be remotely recalled from an offline device.
- Bind Go to one Navigator account and one active Navigator device. Require authenticated online confirmation to transfer devices; reject later mutations from the old device.
- Give each offline mutation a unique idempotency key and local sequence number. Replay authorized actions exactly once in their recorded order.
- Make server authorization, Navigator/device assignment, and trip lifecycle/state authoritative. Reject stale or unauthorized actions with a plain explanation and no other-account disclosure.
- For online shared-draft edits, require trip base version plus mutation idempotency key. Reject stale reorder/add/remove/time/duration/return/partner/Navigator changes without partial application; load and highlight the latest plan, then offer `Reapply My Change` or `Keep Latest`. Reapply is a new authorized mutation. Never silently merge or use last-write-wins.
- Apply non-conflicting actions. When the same private rating or note changed from the offline base version on another device, preserve both and require its author to choose `Keep This Phone's Version` or `Keep Saved Version`; never silently overwrite.
- External-map offline support is outside Antique Trail.

## Store Browser requirements

Browse Stores is the default shopper entry point.

- Show approved-area results immediately without sign-in or location permission.
- Search by store name, town or area, and category.
- Work with manual area selection when device location is denied.
- Default to a readable list; offer a secondary map toggle.
- Apply search/filters server-side. Package 1 supplies bounded name/town/category search plus manual area only; Package 3 adds Saved/Visited; Package 5B adds approximate selected-area-centroid distance and synchronized secondary map; Package 10A adds Open Today, Open Now, freshness and measured pagination/indexing when regional size requires them. Browse never requests device location. `Open Now` excludes unknown/overdue hours; map failure preserves complete list/filter state.
- Each card shows a cover image or neutral placeholder, name, town or distance, category/what-you-will-find summary, today's hours/open state, freshness state, Save, and Add to Trip.
- Keep secondary information in Store Details rather than crowding the card.
- Use responsive, appropriately sized images and loading placeholders so weak service or older phones do not block browsing.
- Authenticated return visits may show a dismissible `New Since Your Last Visit` card based only on a coarse last-seen timestamp and manually selected area. It is an in-app catalog-freshness feature, not push/email notification or location tracking.
- Anonymous users may Browse, open Store Details, and Navigate. Save, Add to Trip, personal rating, and private note trigger just-in-time authentication, preserve the intended action, and return to it after success. Cancellation or failure creates no write.

## Store details requirements

Each store profile must support:

- Public business details
- Public average rating
- Review count
- Approved reviews
- Official owner response after the Regional Public MVP
- Approved Official Store Profile Photo cover and gallery
- Latest three native Store Updates and `See All`
- Validated official social profile links, clearly external
- Store tags and attributes
- Hours and exceptions
- Last verified date
- Report incorrect information
- Claim listing
- Save
- Add to trip
- Navigate
- Personal rating
- Private notes
- Visit history
- Private finds and purchases after Phase 4

The profile must show rights/provenance and freshness where the shopper makes a decision. Images may enlarge and require meaningful alternative text or captions.

## Review requirements

- Regional Public MVP only; a server-owned stage capability denies every public-review route/read/write during Internal Alpha and Private Beta
- Verified-email, age-attested 18+ account; one active public review per user/store
- Eligibility after an Antique Trail trip marks the store `Done Here`, or after a manual `I visited` honesty/conflict attestation; both are rate-limited and create no location proof claim
- Integer rating 1–5, optional text, and mandatory material-conflict disclosure
- Publish only rating, allowed text, author-selected display name, visit month/year, edit marker, and conflict label; never publish email, exact visit time, location, trip, private note, or account history
- Arithmetic mean and count of active eligible ratings, shown from the first eligible review and updated transactionally with review state; no weighting, paid boost, owner override, or personalized-score mixing
- A current Store Representative cannot review their own scoped store; other disclosed employment/ownership/family/vendor/compensated conflicts are labeled and excluded from aggregate
- Author edit keeps internal version history and recomputes aggregate atomically
- Author delete removes display and aggregate effect immediately and deletes all current and historical review text within 24 hours unless a live moderation/legal case retains minimum evidence in its restricted case; retain only content-free review/version/audit metadata after purge
- Report is private, rate-limited, reason-coded, and does not reveal reporter identity to the store
- Remove spam/duplicates, threats, harassment/hate, personal/sensitive information, illegal content, impersonation, undisclosed material conflict, compensated manipulation, irrelevant content, and content held for legal/safety review; do not remove merely for being negative
- Store Representatives may report but cannot edit, suppress, identify, or answer reviewers; owner responses remain post-MVP
- One appeal by author or scoped Store Representative within 30 days; different Administrator when available, otherwise independent qualified reviewer; target 14 business days; restore recomputes aggregate and uphold gives a rule-based reason
- Initial-launch routine moderation is Administrator-only with MFA, recent authentication, exact case scope, minimized evidence, reason-coded `Hold`, `Remove`, `Restore`, or `Dismiss Report`, and append-only hash-chained audit with externally anchored roots; a separately staffed Moderator role remains deferred
- Scheduling account deletion immediately hides all active/pending authored reviews and removes their aggregate effect transactionally. Cancellation within seven days restores the prior state only if still eligible and not held/removed. Day-8 deletion purges display name and all current/historical review text, retaining only content-free metadata or minimum evidence already copied into a live restricted case.
- Moderation decisions, aggregate transitions, and appeal outcomes are server-authorized and append-only audited; case evidence follows two-years-after-closure retention
- Optional shopper/review photos remain disabled until a separate post-MVP moderation provider/workflow is approved

## Deferred Phase 4 — Find capture (not authorized for Regional Public MVP)

Users may privately record an item while shopping.

Required:

- Photo
- Store
- Description
- Asking price
- Status

Optional:

- Booth or dealer
- Measurements
- Category
- Estimated age
- Condition
- Negotiated price
- Potential room or use
- Partner votes
- Pickup requirements
- Seller contact
- Additional photos

Statuses:

- Considering
- Buy now
- Ask partner
- Need measurements
- Need to check space
- Purchased
- Passed
- Sold before decision

## Deferred Phase 4 — Household sharing (not authorized for Regional Public MVP)

Optional household functionality:

- Invite members
- Shared trips
- Shared saved-store lists
- Shared finds when explicitly selected
- Shared collections when explicitly selected
- Individual preferences remain separate
- Individual votes remain visible
- Membership revocation immediately removes access

## Deferred Phase 4 — Collection tracking (not authorized for Regional Public MVP)

Private by default.

Fields:

- Name
- Photos
- Category
- Approximate age
- Original purpose
- Current purpose
- Purchased from
- Purchase date
- Purchase price
- Dimensions
- Room or location
- Condition
- Restoration
- Related items
- Story or notes
- Optional insurance value

## Business accounts

Verified Store Representatives may directly publish for their assigned store:

- Maintain regular and holiday hours
- Maintain phone and website
- Maintain official description
- Mark temporary closure
- Publish Store Update text
- Publish validated official social profile links

Verified Store Representatives must submit a Store Change Request for:

- Store name
- Address or coordinates
- Ownership
- Permanent closure
- Category tags
- Official Store Profile Photos

Subject to separate feature requirements, verified Store Representatives may:

- Respond to reviews
- Add events
- View aggregated privacy-safe engagement metrics

These three capabilities remain deferred. Native Store Updates and official social profile links above are approved MVP scope and are not the deferred social-feed or event system.

Store Representatives may not:

- Edit or delete user reviews
- Access private notes
- Access private trips
- Access saved finds
- Access home collections
- Access precise user location history
- Buy a higher public rating
- Identify anonymous browsing behavior

### Store Portal home and publishing labels

- Home shows store identity, listing status, hours verification/staleness, `Update Hours`, and `Preview Listing`.
- Secondary destinations are Store Info, Photos, Pending Changes, and Access & Help.
- Every editable field says `Publishes Immediately` or `Requires Admin Review` before submission.
- Controlled changes use Pending, Changes Requested, Approved, or Rejected and keep the current approved public value live.
- Exclude analytics, advertising, shopper activity, private trips, ratings, notes, and precise location.

### Hours editor

- Support weekly Open/Closed state, one range plus an optional second range, and Copy to selected days.
- Dated exceptions replace the weekly schedule for that date; support full-day closure dates.
- Derive store time zone from the approved address and require Administrator review if address/time zone changes.
- Show a 14-day preview and require confirmation before publication.
- Successful publication refreshes verification and offers Undo. Active trips receive changes on next sync; completed history remains frozen.

### Store Updates, images, and social links

- Create New Finds, Sale, Announcement, or Store News; require a Sale end date and support reversible archive.
- Text-only Store Updates publish directly. An image-bearing update remains wholly unpublished until image approval.
- Store Profile supports the current tier's approved capacity (Free cover+5 gallery; Gallery cover+15 gallery; Full Gallery cover+no plan-count cap under published non-count limits). All profile-image changes require Administrator approval while current approved images remain live.
- Require rights confirmation, preview/crop, alternative text, quarantine, validation, re-encoding, metadata removal, and Administrator review for each image.
- Allow one validated official business-profile URL for each approved social platform. Reject unsupported domains and shorteners; show the final destination; audit publication and Undo.
- Do not accept social credentials, scrape or synchronize posts, embed feeds, or import tracking parameters.
- Keep any future Vendor Contributor store/booth-scoped and draft-only; do not implement that role before pilot demand and authorization testing.

### First Store Partner onboarding

- Demonstrate with Synthetic Stores only
- Obtain Store Partner Pilot Consent before creating a real store record or representative account
- Verify representative authority in person and through a published business contact
- Require an owner-controlled verified email and MFA; prohibit shared credentials
- State that participation is voluntary, invitation-only, unpaid, non-endorsing, and not public product promotion
- On withdrawal, revoke representative access and remove the real store from the active pilot
- Audit onboarding, scope grants, withdrawal, and revocation

### First Pilot Store Record

- Atomic Administrator approval of the owner-submitted Pilot Store Draft creates the record only after Store Partner Pilot Consent and authority verification
- Owner confirms name, address, phone, website, regular and holiday hours, official description, and category tags
- Record source/provenance and verification date
- Restrict visibility to invited Private Beta participants; deny anonymous/public access
- Representative tests Representative-Managed Fields and submits rights-confirmed Official Store Profile Photos through Store Change Requests
- Quarantine, validate, re-encode, strip metadata, and require alternative text before Administrator approval and display
- Exclude ratings/reviews, shopper/review photos, events, owner responses, and analytics

### Initial Private Beta Cohort

- Scott: separate shopper and Administrator accounts
- Scott's wife: separate shopper account
- First owner: Store Representative account only
- One Pilot Store Record
- Owner shopper activity requires a separately approved shopper account
- AI and Agent-Assisted Test Accounts remain restricted to Synthetic Store data
- No additional user or real store before a separate expansion gate passes

### Initial Private Beta Expansion Gate

- Owner completes Representative-Managed Field edits, one independent direct hours/content edit, two Store Change Requests respectively approved and rejected by the Administrator, MFA, and scheduled revoke/regrant testing
- Scott and the Independent Internal Tester each complete two shopper trip runs containing the Pilot Store Record
- Support and feedback intake works
- Privileged audit records are complete
- Monitoring, backup restore, and rollback checks remain passing
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Owner independently records `continue` or `withdraw`, listing usefulness, whether hours maintenance and reviewed changes are understandable, each flyer/social channel consent or decline, and whether operator interventions/minutes/support load were acceptable
- `Withdraw` or missing owner evidence blocks the second store; `continue` still requires Product Owner acceptance of support load
- Primary Internal Tester approves dated evidence for every check
- No minimum calendar duration; any failed check blocks expansion

### Controlled Private Beta Expansion

- Add one verified Store Partner and one Pilot Store Record at a time
- Repeat consent, authority verification, onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks for each addition
- Require 100% of active discoverable Private Beta listings to remain inside their approved verification interval before each addition
- Do not add the next store until the current addition passes
- Cap at three total Store Partners and Pilot Store Records
- Remain invitation-only with no public product promotion
- After all three pass, stop and conduct a separate public-readiness review
- Do not treat pilot passage as authorization for public access

### Regional Public Readiness Gate

- All three Controlled Private Beta additions and every Package 1–10A prerequisite must pass with dated evidence
- All security, privacy, legal, accessibility, browser/device, support, recovery, and incident gates must pass with zero Blocking Defects or known privacy, security, or data-loss defects
- Topeka must have at least 12 active verified listings and at least 70% coverage of an independently enumerated eligible-shop baseline; 12 controls unless the Product Owner signs a market-size exception proving fewer eligible shops exist. For this gate, an eligible shop is a brick-and-mortar business inside Topeka city limits, open to the public on at least one recurring day per week, whose primary advertised inventory is antiques or vintage goods. Exclude event-only markets and general thrift or consignment businesses that do not primarily advertise antiques or vintage goods. Two people independently enumerate the baseline from dated public sources, reconcile disagreements, preserve the source list in the gate receipt, and recheck it within 30 days before signature.
- Current hours must support at least three distinct three-stop itineraries on each of Tuesday, Friday, and Saturday—nine total. Use one non-holiday date for each day within 30 days after the baseline recheck. Each itinerary must use a unique three-store set; start at the first store's verified opening time; allow 45 minutes in each store plus a 10-minute parking/transition buffer at every stop; use the accepted Package 5B provider's recorded travel-time matrix; and finish the 45-minute visit at every stop no later than its verified closing time. Preserve the input dates, hours, matrix, order, calculations, and result in the release receipt.
- At least eight independent invited Topeka shoppers outside the initial household/owner cohort attempt Browse, Details, Plan, Go, and private visit memory; at least seven finish without a Blocking Defect and at least five confirm return intent or complete a second trip
- Readiness evidence uses a direct-invitation cohort of at most 20 verified-email Topeka adults, stops enrollment after eight attempt the core journey, requires current test-privacy consent, expires each cohort grant after 30 days, and remains non-public/non-advertised. It may use staff-prepared non-partner listings containing only manually verified public business facts after two-person provenance review; it may not use unlicensed descriptions/media/reviews, scraping, bulk import, or partner-implying labels.
- Product Owner signature is required before public deployment, public product promotion, or anonymous access to real-store data
- At signature time, 100% of active discoverable listings must remain inside their approved verification interval

### Store Partner Invitation

- Administrator requires MFA and recent authentication to generate an invitation in person after a Synthetic Store demonstration and verbal interest
- Display a QR code containing only an opaque random token; no owner, store, email, or role data
- Expire after 30 minutes or one successful atomic consumption; allow Administrator revocation and regeneration
- Open the existing PWA partner-onboarding page; do not directly install the PWA or grant a role
- Present the pilot terms and collect consent statements plus owner identity credentials before any identity or access grant exists
- On one idempotent submission, consume the invitation, store an immutable provisional consent submission, and create the Pending Partner Identity atomically; a partial failure creates none of them
- Verify owner-controlled email and configure MFA, then finalize the immutable Pilot Consent Receipt bound to the verified email
- Keep the identity pending with no store role, scope, or pilot-data access; resume interruptions against the same onboarding record and never create duplicate identities or receipts
- Administrator independently verifies authority through the published business contact and approves
- Only after approval, create the Pilot Store Record and grant the store-scoped Store Representative role
- Show device-appropriate PWA installation instructions after approved sign-in
- Audit generation, expiry, revocation, consumption, provisional consent, identity creation, email/MFA verification, receipt finalization, authority review, approval, role grant, and installation handoff

### Pilot consent capture

- Phone-friendly plain-language summary with links to the full, legally reviewed pilot privacy notice and terms
- Separate required acknowledgments for authority, voluntary participation, permitted store-data use, no payment/endorsement, and withdrawal
- Typed name, business title, store name, and owner-controlled email
- Immutable provisional consent submission created atomically with the unprivileged Pending Partner Identity
- Final immutable Pilot Consent Receipt created only after email verification and MFA, bound to the provisional submission, verified email, finalization timestamp, invitation identifier, and policy version
- Email owner a receipt/PDF copy without internal verification evidence
- Administrator may view but cannot edit submitted consent
- Material term changes require fresh consent before continued participation

### Pilot Store Draft

- Pending Partner Identity enters the owner-confirmed core listing fields after consent, verified email, and MFA
- Draft is readable only by that identity and Administrators
- Owner may edit in draft or changes-requested state and may submit/resubmit
- Administrator verifies against the published business contact and may approve or return comments, but cannot edit owner-submitted fields
- Owner corrects and resubmits returned drafts
- Approval requires Administrator MFA, recent authentication, and an exact final preview
- One atomic approval freezes the draft snapshot/provenance, creates the Pilot Store Record, and grants only its store-scoped Store Representative role
- Any approval failure creates neither the Pilot Store Record nor the role grant
- Preserve comments, state transitions, approval identity, and timestamps in audit history

### Representative activation and first login

- Send a status-only approval email containing the normal PWA sign-in link
- Never email a reusable invitation, magic role link, or authorization token
- Require sign-in with the verified email and MFA
- Show the exact approved Pilot Store Record, store-scoped Representative permissions, Pilot Consent Receipt, and approval history
- Offer device-appropriate PWA installation instructions after sign-in
- Start a guided checklist: confirm listing, review hours, make one Representative-Managed Field edit, submit one Store Change Request, and use pilot support
- Keep changes-requested/rejected email content status-only; require authenticated portal access for comments and store data
- Audit delivery, first approved sign-in, installation handoff, and checklist progress

### Store Partner Pilot Support

- In-app categories: bug, confusing workflow, store-data correction, feature idea, security/privacy concern
- Attach only store/account identifiers, app version, timestamp, and basic device/browser details
- Never attach tokens, shopper data, precise location, or internal logs
- Optional screenshot requires owner preview before submission
- Submitting Store Representative and Administrators can read ticket, replies, and status in the authenticated portal
- Notification email contains status only
- Security/privacy concern triggers urgent Administrator alert
- Fallback support email accepts sign-in-failure reports but returns no pilot data before identity verification
- Owner can confirm resolution or reopen the ticket
- Statuses are Submitted, In Review, Waiting, Resolved, and Reopened; preserve authenticated replies and status history.
- Accept at most one screenshot. Sanitize it, require owner preview, and prohibit arbitrary attachments.

## Administrator workspace

### Home and review queue

- Show signed-in role and environment, urgent safety items first, and one `Needs Review` queue grouped by onboarding, store changes, images, and support.
- Queue cards show store, submitter, type, status, and age; order urgent items first, then oldest.
- Exclude shopper activity, ratings, trips, traffic, and marketing.

### Review workspace

- Keep store, submitter, request type, and submission time visible while reviewing.
- Show current versus requested values and public preview for store changes; show rights, alternative text, processing state, and preview for images; show consent, authority evidence, and exact immutable draft for onboarding; show thread, allowlisted diagnostics, and sanitized screenshot for support.
- Provide only type-valid actions. Request Changes and Reject require a reason; Approve confirms the exact effect.
- Never let an Administrator edit submitted values, bulk approve, or silently move to the next item. Keep the current public value live until approval.
- Write an append-only audit record for every allowed or denied privileged attempt. Completion offers `Back to Queue` and `Review Next`.

### Access & Safety

- Separate pending invitations from active Store Representative grants.
- Show representative identity, verified-email and MFA state, exact store scope, status/date, and recent privileged activity without shopper activity.
- Revoke requires Administrator MFA, recent authentication, reason, and exact consequence preview. It removes only the selected store scope and denies the next server-authorized write, including from an open session.
- Private Beta withdrawal also hides the Pilot Store Record from the active pilot while preserving approved data and history.
- Regrant repeats verified-email, MFA, authority, exact-scope, and recent-authentication gates and never restores broader access.
- No bulk access changes, multi-store Representative scope, self-service role changes, account deletion, approved-data deletion, or audit-history deletion.
- D31 full searchable Audit History UI and export remain unresolved. D30 `View Audit` and two-year append-only privileged events remain required.
- Break-glass is absent from normal Administrator navigation and disabled during Synthetic Internal Alpha. Any later incident-only activation follows the approved emergency-access policy and never becomes a support tool.

## Moderation

The product requires:

- Review reporting
- Photo reporting
- Store-information disputes
- Moderation queue
- Internal case notes
- Appeal process
- Soft deletion
- Audit trail
- Repeat-abuse controls
- Store-owner dispute workflow
- Duplicate-store merge workflow

## Internal Alpha

Stages:

- Solo Agent-Assisted Alpha: the Primary Internal Tester operates every separate role account; AI Test Agents may execute supervised repeatable tests but cannot replace human acceptance or approve a gate
- Two-Person Acceptance: the Independent Internal Tester completes shopper acceptance on her own phone using a newly created Test User B account; no solo-stage account is reassigned to her
- No store owner, real store, or external participant before both stages and the separately approved External Testing Readiness gate pass; afterward, invite one consenting Store Partner representative into controlled Private Beta before public access

Required:

- Four-role authentication: Test User A, Test User B, Representative Test Account, and Administrator Test Account
- Optional Agent-Assisted Shopper Account for isolated user-two simulation during Solo Agent-Assisted Alpha
- List-first Synthetic Store Browser, search, optional map, details, hours, and generated fictional profile images
- Just-in-time authentication for private actions and `New Since Your Last Visit`
- Private Candidate Link capture, recipient-specific Candidate Share, and recipient-owned Trip Ideas using synthetic pages and fictional data only
- Private saved stores, personal ratings, and notes
- Hours-aware trip planning
- Explicit trip choice/creation, progressive Plan setup, Check My Day explanations/warnings, and readiness confirmation
- One-trip Creator/Partner/Navigator invitation and authorization
- Manual-arrival active-trip navigation handoff, private visit review, skip/Undo, summary, and Plan Again
- Offline active-trip recovery
- Store Portal home, hours editor, Store Updates, official images/social links, direct publishing, and Store Change Requests
- Administrator home, review workspace, support, and Access & Safety role management
- Audit records for privileged actions
- Age-Inclusive Usability Baseline and required assistive-technology/non-drag paths

Excluded:

- Real stores or external participants
- Public ratings, reviews, or shopper/review photos
- Household accounts, shared lists, or broad cross-account access; the one-trip Partner grant and recipient-specific Candidate Share are the only approved cross-account exceptions
- Finds and collections
- Public Event records or owner event publishing; a Candidate Link may retain an event URL only as a private idea
- Notifications
- Owner analytics
- Advanced personalization

Shopper-trip exit gate:

- Primary Internal Tester as Test User A and Independent Internal Tester as Test User B each complete three successful Shopper Trip Acceptance Runs on separate accounts and phones
- Test User B sends at least one synthetic Candidate Share to Test User A; only Test User A can accept it into a recipient-owned Trip Idea and add it to Plan
- Anonymous, wrong-recipient, Representative, and Administrator reads or mutations of the Candidate Share and Trip Idea are denied
- Sender cannot read recipient edits, notes, ratings, or resulting trips; recipient cannot read sender's unrelated private records
- Blocked-source/manual fallback and failed extraction preserve the original Candidate Link without publishing it
- Each account proves active-trip recovery after refresh or app restart and while offline in at least one run
- The six runs collectively exercise navigation handoff, arrived/completed/skipped/closed stop states, and route recalculation
- AI-assisted or Primary Internal Tester runs as Test User B are supplemental and cannot replace the Independent Internal Tester's runs
- Zero Blocking Defects
- Zero cross-account exposure or modification of shopper-private data

Privileged-workflow exit gate:

- Primary Internal Tester operates two complete Privileged Workflow Acceptance Cycles; Independent Internal Tester is not required to operate privileged accounts
- Every Representative-Managed Field publishes directly for the assigned Synthetic Store
- At least one Store Change Request is approved and one rejected; unapproved Controlled Store Fields remain unpublished
- Representative self-approval is denied
- Administrator uses a separate MFA-protected session to grant and revoke the representative's store scope
- Revocation denies further writes from the representative's existing session
- Every privileged action has an audit record
- Direct/controlled labels, hours preview, image hold/replacement, social-link validation, update archive, support lifecycle, and review context behave as specified in `DESIGN.md`
- Revocation and regrant affect only the selected store scope; an already-open Representative session cannot perform another authorized write after revocation
- Representative and Administrator Test Accounts cannot read or modify Test User A or Test User B shopper-private data
- Zero Blocking Defects; every allowed action succeeds and every forbidden action is denied

External Testing Readiness gate before first-owner contact:

- Dated passing evidence for Solo Agent-Assisted Alpha and Two-Person Acceptance
- Complete authorization and security test set passes
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Backup restore and rollback rehearsals pass
- Pilot-environment monitoring, error reporting, and support intake work
- Pilot privacy notice and owner consent are ready
- One External Testing Dress Rehearsal passes
- One full Private-Beta incident rehearsal passes
- Qualified professional evidence confirms the operating legal entity and required pilot insurance are active for owner contact and participation
- Primary Internal Tester approves every check; AI Test Agents may collect evidence but cannot approve the gate

## Startup Learning MVP (`SLM-01`)

SLM-01 is a private Synthetic-data checkpoint, not the Regional Public MVP. It contains Packages 1, 2, 3, and 5A only. Separate Test User A and Agent-Assisted Shopper accounts must each complete Browse → Details → Save → manually ordered hours-aware Trip → one-trip Partner/Navigator handoff → external-map Go → private visit memory. The evidence records completion time, manual retyping/tool switches, warning comprehension, offline restart/replay, return intent, and every cross-account allow/deny result.

SLM-01 excludes Candidate Share Package 4, provider-backed ordering Package 5B, Store Partner/Admin workflows, real stores, external participants, public reviews, public indexing, acquisition, and promotion. Product Owner disposition is `continue`, `revise`, or `stop`; passing it never skips later packages or release gates.

The disposition is mechanical. Both accounts must finish without an outside planning document, lose no entered store/trip/private-memory data through refresh/offline replay, and pass every cross-account allow/deny check. Each tester must correctly explain every hours warning and whether travel time was or was not included. Compare median completion time, manual retyping, and tool switches with the documented current baseline; no invented improvement percentage is required, but `continue` requires a written Product Owner finding that the flow reduced at least one of those burdens without worsening the others materially and that both testers would use it again. Any privacy/authorization/data-loss failure is `stop`; an incomplete journey, misunderstood warning, or no supported burden improvement is `revise` or `stop` with the failed step and next experiment recorded.

## Regional Public MVP

The Regional Public MVP comprises Packages 1–10B plus every named provider, human-capacity, security, privacy, legal, accessibility, recovery, operations, and release gate. Capability phase headings do not override package order.

Required:

- Public directory
- List-first Store Browser with search and optional map
- Store details
- Approved Official Store Profile Photos
- Native Store Updates and validated official social profile links
- `New Since Your Last Visit` in-app discovery
- User authentication
- Private Candidate Link capture, recipient-specific Candidate Share, and Trip Ideas
- Private saved stores
- Public ratings and reviews
- Personal ratings
- Today's Trip
- One-trip Creator/Partner/Navigator handoff and seven-day verified-email invitation
- Hours-aware route ordering
- Schedule warnings
- Active trip
- Waze and Google Maps handoff
- Basic visit history
- PWA installation
- Offline active trip
- Secure database policies
- Moderation basics
- Listing claim intake and claimant verification
- Store Portal hours/content/support workflows and Administrator review/Access & Safety workflows

Deferred until after the Regional Public MVP:

- Household accounts
- Find capture
- Shopper/review photos
- Store-owner review responses
- Preference onboarding and personalization
- Push notifications; in-app trip warnings and new-store discovery are required

Excluded:

- AI valuation
- AI authentication
- Embedded or synchronized social feed; native Store Updates are required
- Marketplace
- Nationwide launch
- Android store release
- Background location history

## Success metrics

### Internal Alpha and functional acceptance

- A shopper can find a suitable store, understand its open/freshness state, and add it to a trip without using the map or granting location access
- Required browse-to-plan and active-trip journeys pass the approved representative older-adult usability test
- Candidate Share reaches only the named recipient and can be accepted or dismissed without exposing unrelated private data
- One Trip Partner can edit only the invited trip, and only the assigned Navigator can control Go
- Failed or blocked extraction never loses the original Candidate Link
- Trip creation under three minutes
- Navigation handoff in one tap
- Visit review under one minute
- Accurate warning when a stop is unlikely before closing
- No private-data exposure
- Offline active trip continuity
- Representative direct/controlled publishing, review, revocation, and support journeys pass without shopper-data exposure

Binary security/authorization criteria require zero known violations; averages cannot offset one private-data or cross-scope failure.

### Operating scorecard and RG-01

The formulas and targets are approved below. Each metric gates the stage named in its row. The complete Topeka-to-community expansion decision is release gate `RG-01`; it is not D30, which remains the approved Access & Safety decision.

| Metric | Formula | Stage/gate |
|---|---|---|
| Store verification coverage | Active discoverable listings within their approved freshness interval / all active discoverable listings; target 100% | Private Beta expansion and public launch |
| Repeat trip use | Distinct eligible shoppers completing a second trip / shoppers completing a first trip; minimum denominator 25 first-trip shoppers and target at least 10 second-trip shoppers | Topeka success/expansion |
| Claim conversion | Approved store claims / eligible claim attempts, with rejected/abusive attempts reported separately | Store-partner workflow evaluation |
| Participating flyer locations | Count of active, consented flyer locations with current participation status; target at least 3 | Community expansion evidence, not a standalone success claim |
| Blocking defect rate | Open severity-one or privacy/security defects at gate time; target 0 | Must be zero for external/public gate |
| Support load | New support cases per active store and per completed trip; target no more than 1 per active store plus 1 per 10 completed trips | Expansion-operability gate |

RG-01 accepts evidence from a rolling window no longer than 180 days and has no minimum elapsed duration. It passes as soon as every minimum denominator and target is met with dated evidence. Claim conversion is reported for first regional launch but does not pass or fail RG-01.

For RG-01, an eligible Topeka shopper is one consenting human age 18+ using one nonprivileged shopper account, with Topeka selected as the trip area, who is not Scott, the Independent Internal Tester, an AI Test Agent, a Synthetic/test account operator, a Store Representative reviewing their own store, or a duplicate account already counted for that human. A qualifying completed trip contains at least two active Topeka stores and has `Done Here` recorded for at least two stops on one calendar date. Count a human's first and later second qualifying trips in server completion order; the second must occur on a later calendar date. A trip counts only when its completion timestamp falls inside the selected rolling evidence window. Preserve a pseudonymous deduplication ledger and exclusion reason with the gate receipt; never collect precise location merely to prove eligibility.

### Post-MVP personalization metric

- Recommendation quality: personalized recommendations later rated positively / personalized recommendations receiving an eligible later rating. This begins only after Phase 5 preference onboarding/personalization is approved and implemented; it is not a Regional Public MVP metric.

## Regional launch strategy

Launch dense, not broad.

### Free-first hosting and release requirement

Startup `$0` infrastructure includes audit anchoring and geocoding; inability to satisfy L-01/R-01 for free disables only their dependent remote capability and never authorizes spend or weaker controls.

Use ADR 0006's Vercel prebuilt-deployment path with ADR 0005's retained Supabase/recovery/cost topology for shared startup work. Recurring infrastructure must remain `$0` through SLM-01 and any Controlled Private Beta unless the Product Owner separately authorizes spend; Vercel plan eligibility and protection of every shared hostname must be proven rather than inferred. No automatic paid upgrade or overage is allowed. At 75% of any hard quota, stop promotion and nonessential growth; at 90%, disable optional maps, route suggestions, media uploads, and nonessential email before core Browse/Details, account safety, deletion, revocation, or support. A stage remains blocked when the selected plan cannot prove access protection, its RPO/RTO, database and Storage restore, availability, deletion, security, or abuse controls.

Regional Public MVP requires the approved 15-minute RPO/four-hour RTO, 99.5% monthly availability target, owned HTTPS domain, tested data export, and at least 25% normal/abuse capacity headroom. The currently selected free backend does not prove the public RPO. Package 10B therefore requires explicit Product Owner approval of a paid recovery configuration or independent proof of a compliant `$0` alternative; no paid ceiling is currently approved.

### Launch promotion and prospective-owner acquisition

Audiences remain separate: Topeka-area antique/vintage shoppers, designed first for ages 55–80+ while usable by all; and eligible prospective store owners/managers reached through a dedicated acquisition card or site link. Shopper promise: `Find Topeka antique stores, see when information was verified, and build a practical day before stores close.` Owner promise: `Help antique shoppers find your store—and make it part of the trip.` Supporting owner-card facts may say `Free plan available · No sales commission · Keep key store details current` only while each is true; the page distinguishes directly managed fields from reviewed sensitive facts/photos. Participation or payment never buys ranking, ratings, verification, moderation outcome, or shopper data. Do not claim `best`, `optimized`, `partner`, `verified owner`, ROI, foot traffic, sales, popularity, review speed, or scarcity without separately approved current evidence.

No acquisition occurs during Internal Alpha or SLM-01. Private Beta permits only direct one-owner-at-a-time invitations after External Testing Readiness. Package 10A may privately prepare/test artifacts and a private `noindex` `/for-stores` prototype. Package 10B alone may publish the owner page, accept claim/add-store applications, and distribute approved Topeka promotion through opt-in shopper counter flyers, prospective-owner cards, one voluntary partner social post, founder-owned public posts, permission-based community groups, tourism/chamber/community calendars, earned local media, organic search, and canonical Store sharing. Before paid activation, the owner page promotes Free participation only and exposes no paid price, paid card, or checkout action. No waitlist or pre-release public owner PII collection is authorized. No scraped lists, bulk unsolicited email, automated posting, group-rule bypass, paid media, sponsored ranking, affiliate links, ad network, or private-data targeting.

The responsive `/for-stores` page must answer, in this order: what Antique Trail does for shoppers and stores; a truthful Browse → Details → Add to Trip → planned stop → external-navigation proof story; what the owner can control; current eligibility/service area; how claim versus add works; what happens after application; the complete Free service; exact paid plans only when activated; moderation/billing/cancellation consequences; and real operator, support/security, privacy, terms, and status paths. It uses one primary `Add or claim my store` action and secondary `See what shoppers experience`. Browse stays the shopper front door; this targeted page may be linked from footer/More and eligible Store Details claim affordances. Screens/testimonials are real and consented or conspicuously synthetic; fabricated metrics, logos, endorsements, `most popular` labels, countdowns, and scarcity are forbidden.

The applicant path after Package 10B is find existing/add new store → ordinary verified-email account/sign-in → MFA → authority/eligibility and listing draft → Administrator approval atomically creates exact scope and Free (plus the public provenance-bound listing for a new store). A likely duplicate converts through confirmed existing-listing claim review and cannot create another store. Both claim and add-store start deny when the applicant already has an active Representative grant; a legitimate ownership/store change uses the Administrator-reviewed transfer flow, never a second intake. After paid activation, the approved Free Representative may optionally upgrade through fresh explicit paid consent and Stripe Checkout; failed/cancelled checkout leaves Free and the listing intact. A Checkout completed after a sales pause also cannot upgrade the store and must be cancelled/refunded through the provider-confirmed reconciliation path. Existing approved Gallery stores may upgrade their current subscription to Full Gallery under Package 13’s Existing-subscription upgrades contract: fresh bound consent, MFA/recent authentication, sales-open/generation fencing, server-derived proration, and verified-event-only application. A paused in-flight change compensates its incremental charge without cancelling the existing subscription or forcing Free. Package 13 schedules paid-to-paid downgrades on the existing subscription for the current cycle boundary, with last-accepted-target wins and no proration; when the schedule prevents Stripe portal cancellation, an authenticated application confirmation preserves cancel-anytime access and ends that same subscription at its paid-through boundary. One active Representative per store and one active store per Representative remain the Regional Public MVP limit; multi-location groups receive a plain unsupported/review path rather than a partially working bulk flow.

Flyer placement, owner-card distribution, logo/co-brand use, and a partner social post each have separate channel controls; exact-store placement/co-brand/social use requires current exact-store authority and consent. Withdrawal stops future use and reprinting immediately, requests removal of remaining material, and preserves a content-free audit record. Non-partner listings use verified public facts only and never imply participation. QR classes never blur: shopper flyers go to `/stores?area=topeka-ks`; prospective-owner cards go to `/for-stores`; secure approved Partner/readiness invitations alone go to their fragment-token routes. Both public codes contain no privilege, account, authority, or identity token and include a printed plain URL fallback. Optional `src` remains opaque, allowlisted, and aggregate-only.

Optional campaign measurement is first-party aggregate only: one allowlisted opaque `src` code; daily counts for campaign opens, Store Details opens, and public Share actions; no cookie, device ID, fingerprint, IP-derived identity, user/account linkage, precise location, or owner-facing shopper analytics. Delete daily aggregates after 180 days and retain only signed gate totals for three years. Campaign evidence never substitutes for RG-01's separate consenting trip evidence.

Pause the affected channel on consent withdrawal, broken/substituted QR, unauthorized partnership copy, stale/incorrect listing, spam complaint pattern, or privacy/security defect. Pause all promotion/community expansion at a Blocking Defect, less than 100% required verification coverage, failed monitoring/recovery/status capability, support overload, or forecast 75% quota. At 90% quota stop new promotion. Review each channel after four weeks and at least 50 attributed opens; Product Owner records continue/change/stop. No conversion threshold is invented without approval.

Approved sequence:

1. Topeka city limits Regional Public MVP
2. Small-Community Expansion to one Eligible Small Community at a time

Before the first move from Topeka into a small community, release gate RG-01 must pass and the Product Owner must separately name one Eligible Small Community. One Package 12 run privately prepares only that area's anchor owner and exact listing set and reuses Package 10A/10B consent, catalog promotion, recovery/capacity, preactivation signing, channel, stop, and rollback controls before activation. After activation, the Community Expansion Gate measures that current community and must pass before a separately approved Package 12 run for the next community. Package 12 is repeatable once per area for ordinals 1–3; every run requires a separate Product Owner selection.
3. Stop after three communities for a larger-metro readiness review; Kansas City is only a candidate after that review passes

An Eligible Small Community must be outside a larger metro, roughly within a 60-minute drive of Topeka, contain at least two antique or vintage shops, and have at least one willing anchor Store Partner before activation. Add and validate only one community at a time.

Before activating another community, the Community Expansion Gate requires:

- At least two verified active shop listings
- One anchor Store Partner who completed onboarding, one direct edit, one controlled change, and one support request
- One multi-stop community trip each by Scott and the Independent Internal Tester using separate accounts and phones
- Voluntary trip-use confirmation from five additional shoppers without requiring precise-location tracking
- Passing monitoring, support, and store-data accuracy checks
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Dated Primary Internal Tester approval

No minimum calendar duration applies. Any failed or incomplete check blocks the next community. Exact community choices remain to be approved.

Earlier discovery candidates, not an approved launch sequence:

- Topeka
- Kansas City metro
- Wamego and surrounding northeast Kansas
- Wichita
- Joplin
- Oklahoma City

Only Topeka city limits is approved for the Regional Public MVP. Each later community requires selection under the approved eligibility rule, and larger-metro geography requires separate approval after the three-community review.

The seeded store database may include known stores from product discovery only under the Store Data Provenance policy. It must contain no private household ratings, notes, photos, copied descriptions, third-party reviews, or unlicensed provider content.

## Protected internal synthetic review exception

Scope and constraints: [ADR 0007](docs/adr/0007-protected-internal-synthetic-review.md). This reference supplies no new assessment authorization; see [current assessment boundary](PRD.md#assessment-environment-boundary).


## Governed internal synthetic admission

Scope and constraints: [ADR 0008](docs/adr/0008-governed-internal-synthetic-admission.md). This reference supplies no new assessment authorization; see [current assessment boundary](PRD.md#assessment-environment-boundary).

## Budget and commercial direction

No new out-of-pocket spending is authorized for private testing or pre-revenue work. Use available resources and assets with documented free-use rights; check actual provider/tool/model capacity and no-overage behavior before relying on them. If the required safeguards cannot be met within the budget, present the actual cost and a smaller evaluation or deferral rather than incur charges or waive the safeguard.

Later operating expenditure may be funded from actual available site revenue, but no dollar ceiling, revenue allocation, purchase, subscription, or activation is approved here. Agree a concrete funded limit before making a financial commitment; store count and projected sales are not available funds.

The intended revenue remains optional store listing/photo-capacity upgrades under the approved [Free/Gallery/Full Gallery membership contract](docs/specs/store-membership-spec.md). There are no inferred shopper charges, sales commissions, paid ranking, new prices, or live billing. Paid activation remains subject to the existing commercial and release gates.

## Public, multi-user product policy

The application is not built for one household. Original research informs the design but personal data and personal assumptions must be removed.

## PWA first policy

Build a Progressive Web App first. Preserve the ability to package the same app for Android later with Capacitor.

## Public ratings resemble Google-style ratings policy

Stores have public 1–5 star aggregate ratings and review counts.

## Separate rating concepts policy

- Public store rating
- Private personal rating
- Private personalized match score

## Preference profile belongs to the user account policy

Every user's taste model is private and individualized.

## Directory data sources and provenance policy

Store Partners provide and confirm their own listing data. A non-partner listing may contain only manually verified public business facts: name, address, phone, hours, website, and categories. Preserve Store Data Provenance with the source URL or owner confirmation, verifier, and verification date. Do not copy descriptions, photos, or reviews without permission. Do not scrape or bulk-import a source without written license review. Google Places content is not the stored catalog; an optional Google place ID may be retained for a later approved live lookup that follows current [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), attribution, and provider terms.

## Store Browser is the shopper front door policy

Open on a list-first Store Browser, not the trip planner or map. Search supports store name, town or area, and category. Manual area browsing works without device location. An optional map is a secondary view. Each store card shows a cover image or neutral placeholder, name, town or distance when available, category/what-you-will-find summary, today's hours and open state, freshness state, Save, and Add to Trip. Store Details adds the approved gallery, description, address/map, full hours/exceptions, contact links, provenance/freshness, Navigate, Report correction, and shopper-private history.

## Official Store Profile Photos policy

Include rights-cleared Official Store Profile Photos in the Store Browser, Store Details, and trip presentation. Internal Alpha uses generated fictional images for Synthetic Stores. Real images must be provided by an authorized Store Partner or have specific documented permission; automatic website/social screenshots and copied third-party images are prohibited. Store Representatives submit photos through a Store Change Request; quarantine, validation, re-encoding, metadata removal, accessible alternative text, and Administrator approval precede display. A missing photo uses a neutral placeholder and does not hide an otherwise valid listing. Shopper/review photo submissions remain deferred until after the Regional Public MVP.

## Listing freshness and stale behavior policy

A listing remains verified for 180 days after Store Partner confirmation or manual source verification. A correction or closure report triggers immediate review. From day 181 through day 365, label the listing `Verification overdue`, keep it searchable with a warning, and exclude it from Open Now and automatic trip ordering. After day 365, hide it from normal discovery until reverified. Never automatically delete the listing or its provenance. Successful reverification resets the clock.

## Trip app owns the itinerary policy

Navigation providers handle only the current leg.

Regional Public MVP limits one trip to eight active stops. This bounds phone usability, offline state, and deterministic Check My Day evaluation; a later measured need may raise the limit through a product/algorithm contract change.

## Professional and commercial standard policy

The application must be secure, maintainable, moderated, monitored, and polished enough to promote through opt-in printed flyers in participating stores.

## Security is launch-blocking policy

Security, privacy, moderation, backups, logs, incident response, and authorization testing are required before launch.

## Regional launch policy

Start with one strong region and verified store data rather than a sparse national launch.

## Staged release gates policy

Launch first as a controlled-access Private Beta without public user-generated content. After directory, trip planning, moderation, and abuse controls are proven, launch a Regional Public MVP with text-only public ratings and reviews.

Repository implementation and external activation are separate decisions. Implementation may close when the required code, tests, review, and staged-off controls are merged. Human, provider, legal, payment, research-cohort, promotion, and production evidence belongs to the gate that authorizes that external action and does not keep a repository-complete implementation ticket open.

## Regional Public MVP boundary policy

The Regional Public MVP requires Packages 1–10B and every named provider, human-capacity, security, privacy, legal, recovery, accessibility, age-representative usability, operations, and release gate. Phase headings are capability groupings, not execution authority. Defer Phase 4 finds/households, Phase 5 preference onboarding/personalization, shopper/review photos, and owner review responses until after the Regional Public MVP.

## In-person store-partner pilot policy

Choose a Pilot Area where direct shop-owner outreach is practical before public product promotion. A candidate shop is a Prospective Store Partner until an authorized owner or manager explicitly agrees to participate; that person may then join the Private Beta as a Beta Tester. Do not imply a partnership before consent.

## Topeka Private Beta Pilot Area policy

Use Topeka city limits as the future Private Beta Pilot Area. Store outreach, partner claims, and real-location import remain deferred until a separate pre-pilot readiness gate is defined and passed.

## Internal Alpha before external participation policy

Run an Internal Alpha before adding real stores or contacting any owner or public entity. It begins with a Solo Agent-Assisted Alpha: Scott, as Primary Internal Tester, operates all separate role accounts and may supervise AI Test Agents. It ends with Two-Person Acceptance: Scott's wife, as Independent Internal Tester, performs shopper acceptance using her own account and phone. AI evidence cannot substitute for her independent acceptance or approve a release gate. Test with Synthetic Stores only. Synthetic records may represent store types and owner workflows, but must not use real names, logos, photos, reviews, or imply affiliation.

## Separate Internal Alpha accounts policy

Every role uses a separate Test Account. During Solo Agent-Assisted Alpha, the Primary Internal Tester operates Test User A and may use a separate Agent-Assisted Shopper Account for user-two simulation while preserving separate sessions, ownership, and visibility. During Two-Person Acceptance, the Independent Internal Tester uses a newly created Test User B account on her own phone; the solo-stage account is never reassigned to her. Test User A and Test User B may intentionally perform identical actions or enter duplicate values, but neither can read or change the other's private data. Household sharing remains disabled during this isolation test; recipient-specific Candidate Share grants no household membership or broader access.

## Recipient-specific Candidate Share policy

An authenticated shopper may send one Candidate Link to one named authenticated recipient. The recipient may accept or dismiss only that share; acceptance creates a recipient-owned Trip Idea. Preserve the original URL, capture time, sender-supplied note, and extraction provenance. Treat extracted name, address, hours, contact, inventory, or event hints as unverified suggestions until the recipient reviews them. A blocked, private, or unsupported source retains the link and uses manual-entry fallback. Candidate Share never publishes a store or event, implies a Store Partner relationship, enables household access, or exposes either shopper's other private records. Include this narrow Capture workflow in Internal Alpha and the Regional Public MVP while full household lists and public Events remain deferred. Approved 2026-07-30.

## Candidate Share expiry and cleanup policy

A pending Candidate Share expires 30 days after it is sent. The sender may revoke it while pending, and the named recipient may dismiss it. An expired, revoked, or dismissed unaccepted payload becomes unreadable and unclaimable immediately and is deleted from the primary database and associated Storage within 24 hours. Acceptance creates a recipient-owned Trip Idea governed by the approved private-content lifetime; it does not expose later recipient edits or activity to the sender. Approved 2026-07-31.

## Candidate Share delivery and abuse protection policy

The sender addresses a Candidate Share to the verified email of an existing Antique Trail account. The server resolves the address to that account without revealing whether an account, block, or delivery match exists; only the matched verified account may receive or open the payload. The recipient may Accept, Dismiss, Block, or Report. Block closes the current share and denies later shares from that sender. Report closes the share and creates an access-controlled moderation case. The sender sees only `Pending`, `Accepted`, or `Closed`; `Closed` does not distinguish an unknown or unverified address, dismissal, block, report, revocation, or expiry. Use the same generic confirmation, response shape, and timing behavior for matched, unmatched, and blocked addresses, with server-side rate limits. Do not send an invitation or payload to an unregistered address. Approved 2026-07-31.

## Representative Test Account policy

Internal Alpha includes a separate Representative Test Account scoped to one Synthetic Store and operated by the Primary Internal Tester. It is never shared with shopper sessions. The Independent Internal Tester is not required to use it. It cannot access shopper saves, personal ratings, notes, trips, or other private records.

## Store Representative publishing split policy

Store Representatives may directly publish regular hours, holiday hours, phone, website, official description, and temporary closure for their assigned store. Name, address or coordinates, ownership, permanent closure, category tags, and Official Store Profile Photos require an approved Store Change Request. Store Representatives never edit reviews or access shopper-private data. See `docs/adr/0001-split-store-representative-publishing-by-field-risk.md`.

## Administrator approval during Internal Alpha and Private Beta policy

Use a fourth, separate Administrator Test Account to approve or reject Store Change Requests, grant or revoke representative roles, and inspect audit records. It uses a separate session with MFA and cannot access shopper-private data. For initial Regional Public MVP, the Administrator also performs narrowly scoped routine review moderation with MFA, recent authentication, reason-coded transitions, minimized case evidence, and append-only hash-chained audit with externally anchored roots. Defer a separately staffed Moderator role until review volume requires one.

## Internal Alpha feature boundary policy

Internal Alpha includes four-role authentication; a list-first Synthetic Store Browser with search, optional map, details, hours, and generated fictional profile images; private Candidate Link capture, recipient-specific Candidate Share, and Trip Ideas using synthetic sources; private saves, personal ratings, and notes; hours-aware trip planning; active-trip navigation handoff; offline recovery; Store Representative and Administrator workflows; and audit records. It applies the Age-Inclusive Usability Baseline. It excludes public reviews, shopper/review photos, household lists or broad shared access, finds and collections, public Event records, notifications, owner analytics, advanced personalization, and real stores.

## Internal Alpha shopper-trip exit gate policy

The Primary Internal Tester using Test User A and the Independent Internal Tester using Test User B must each complete three successful Shopper Trip Acceptance Runs on separate phones and accounts. At least one run must prove Test User B can send a synthetic Candidate Share to Test User A, Test User A alone can accept it into a recipient-owned Trip Idea and add it to Plan, and neither account can read the other's unrelated private records or recipient edits. Anonymous, wrong-recipient, Representative, and Administrator access must be denied. For each account, at least one run must prove active-trip recovery after refresh or app restart and while offline. Across the runs, the tester must exercise navigation handoff, arrived/completed/skipped/closed stop states, and route recalculation. AI-assisted or Primary Internal Tester runs against Test User B are supplemental and do not replace the Independent Internal Tester's three runs. The gate requires zero Blocking Defects and zero unauthorized cross-account exposure or modification of shopper-private data.

## Internal Alpha privileged-workflow exit gate policy

The Primary Internal Tester must operate two complete Privileged Workflow Acceptance Cycles using the separate Representative Test Account and MFA-protected Administrator Test Account; the Independent Internal Tester is not required to operate privileged accounts. Across each cycle, every Representative-Managed Field must publish directly; at least one Store Change Request must be approved and one rejected; unapproved Controlled Store Fields must remain unpublished; representative self-approval must fail; revocation must block further writes from the representative's existing session; and all privileged actions must have audit records. Both privileged accounts must remain unable to read or modify Test User A or Test User B shopper-private data. The gate requires zero Blocking Defects; every allowed action must succeed and every forbidden action must be denied.

## No store-owner participation before readiness policy

Do not contact or include a store owner, import a real store, or add any external participant until Solo Agent-Assisted Alpha and Two-Person Acceptance pass and a separate External Testing Readiness gate is defined and passed. After that gate passes, invite one consenting Store Partner representative into the controlled, invitation-only Private Beta to test the real owner workflow before public access. The gate does not authorize public product promotion.

## External Testing Readiness gate policy

Before first-owner contact, require dated passing evidence approved by the Primary Internal Tester for all nine checks: both Internal Alpha stages; the complete authorization and security test set; zero open Blocking Defects or known privacy, security, or data-loss defects; successful backup-restore and rollback rehearsals; working pilot-environment monitoring, error reporting, and support intake; legally reviewed final pilot privacy notice and owner-consent wording; one successful External Testing Dress Rehearsal; one Private-Beta incident rehearsal covering detection, containment, credential/scope revocation, user/store communication, database and Storage recovery, deletion-receipt replay, and post-incident evidence; and documented confirmation from qualified counsel/insurance professionals that the operating legal entity and required pilot insurance are active for the planned owner contact and participation. A failed check blocks outreach. AI Test Agents may collect evidence but cannot approve the gate.

## First Store Partner onboarding policy

Demonstrate the product using Synthetic Stores only. Before creating a real store record or representative account, obtain Store Partner Pilot Consent and verify the representative's authority both in person and through a published business contact. The representative must use an owner-controlled verified email and MFA; shared credentials are prohibited. Consent states that the pilot is voluntary, invitation-only, unpaid, non-endorsing, and not public product promotion. On withdrawal, revoke representative access and remove the real store from the active pilot. Audit onboarding, scope grants, withdrawal, and revocation.

## First Pilot Store Record policy

After consent and authority verification, atomic Administrator approval of the owner-submitted Pilot Store Draft creates one Pilot Store Record using owner-confirmed name, address, phone, website, regular and holiday hours, official description, and category tags. Record the source/provenance and verification date. The Store Representative then tests the already-approved Representative-Managed Field workflow and submits rights-confirmed Official Store Profile Photos through Store Change Requests. Quarantine and process images before Administrator approval and display. Restrict the record to invited Private Beta participants. Exclude ratings/reviews, shopper/review photos, events, owner responses, and analytics.

## Initial Private Beta Cohort policy

Limit the Initial Private Beta Cohort to four human accounts and one Pilot Store Record: Scott's separate shopper and Administrator accounts, Scott's wife's separate shopper account, and the first owner's Store Representative account. The owner does not use the representative account for shopper activity; any future shopper testing requires a separately approved account. AI and Agent-Assisted Test Accounts remain restricted to Synthetic Store data. Do not add another user or real store until a separate expansion gate passes.

## Initial Private Beta Expansion Gate policy

Before adding any additional user or a second real store, require dated evidence approved by the Primary Internal Tester that: the owner completed Representative-Managed Field edits, one independently completed direct hours/content edit, submitted two Store Change Requests that the Administrator approved and rejected respectively, used MFA, and participated in a scheduled revoke/regrant test; Scott and the Independent Internal Tester each completed two shopper trip runs containing the Pilot Store Record; support and feedback intake worked; privileged audit records were complete; monitoring, backup restore, and rollback checks remained passing; and no Blocking Defect or known privacy, security, or data-loss defect remained open. The owner must independently record `continue` or `withdraw` and whether the listing is useful, hours maintenance and reviewed changes are understandable, each flyer/social channel is accepted or declined, and the operator interventions/minutes/support cases were acceptable. `Withdraw` or missing owner evidence blocks expansion; `continue` still requires Product Owner acceptance of support load. No minimum calendar duration applies. A failed check blocks expansion.

## Controlled Private Beta Expansion policy

After the Initial Private Beta Expansion Gate passes, add one Store Partner and one Pilot Store Record at a time. Apply the same consent, authority verification, account onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks to each addition before adding the next. Cap the controlled Private Beta at three total Store Partners and stores. Keep it invitation-only with no public product promotion. After all three pass, stop expansion and conduct the separate Regional Public Readiness Gate below; passing the pilot does not automatically authorize public access.

## Regional Public Readiness Gate policy

Public access remains blocked until dated evidence proves all three Controlled Private Beta additions passed; every Package 1–10A prerequisite required by the Regional Public MVP passed; all provider, human-capacity, security, privacy, legal, accessibility, browser/device, support, availability, DB/Auth/Storage recovery, and incident gates passed; and zero Blocking Defects or known privacy, security, or data-loss defects remain. Topeka catalog readiness additionally requires 100% of active discoverable listings inside their approved verification interval, at least 12 active verified listings inside Topeka city limits, at least 70% coverage of an independently enumerated eligible-shop baseline, and at least three valid unique three-store itineraries on each of Tuesday, Friday, and Saturday—nine total—using current hours. Use one non-holiday date per named day within 30 days after the baseline recheck; each itinerary starts at the first store's verified opening, allows 45 minutes per store plus a 10-minute transition buffer, uses the accepted Package 5B provider's recorded travel-time matrix, and finishes every visit no later than verified closing. An eligible shop is a brick-and-mortar business inside Topeka city limits, open to the public on at least one recurring day per week, whose primary advertised inventory is antiques or vintage goods; event-only markets and general thrift or consignment businesses without that primary focus are excluded. Two people independently enumerate the baseline from dated public sources, reconcile disagreements, preserve the source list, and recheck it within 30 days before signature. If the 70% rule requires fewer than 12 listings, 12 still controls; if fewer than 12 eligible shops exist, the Product Owner must approve a written market-size exception instead of silently weakening the gate. Before public product promotion, at least eight invited independent Topeka shoppers outside the Initial Private Beta household/owner cohort—including the approved older-adult cohort where eligible—must attempt Browse, Details, Plan, Go, and private visit memory; at least seven must complete without a Blocking Defect and at least five must confirm return intent or complete a second trip. The Product Owner signs the evidence. Public deployment, product promotion, and anonymous real-store access remain unauthorized until that signature and Package 10B's public recovery/domain/capacity gate.

## Regional growth sequence policy

Use Topeka city limits for the first Regional Public MVP. After Package 11 RG-01 passes and the Product Owner separately selects one Eligible Small Community, Package 12 privately recruits its approved anchor owner, verifies at least two listings, and reuses Package 10A/10B exact catalog, consented-promotion, recovery/capacity, preactivation signature, and rollback controls before activating only that area. After activation, run the Community Expansion Gate below; its passing receipt is required before a separately approved Package 12 run for another community. Package 12 is repeatable once per area for ordinals 1–3, with a separate Product Owner selection each time. An Eligible Small Community is outside a larger metro, roughly within a 60-minute drive of Topeka, has at least two antique or vintage shops, and has at least one willing anchor Store Partner before activation. Stop after three communities and conduct a separate larger-metro readiness review before considering Kansas City or another larger metro. Exact communities remain unresolved.

## Community Expansion Gate policy

Before activating another small community, require dated Primary Internal Tester approval that the current community has: at least two verified active shop listings; one anchor Store Partner who completed onboarding, one direct edit, one controlled change, and one support request; separate-phone/account multi-stop trip runs completed by Scott and the Independent Internal Tester; voluntary trip-use confirmation from five additional shoppers without requiring precise-location tracking; passing monitoring, support, and store-data accuracy checks; and zero open Blocking Defects or known privacy, security, or data-loss defects. No minimum calendar duration applies. A failed or incomplete check blocks the next community.

## In-person Store Partner QR invitation policy

After a Synthetic Store demonstration and verbal interest, the recently authenticated MFA-protected Administrator creates a Store Partner Invitation and displays its QR code. The QR contains only an opaque random token, expires after 30 minutes or one successful redemption, and contains no owner, store, email, or role data. Scanning opens the same PWA's partner-onboarding page; it does not install the PWA or grant access. The owner reviews the pilot privacy notice and terms, enters the required consent statements and identity credentials, and submits once. One idempotent transaction consumes the invitation, stores an immutable provisional consent submission, and creates an owner-controlled Pending Partner Identity with no store, role, scope, or pilot-data grant. The owner then verifies email and configures MFA. Only after verified email and MFA does the system finalize the immutable Pilot Consent Receipt, bind it to that verified email, and deliver the owner copy. Interruption before transaction commit consumes nothing; interruption after commit resumes the same pending onboarding record and cannot create a second identity or receipt. The invitation remains pending for authority review until the Administrator independently verifies authority through the published business contact and approves it. Only final Pilot Store Draft approval may create the Pilot Store Record and store-scoped Store Representative grant. Installation instructions appear after approved sign-in. Generation, expiry, revocation, consumption, provisional consent, identity creation, email/MFA verification, receipt finalization, authority review, approval, role grant, and installation handoff are audited. See ADR 0002.

## Store Partner pilot-consent capture policy

Use a phone-friendly consent screen with a plain-language summary and links to the full, legally reviewed pilot privacy notice and terms. Require separate acknowledgments of authority, voluntary participation, permitted store-data use, no payment or endorsement, and withdrawal. Require typed name, business title, store name, and owner-controlled email. Submission creates the immutable provisional consent record and unprivileged Pending Partner Identity atomically; it does not grant access. After email verification and MFA, finalize the immutable Pilot Consent Receipt with the provisional submission, verified email, finalization timestamp, invitation identifier, and policy version. Email the owner a receipt/PDF copy without internal verification evidence. Administrators may view but never edit either consent record. A material term change requires fresh consent before continued participation.

## Pilot Store Draft review and approval policy

After consent, verified email, and MFA, the Pending Partner Identity enters the owner-confirmed core listing fields into a Pilot Store Draft. Only that identity and Administrators may read it. The owner may edit while draft or changes-requested and submits it for review. The Administrator verifies the submission against the published business contact and may approve it or return comments, but may not silently edit owner-submitted values. The owner corrects and resubmits. Approval requires MFA, recent authentication, and an exact final preview. One atomic transaction freezes the approved draft snapshot and provenance, creates the Pilot Store Record, and grants only its store-scoped Store Representative role; any failure creates neither record nor grant. Preserve comments and all state transitions in the audit history. See ADR 0003.

## Representative activation and first login policy

After successful approval, send a status-only email containing the normal PWA sign-in link; never send a reusable invitation, magic role, or authorization token. The owner signs in using the already verified email and MFA. The portal shows the exact approved Pilot Store Record, store-scoped Representative permissions, Pilot Consent Receipt, and approval history, then offers device-appropriate PWA installation instructions. Start a guided checklist: confirm the listing, review hours, make one Representative-Managed Field edit, submit one Store Change Request, and use pilot support. Changes-requested or rejected emails contain status only; comments and store data require authenticated portal access. Audit email delivery, first approved sign-in, installation handoff, and checklist progress. See ADR 0002.

## Store Partner Pilot Support policy

Provide an in-app Pilot Support Ticket workflow with categories for bug, confusing workflow, store-data correction, feature idea, and security/privacy concern. Automatically attach only store/account identifiers, app version, timestamp, and basic device/browser details; never attach tokens, shopper data, precise location, or internal logs. Allow an optional screenshot only after owner preview. The submitting Store Representative and Administrators may read the ticket, replies, and status in the authenticated portal. Email contains status only. Security/privacy concerns trigger an urgent Administrator alert. A fallback support email accepts sign-in-failure reports but exposes no pilot data until identity is verified. The owner may confirm resolution or reopen the ticket.

## Product promise and first arrival policy

The product promise is: “Antique Trail makes a fun day of antique shopping easy to see, easy to plan, and easy to trust.” Browse Stores is the first-arrival screen for the approved area and shows results immediately without sign-in or location permission. Anonymous visitors may Browse, open Store Details, and Navigate. Save, Add to Trip, private ratings, and private notes use just-in-time authentication and return to the interrupted action without creating a write on cancellation or failure. Approved through D5–D6 on 2026-07-30.

## Trip construction and readiness policy

Add to Trip always names the destination trip and supports an explicit existing-trip or new-trip choice. A new trip initially requires only editable area name and date; starting point, departure, optional return, and stop durations are completed progressively in Plan. Starting location is private, manual by default, and may use current location only after an explicit action. Check My Day previews a suggested feasible order, explains reasons and warnings, and never silently reorders. Users choose `Use Suggested Order` or `Keep My Order`; accessible move controls remain available. Approved through D7–D14 on 2026-07-30.

## Active trip and private visit memory policy

Arrival is manual; Antique Trail does not geofence or provide turn-by-turn navigation. Go shows one stop at a time and hands the current leg to an external map. A quiet active-visit screen ends with `Done Here`, then offers an optional private 1–5 rating, return choice of No/Maybe/Yes, and note. Skip is immediate and reversible with Undo. Completion or confirmed early ending produces a private summary and immutable visit history; private notes and ratings remain editable, and `Plan Again` clones the trip. Approved through D15–D19 on 2026-07-30.

## One-trip partner handoff policy

A Trip Creator may invite one Trip Partner to one trip. Both may edit the draft, and either may be assigned Navigator. Only the Navigator controls Go; the other participant sees read-only progress. Ratings and notes stay private to their author, and neither participant gains access to the other person's unrelated trips or account data. The invitation is bound to a verified matching email, single-use, valid seven days, and may be presented through the native share sheet or a QR code. Removal of an active Navigator pauses the trip until another Navigator is assigned. Approved through D20–D21 on 2026-07-30.

## Offline active trip policy

Only the assigned Navigator receives the minimum offline snapshot for the active trip. Arrival, completion, skip, private rating, and private note may be recorded offline with a visible pending-sync state and safe resume after refresh or restart. Draft collaboration stays online-only. The partner sees last-updated state, and external-map offline availability remains outside Antique Trail's control. Approved as D22 on 2026-07-30.

## Offline active-trip storage policy

Persist only the assigned Navigator's minimum active-trip snapshot and pending offline mutations in encrypted IndexedDB. Bind the cache cryptographically to the authenticated account and local PWA installation with a non-extractable device-local Web Crypto key; never place authenticated trip data in the public service-worker cache. The snapshot may survive refresh, browser close, and PWA restart. Purge it after completed-trip changes successfully synchronize, on account switch, and on logout. If unsynced changes exist, logout must warn plainly that continuing will delete those local changes and require explicit confirmation. On known authorization loss, delete the key and cache; when the device was offline during revocation, recheck authorization on reconnect and purge before accepting sync or showing refreshed private data. Already decrypted data on an offline device cannot be remotely recalled. Approved 2026-07-31.

## Offline synchronization and device precedence policy

Bind each active Go session to one Navigator account and one active Navigator device. A device transfer requires authenticated online confirmation; the old device cannot submit later mutations after transfer. Give every offline mutation a unique idempotency key and local sequence number, then replay authorized mutations exactly once in their original order. Server authorization, current Navigator/device assignment, and trip lifecycle/state always win. Reject queued actions that lost authorization or conflict with a completed/reassigned trip, and show a plain sync explanation without exposing other-account data. Apply non-conflicting actions normally. If the same private rating or note changed from the offline base version on another device, preserve both versions and require the author to choose `Keep This Phone's Version` or `Keep Saved Version`; never silently overwrite either. Approved 2026-07-31.

Online shared-draft edits use one monotonically increasing trip version and an idempotency key per mutation. Every reorder, add/remove, time/duration, return, partner, or Navigator mutation names its base version. A stale base is rejected without partial application; the client loads the latest plan, highlights the changed fields/order, and offers `Reapply My Change` or `Keep Latest`. Reapply is a new authorized mutation against the new version. Never last-write-wins, silently merge ordered lists, or expose the other participant's private fields. Approved 2026-07-31.

## Store Portal and publishing states policy

Store Portal home shows store identity, listing status, hours verification/staleness, `Update Hours`, and `Preview Listing`, with secondary access to Store Info, Photos, Pending Changes, and Access & Help. It excludes analytics, advertising, and shopper data. Every field is labeled `Publishes Immediately` or `Requires Admin Review`; controlled changes preserve the current public value and use Pending, Changes Requested, Approved, or Rejected states. Approved through D23–D24 on 2026-07-30.

## Hours editing policy

Representatives maintain weekly Open/Closed hours, one range plus an optional second range, dated exceptions, and closure dates. Approved address determines time zone. A 14-day preview and explicit confirmation precede publication; successful publication refreshes verification and offers Undo. Active trips receive updated hours on next sync while completed history remains frozen. Approved as D25 on 2026-07-30.

## Store Updates and Vendor Contributor boundary policy

Store Representatives may post native Store Updates of New Finds, Sale, Announcement, or Store News. Text publishes directly; any image remains held for Administrator image approval. The latest three appear on Store Details with `See All`. No scraping, feed synchronization, comments, likes, or event system is included. MVP may label store-posted vendor content, but a separate Vendor Contributor role is deferred until pilot demand and authorization testing justify it; if added, it is store/booth-scoped and draft-only. Approved through D26–D27 on 2026-07-30.

## Official images and social links policy

Free allows one cover plus five gallery images; Gallery allows one cover plus fifteen gallery images; Full Gallery follows its active published non-count limits and has no plan-count cap. A Store Update may contain one image. Every profile-image change requires Administrator approval, and the current image remains live during replacement. Uploads require preview/crop, meaningful alternative text, rights confirmation, quarantine, re-encoding, metadata removal, and review. Copied website/social screenshots and shopper images are prohibited. A verified Representative may directly publish one validated official link for each approved social platform; no credentials, embed, scrape, sync, or imported tracking is allowed. Approved through D24–D25 on 2026-07-30; tier-specific cap amendment approved 2026-08-30.

## Store Update lifecycle and support policy

Sales require an end date and auto-archive. Announcements may have an end date; New Finds and Store News archive manually. Archive is reversible and representatives do not permanently delete history. Pilot Support uses categorized tickets, allowlisted diagnostics, at most one previewed/sanitized screenshot, authenticated replies/history, status-only email, urgent security routing, and a verified-identity fallback for sign-in failure. Approved through D26–D27 on 2026-07-30.

## New-store discovery policy

Authenticated shoppers may see `New Since Your Last Visit` based only on a coarse last-seen timestamp and manually selected area. The in-app card appears in Browse and home/return context, links to the new listings, and may be dismissed. No push/email notification, background location, or behavior tracking is implied. Approved as D28A on 2026-07-30.

## Administrator home and review workspace policy

Administrator home shows role/environment, urgent safety items, and one grouped `Needs Review` queue ordered urgent-first then oldest. It excludes shopper activity, ratings, trips, traffic, and marketing. The review workspace preserves fixed context, shows current and requested values or image evidence, provides type-specific Approve/Request Changes/Reject actions, requires reasons where applicable, confirms effects, and writes audit records. Administrators cannot directly edit submissions, bulk approve, or silently advance. Approved through D28–D29 on 2026-07-30.

## Access & Safety policy

Access & Safety separates pending invitations from active Store Representative grants and shows exact scope, verified-email/MFA state, dates, and relevant privileged activity without shopper activity. Revocation requires Administrator MFA, recent authentication, reason, and consequence preview; it removes only the selected store scope and blocks the next server-authorized write, including an open session. Regrant repeats identity and scope gates. No bulk changes, multi-store Representative grants, self-service role changes, or history deletion are allowed. Approved as D30 on 2026-07-30.

## Startup Learning MVP policy

After the first slice, `SLM-01` is a later private value checkpoint: Packages 1, 2, 3, and 5A with Synthetic Stores. It proves separate Test User A and Agent-Assisted Shopper accounts can complete Browse → Details → Save → manually ordered hours-aware Trip → one-trip Partner/Navigator handoff → external-map Go → private visit memory, including refresh/offline recovery and cross-account denial. Package 4 Candidate Share is a separate branch and does not block this checkpoint. SLM-01 excludes Package 5B routing suggestions, Store Partner/Admin workflows, real stores, external participants, public reviews, public indexing, acquisition, or advertising. Completion authorizes only Product Owner continue/revise/stop disposition; it does not skip any Regional Public MVP package or gate. Approved 2026-08-03.

SLM-01 `continue` additionally requires both accounts to finish without an outside planning document, retain every input through refresh/offline replay, correctly explain hours warnings and the absence of travel-time calculation, pass every cross-account allow/deny result, and show a written comparison with the current completion-time/retyping/tool-switch baseline. The Product Owner must identify at least one reduced burden without material regression in the others and record both testers' return intent. Any privacy/authorization/data-loss failure is `stop`; incomplete flow, warning misunderstanding, or no supported burden improvement is `revise` or `stop`. Approved 2026-08-03.

## Startup free-service and hosting boundary policy

The startup `$0` infrastructure boundary includes audit anchoring and geocoding as well as the services listed below; failure to find a compliant free L-01/R-01 option disables the dependent remote capability rather than authorizing spend.

Local development, Shared Synthetic Alpha, SLM-01, and Controlled Private Beta must use `$0` recurring infrastructure unless the Product Owner separately approves a paid service. Automatic upgrades and paid overages are prohibited. The rule includes hosting, database/Auth/Storage/functions, email, routing, backups, monitoring/status, scanning, and bandwidth; domain registration, legal/insurance services, and optional printing remain separate approval-controlled costs. A free plan that cannot prove eligibility or the applicable access, security, privacy, deletion, recovery, or abuse requirement blocks that stage; the requirement is not weakened. Vercel prebuilt deployment plus Supabase is selected under ADRs 0006/0005; Vercel replaced Cloudflare for the frontend on 2026-08-20. Regional Public MVP remains blocked until its 15-minute RPO is proven by an approved paid configuration or validated `$0` alternative.

## Product promotion is not monetization policy

Antique Trail may promote its own Regional Public MVP only after Package 10B signature. Startup has no ad inventory, sponsored listing, paid ranking, affiliate link, lead sale, shopper-data sale, paid claim verification, paid Store Partner tier, ad network, or behavioral targeting. Verification, discovery order, public ratings, and moderation cannot be purchased. Any monetization requires a new Product Decision and is deferred at least through RG-01 and the separately approved first three small-community reviews. Approved 2026-08-03.

Approved unpaid launch channels are opt-in Store Partner counter flyers and ordinary shopper QR codes, prospective-owner acquisition cards, one voluntary Store Partner social post, founder-owned public posts, permission-based antique/community groups, tourism/chamber/community calendars, earned local press/radio/newsletters, organic search, and native sharing of canonical Store Details URLs. No scraped lists, bulk unsolicited email, automated posting, group-rule bypass, or unapproved partnership claim. Scott is the initial Local Acquisition Owner. Package 10A prepares private artifacts and channel-specific consent; Package 10B alone authorizes publication/distribution. Withdrawal stops future distribution and reprinting, requests removal of remaining materials, and removes future logo/co-brand use. Non-partner listings may use verified public facts only and never imply participation. Approved 2026-08-03; owner-acquisition channel added 2026-08-30.

Three QR classes are mandatory and cannot be repurposed. Shopper promotional QR codes open `/stores?area=topeka-ks`. Prospective-owner acquisition cards open public `/for-stores`; they convey no admission, claim, account, or store authority. Secure Partner/readiness invitations alone use their fragment-token routes, remain short-lived and single-use, and are issued only after the applicable approval. The two public QR classes contain no bearer, account, authority, location, or user-identifying token. Privacy-safe source measurement, if enabled at Package 10B, uses only an allowlisted opaque aggregate `src` code and daily aggregate opens, Store Details opens, and share actions: no campaign cookie, device ID, fingerprint, IP-derived identity, user/account linkage, or owner-facing shopper analytics. Daily aggregates delete after 180 days; signed gate-receipt aggregates retain three years. Approved 2026-08-03; QR classes clarified 2026-08-30.

## Correction, claim, and review-delete closure decisions policy

- **Correction identity:** anyone may draft a correction, but submission requires just-in-time verified account authentication. Cancellation writes nothing. The submitter may read only reason-neutral status for their own report; anonymous writes and internal case detail are denied. Approved 2026-08-03.
- **Claim stage and evidence:** Package 6 builds/tests claims with Synthetic data while `public_listing_claims_enabled=false` through Alpha, Private Beta, and Package 10A. Package 10B alone may enable it after release signature. Two authority signals must use distinct channel classes, evidence objects, and verification events; the same email, phone, document, or contact cannot count twice. Regional Public MVP accepts content-free callback, mailed-code, public-filing, or in-person verification records. User-uploaded claim documents are not accepted; lease/utility evidence may be inspected in person but no copy is retained. Raw digital claim evidence has no approved storage path. Approved 2026-08-03.
- **Add-store stage and evidence:** Package 6 builds/tests a separate new-store application with Synthetic data while `public_store_applications_enabled=false`; Package 10B alone enables it with public claims. Search-before-add and repeated server duplicate matching are mandatory. Likely duplicates enter review and convert only with applicant confirmation to the existing-store claim path. A new store requires current Topeka eligibility, owner-confirmed core facts, independent Administrator verification/provenance, the same two independent authority-channel rule, and one atomic approval that creates public projection, exact grant, and default Free or creates none. Draft/terminal retention and rollback follow Package 6. Approved 2026-08-30.
- **Claim cardinality:** Regional Public MVP permits one active Store Representative grant per store and one active store scope per Representative. Transfer revokes the old grant before a new one can activate. Multi-representative and multi-store grants require a later Product Decision. Approved 2026-08-03.
- **Review delete:** deletion atomically removes public display and aggregate effect, enters `delete_pending`, and offers an accessible 60-second Undo. After the window, text purge completes within 24 hours subject only to minimum evidence already copied to an active restricted moderation/legal case. Approved 2026-08-03.

## Freshness requirements

- **Freshness:** track identity/location, contact, hours, categories/attributes, and media/social provenance independently. Listing-level freshness is the oldest required core fact group among identity/location, contact, hours, and categories/attributes; optional media/social does not stale the listing. Editing one group refreshes only that group. At day 181 show overdue and exclude the listing from hours-dependent route promises; after day 365 hide normal discovery until every required core group is reverified. Approved 2026-07-31.

## Account scope requirements

- **Account scope:** Regional Public MVP is United States only. Anonymous browsing has no age gate; account creation, public reviewing, Store Partner participation, and trip sharing require age 18 or older until legal review approves broader participation. Approved 2026-07-31.

## Trip duration and Check My Day requirements

- **Trip duration and Check My Day:** one trip has at most eight active store/rest stops. Default dwell is the verified store estimate or 60 minutes; presets are 30/45/60/90, and Custom accepts whole minutes from 5 through 720. Optional maximum drive is 1–500 miles and optional maximum total duration is 30–1,440 minutes. Stop priority is `Must`, `Prefer`, or `Flexible`; `Must` is the required-stop value. Package 5B uses the accepted provider's start/stop/optional-return distance/time matrix, exhaustively evaluates all orders, permits waiting before opening, and adds a 10-minute transition buffer. It selects by: routes satisfying every set maximum; most `Must` stores completed by closing; most on-time priority points (`Must=3`, `Prefer=2`, `Flexible=1`); most stores completed by closing; least summed proportional excess over unmet maximums; least late minutes; least travel minutes; most original adjacent pairs; then stable stop-ID sequence. Departure-to-first and last-to-return legs affect arrivals, distance, duration, limits, estimated finish, and scoring; rest stops are always-available private waypoints. The algorithm never drops a stop, auto-applies, or claims real-world optimality. Only provider selection remains ADR-gated. Approved 2026-07-31.

## Human usability acceptance

- **Older-adult cohort:** before public release, at least eight participants age 55+, including at least three age 70+ and at least two who use low-vision, motor, or assistive-technology adaptations, attempt Browse, Details, Add/Create Trip, Check My Day, Go/handoff, and private visit memory on their own device. At least 90% of required tasks must complete without moderator intervention, zero participant may encounter a safety/privacy/authorization failure, the group average is no more than one noncritical task error per participant, and every repeated critical failure must be fixed and retested. Approved 2026-07-31.

## Public review and scalable claim policy policy

- **Review eligibility:** Regional Public MVP accounts are verified-email, age-attested 18+, and rate-limited. A user may review after an Antique Trail trip marks that store `Done Here`, or after a manual `I visited` attestation that displays the honesty/conflict rules. One active review per user/store; rating is integer 1–5 with optional text. A new or edited review enters automated validation and may remain pending moderation. Approved 2026-07-31.
- **Display and aggregate:** publish rating, allowed text, author-chosen public display name, visit month/year, edit marker, and disclosed conflict only. Never publish email, exact visit time, trip, note, location, or account history. Aggregate is the arithmetic mean and count of active eligible ratings, updated transactionally with review state; show from the first eligible rating and label the count. No weighting, paid boost, owner override, or hidden personalized score changes the public aggregate. Approved 2026-07-31.
- **Conflicts:** the author must disclose current/recent employment, ownership, family, vendor, or compensated connection to the reviewed store. A currently scoped Store Representative cannot review that same store. Disclosed reviews remain visibly labeled and excluded from the aggregate; undisclosed material conflicts may be removed. Approved 2026-07-31.
- **Moderation:** reject or remove spam/duplicates, threats, harassment/hate, personal or sensitive information, illegal content, impersonation, undisclosed material conflict, compensated manipulation, irrelevant content, and claims that cannot safely remain while a legal/safety review is open. Do not remove a review merely because it is negative. At initial launch, an MFA/recent-auth Administrator may perform only the case-scoped `Hold`, `Remove`, `Restore`, and `Dismiss Report` transitions with a reason; every transition is append-only audited and evidence is minimized. A separately staffed Moderator role remains deferred until volume requires it. Store Representatives may report but cannot edit, suppress, answer, or identify reviewers. Owner responses remain deferred. Approved 2026-07-31.
- **Edit/delete/report:** author edits preserve internal version history and recompute aggregate atomically. Author deletion immediately removes public/aggregate effect, offers author-only accessible Undo for 60 seconds, then irreversibly finalizes and deletes current/historical text within 24 hours unless an open moderation/legal case already holds minimum copied evidence. Retain only content-free review/version/audit metadata after purge. Reports are rate-limited, reason-coded, non-public, and reveal no reporter identity to the store. Cases retain minimum evidence two years after closure. Updated 2026-08-03.
- **Appeal:** the author or scoped Store Representative may appeal a moderation result once within 30 days. The appeal states the challenged rule and new evidence. A different Administrator reviews when available; with one Administrator, an independent qualified reviewer signs the decision. Target decision is 14 business days. Restore recomputes aggregate; uphold supplies a plain rule-based reason. Appeal records follow the moderation-case retention. Approved 2026-07-31.
- **Review effect of account deletion:** scheduling account deletion immediately hides every active or pending authored review and removes its aggregate effect in the same transaction. During the seven-day cancellation window, the content remains private and inaccessible except to the cancellation workflow or a live restricted moderation/legal case. A successful cancellation restores the prior published/pending state only if the review remains eligible and is not held/removed. On day 8, delete the public display name and all current/historical review text; retain only content-free version/audit metadata, or the minimum evidence already copied into a live restricted case. Approved 2026-07-31.
- **Scalable claim verification:** after the three-store pilot, continue manual risk-tiered verification. Require verified email, MFA, exact store scope, and two independent authority signals from different channel classes: one claimant-controlled business-domain/published-contact response plus one of in-person inspection, published phone callback, business filing, or mailed code. Lease/utility evidence may be viewed in person but no copy is stored; user-uploaded claim documents are unavailable. High-risk conflicts, ownership transfers, closures, or duplicate claims require Administrator review and no silent auto-approval. Reverify authority annually and on risk signal; revoke exact scope immediately when authority ends. Approved 2026-08-03.

## Unresolved product and provider choices

1. Final product name and B-01 signed brand/domain consistency receipt
2. Exact Small-Community Expansion community choices
3. Route provider for Package 5B; the exact suggestion algorithm is approved above and Package 5A remains provider-free/manual-order
4. Paid photo-tier monetization after RG-01, three separately approved small-community runs/reviews, and the paid-value gate; until the new Product Decision and signed activation receipt, all billing, paid placement, data-sale, and ad products remain prohibited
5. Analytics provider; collect no optional product analytics until selected by ADR and consent/data review
6. Transactional email gate E-01; Resend Free is the planning candidate but current terms, domain authentication, failure behavior, and quotas must pass before external use
7. Official Store Profile Photo media-processing provider/workflow; real uploads stay disabled until M-01 passes. Shopper/review images remain post-MVP
8. Paid Vercel/public recovery configuration and monthly ceiling; ADRs 0005/0006 select the topology but do not authorize spend
9. Final public domain and the U.S. Supabase region recorded at environment creation; both are required by B-01/H-01
10. Legal entity and insurance; required before owner outreach/public operation but not a software behavior to invent
11. Structured Store Event model; not MVP because native Store Updates cover announcements/sales
12. D31 full Audit History UI and privileged-audit export; not MVP. Narrow D30 View Audit and two-year append-only retention remain required.
13. Named human operations backup, appeal reviewer, and sole-Administrator break-glass independent reviewer. Missing capacity keeps the dependent capability disabled; an AI agent cannot fill it.
14. Optional printing budget. Purchased media remains prohibited.
15. H-01 signed environment activation receipt; ADRs 0005/0006 accept the topology but no shared environment until Vercel plan eligibility, automatic-deployment disablement, Deployment Protection, prebuilt artifact binding, serial restore, Auth/Storage recovery, quotas, and rollback pass
16. L-01 separately administered append-only audit-anchor sink; startup privileged remote mutation stays disabled unless a `$0` option passes
17. SEC-01 named independent public-release security reviewer and signed/retested result

## Directory capability acceptance

Features:

- Responsive app shell
- List-first Store Browser as the default shopper entry point
- Search by store name, town/area, and category
- Optional map toggle; never the only discovery path
- Scannable store cards and Store Details
- Approved Official Store Profile Photo cover/gallery with neutral fallback
- Hours
- Categories
- Last-verified information
- Listing freshness state and warnings
- Report incorrect information
- Provenance-controlled seed import
- Authentication
- Just-in-time authentication that resumes the interrupted private action
- `New Since Your Last Visit` using coarse last-seen state and a manual area
- Private Candidate Link capture and Trip Ideas
- Recipient-specific Candidate Share between two authenticated shoppers
- Source-aware unverified extraction with blocked/private-source manual fallback
- Private saved stores
- Personal ratings
- Age-Inclusive Usability Baseline: readable defaults, 48-by-48 targets, labeled actions, 200% text resizing/reflow, keyboard/screen-reader support, non-color-only status, and non-drag alternatives

Security:

- RLS
- Storage policies
- Rate limiting
- Secure session handling
- Audit framework
- Environment separation
- Isolated external-link fetcher with SSRF, redirect, DNS-rebinding, size, timeout, content-type, and rate-limit controls

Exit criteria:

- User A cannot access User B data
- Candidate Share is readable and actionable only by its sender and named recipient; acceptance creates a recipient-owned Trip Idea without exposing recipient edits or other private records
- Pending Candidate Shares expire after 30 days; revoke, dismiss, and expiry deny further access immediately and delete unaccepted payloads from primary database and Storage within 24 hours
- Candidate Share verified-email matching returns indistinguishable results for matched, unmatched, unverified, and blocked addresses; only the matched account receives a payload, and unregistered addresses receive no invitation
- Failed or blocked extraction preserves the original Candidate Link and cannot write public store or Event data
- Public browsing works without an account
- Saved stores remain private
- Seed data has provenance and verification fields
- Seed validation rejects copied descriptions, photos, reviews, and unlicensed provider content
- Official photo pipeline rejects unscoped or unpermissioned submissions and publishes only approved processed derivatives with alternative text
- Freshness rules enforce the 180-day verified window, overdue hours-feature exclusion through day 365, and discovery hiding after day 365 without deleting provenance

## Complete Internal Alpha and external-readiness acceptance

Assemble the Phase 1, Phase 2A, and Phase 3 synthetic slices and test this gate before Phase 2B public reviews, real-store import, or owner outreach.

- Solo Agent-Assisted Alpha: Primary Internal Tester operates all separate roles; supervised AI Test Agents may execute repeatable tests but cannot replace human acceptance or approve a gate
- Two-Person Acceptance: Independent Internal Tester performs shopper acceptance using a newly created Test User B account on her own phone; no solo-stage account is reassigned to her
- External Testing Readiness: separately defined gate required after both internal stages; passing permits one consenting Store Partner representative and one real store in controlled Private Beta, but not public access or advertising

- Phase 1 Store Browser/authentication/private-data foundation using Synthetic Stores and generated fictional profile images only
- Candidate Link capture, recipient-specific Candidate Share, and recipient-owned Trip Ideas using synthetic pages and fictional data only
- Explicit trip selection/creation, progressive Plan setup, Check My Day warnings/order choice, readiness, manual-arrival Go, private visit memory, summary, and offline recovery
- One-trip Creator/Partner/Navigator invitation and server-side authorization
- Test User A, Test User B, Representative Test Account, and Administrator Test Account
- Optional Agent-Assisted Shopper Account for isolated user-two simulation during Solo Agent-Assisted Alpha
- Store Portal home, hours editor, Store Updates, official image/social-link workflows, support, and Store Change Requests
- Administrator home, review workspace, Access & Safety, revocation, and regrant
- Audit records for privileged actions
- Age-Inclusive Usability Baseline across browse, details, plan, and active-trip journeys

- Public reviews, shopper/review photos, and other Public User-Generated Content
- Real stores or external participants
- Household accounts/shared lists, finds/collections, public Event records, push notifications, owner analytics, and advanced personalization; one-trip Partner access and recipient-specific Candidate Share are the only approved narrow cross-account exceptions

Shopper-trip exit criteria:

- Primary Internal Tester as Test User A and Independent Internal Tester as Test User B each complete three successful Shopper Trip Acceptance Runs using separate accounts on separate phones
- Test User B sends a synthetic Candidate Share to Test User A; Test User A alone accepts it into a recipient-owned Trip Idea and adds it to Plan
- Anonymous, wrong-recipient, Representative, and Administrator access is denied; sender cannot read recipient edits, notes, ratings, or resulting trips
- Synthetic clock-advance, revoke, and dismiss tests prove immediate denial and 24-hour unaccepted-payload deletion without deleting an accepted recipient-owned Trip Idea
- Accept, Dismiss, Block, and Report tests prove recipient-only actions; Block denies future sends, Report creates a private moderation case, and the sender sees only `Pending`, `Accepted`, or indistinguishable `Closed`
- Blocked-source/manual fallback and failed extraction preserve the original link without public publication
- Each account proves active-trip recovery after refresh or app restart and while offline in at least one run
- Each account proves that only its Navigator snapshot and pending mutations exist in encrypted IndexedDB, no authenticated trip data enters public Cache Storage, and another account cannot decrypt or resume it
- Completed synced trips purge locally; account switch and confirmed logout purge locally; logout with unsynced changes requires an explicit data-loss warning
- A simulated offline revocation is denied before reconnect sync or refreshed private display and purges the local key/cache
- Go accepts mutations from one active Navigator device only; authenticated online transfer causes later old-device mutations to fail
- Duplicate/retried offline mutations apply exactly once and valid actions replay in recorded local order
- Server authorization, Navigator/device assignment, and trip state reject stale or incompatible queued actions without cross-account disclosure
- Same-author rating/note conflicts preserve both versions and require an explicit `Keep This Phone's Version` or `Keep Saved Version` choice
- Across the runs, exercise Synthetic Store discovery/details/updates/official links, just-in-time auth, explicit Add to Trip, progressive Plan, Check My Day choice/warnings, one-trip partner handoff, Navigator-only Go, manual arrival, private review, skip/Undo, summary/Plan Again, and recalculation
- AI-assisted or Primary Internal Tester runs as Test User B are supplemental and cannot replace the Independent Internal Tester's runs
- Zero Blocking Defects
- Zero cross-account exposure or modification of shopper-private data

Privileged-workflow exit criteria:

- Primary Internal Tester operates two complete Privileged Workflow Acceptance Cycles using separate representative and MFA-protected administrator sessions; Independent Internal Tester is not required to operate privileged accounts
- Every Representative-Managed Field publishes directly for the assigned Synthetic Store
- At least one Store Change Request is approved and one rejected; unapproved Controlled Store Fields remain unpublished
- Representative self-approval is denied
- Administrator grants and revokes the representative's store scope; revocation denies further writes from the representative's existing session
- Every privileged action has an audit record
- Store content/image/social/support review paths enforce their labels and lifecycle; Administrators cannot edit submissions or bulk approve
- Access revocation and regrant affect only the selected store scope; an already-open Representative session is denied on its next write
- Representative and Administrator Test Accounts cannot read or modify either shopper Test Account's private data
- Every Synthetic Internal Alpha break-glass request is denied and audited
- Zero Blocking Defects; every allowed action succeeds and every forbidden action is denied

External Testing Readiness criteria before first-owner contact:

- Dated passing evidence for Solo Agent-Assisted Alpha and Two-Person Acceptance
- Complete authorization and security test set passes
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Backup restore and rollback rehearsals pass
- Database and Storage restores separately meet the current stage's approved RPO/RTO
- Before Private Beta, a synthetic-data rehearsal proves every break-glass request is denied and audited while Scott is the sole Administrator through Packages 8/8B. If a real second qualified Administrator exists, also rehearse the enabled path's scope, read-only default, 30-minute expiry, approval, notice, two-year hash-chained audit, and external anchor. Otherwise defer that enabled-path rehearsal until Package 9 reviewer enrollment and capability tests pass; Private Beta proceeds only with break-glass disabled.
- A full Private-Beta incident rehearsal proves detection/severity, containment, credential/store-scope revocation, user/store/status communication, database and Storage recovery, deletion-receipt replay, and post-incident evidence
- Pilot-environment monitoring, error reporting, and support intake work
- Monitored support address/form and security contact are published; the Private Beta response commitments, named on-call owner and backup, and in-PWA/status-channel incident path are exercised
- Pilot privacy notice and owner consent are ready
- Qualified professional evidence confirms the operating legal entity and required pilot insurance are active for owner contact and participation
- One External Testing Dress Rehearsal passes end to end
- Primary Internal Tester approves every check; AI Test Agents may collect evidence but cannot approve the gate

Any failed check blocks owner outreach, real-store import, and external participation.

First Store Partner onboarding:

- Demonstrate with Synthetic Stores only
- Obtain Store Partner Pilot Consent before creating a real store record or representative account
- Verify representative authority in person and through a published business contact
- Require owner-controlled verified email and MFA; prohibit shared credentials
- Record voluntary, invitation-only, unpaid, non-endorsing, and non-advertised pilot terms
- On withdrawal, revoke representative access and remove the real store from the active pilot
- Audit onboarding, scope grants, withdrawal, and revocation

First Pilot Store Record:

- Atomic Administrator approval of the owner-submitted Pilot Store Draft creates one record after consent and authority verification
- Owner confirms name, address, phone, website, regular and holiday hours, official description, and category tags
- Record source/provenance and verification date
- Restrict visibility to invited Private Beta participants; deny anonymous/public access
- Preserve Representative-Managed Field and Controlled Store Field authorization rules
- Submit rights-confirmed Official Store Profile Photos through Store Change Requests; display only approved processed derivatives with alternative text
- Exclude ratings/reviews, shopper/review photos, events, owner responses, and analytics

Initial Private Beta Cohort:

- Scott uses separate shopper and Administrator accounts
- Scott's wife uses a separate shopper account
- First owner uses a Store Representative account only
- Restrict the cohort to one Pilot Store Record
- Require separate approval and a separate account before owner shopper activity
- Keep AI and Agent-Assisted Test Accounts restricted to Synthetic Store data
- Block additional users and real stores until a separate expansion gate passes

Initial Private Beta Expansion Gate:

- Owner completes Representative-Managed Field edits, submits two Store Change Requests respectively approved and rejected by the Administrator, uses MFA, and participates in scheduled revoke/regrant testing
- Scott and Independent Internal Tester each complete two shopper trip runs containing the Pilot Store Record
- Support and feedback intake works
- Privileged audit records are complete
- Monitoring, backup restore, and rollback checks remain passing
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Owner confirms that the workflow is understandable
- Primary Internal Tester approves dated evidence for every check
- No minimum calendar duration; any failed check blocks expansion

Controlled Private Beta Expansion:

- Add one verified Store Partner and one Pilot Store Record at a time
- Repeat consent, authority verification, onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks for each addition
- Block the next addition until the current one passes
- Cap at three total Store Partners and Pilot Store Records
- Keep access invitation-only with no public product promotion
- Stop after all three pass and conduct a separate public-readiness review

Store Partner Invitation:

- Require Administrator MFA and recent authentication to generate an in-person invitation
- Generate a high-entropy opaque token, store only its hash, and embed no identity, store, email, or role data in the QR
- Expire after 30 minutes or one successful atomic consumption; support revocation and regeneration
- Route the QR to the existing PWA partner-onboarding page without granting access or triggering installation
- Present pilot terms and collect consent statements plus identity credentials before any identity/grant exists
- In one idempotent transaction consume the invitation, store the immutable provisional consent submission, and create one unprivileged Pending Partner Identity; rollback all on failure and resume the same record after interruption
- Require verified owner-controlled email and MFA, then finalize the immutable Pilot Consent Receipt bound to the verified identity
- Require published-business-contact authority verification and separate Administrator approval
- Create the Pilot Store Record and store-scoped Store Representative grant only after approval
- Show PWA installation instructions after approved sign-in
- Audit every invitation and authorization transition

Pilot consent capture:

- Render a phone-friendly plain-language summary and full-policy links
- Require separate authority, voluntary-participation, permitted-data-use, no-payment/endorsement, and withdrawal acknowledgments
- Capture typed name, business title, store name, and owner-controlled email
- Create the immutable provisional submission atomically with invitation consumption and the Pending Partner Identity
- After email verification/MFA, finalize the immutable Pilot Consent Receipt bound to the provisional submission, verified email, finalization timestamp, invitation identifier, and policy version
- Email a receipt/PDF copy without internal verification evidence
- Permit Administrator read access but no update/delete
- Require fresh consent after material term changes
- Complete legal review of final wording before external use

Pilot Store Draft:

- Allow Pending Partner Identity to create/read/edit only its own draft after consent, verified email, and MFA
- Support draft, submitted, changes-requested, resubmitted, and approved states
- Permit Administrator read/comment/return/approve but no owner-field edits
- Require the owner to correct and resubmit returned drafts
- Require Administrator MFA, recent authentication, and exact final preview for approval
- Atomically freeze the submitted snapshot and provenance, create the Pilot Store Record, and grant its store-scoped Store Representative role
- Fail closed: create neither the store nor grant if any approval step fails
- Audit comments, transitions, submitted snapshots, approval identity, and timestamps

Representative activation and first login:

- Send status-only approval email with the normal PWA sign-in link
- Do not email a reusable invitation, magic role link, or authorization token
- Require verified-email and MFA sign-in
- Render only the exact approved Pilot Store Record, scoped permissions, Pilot Consent Receipt, and approval history
- Offer device-appropriate PWA installation instructions
- Guide listing confirmation, hours review, one Representative-Managed Field edit, one Store Change Request, and pilot-support use
- Keep changes-requested/rejected emails status-only; require authenticated portal access for details
- Audit delivery, first approved sign-in, installation handoff, and checklist progress

Store Partner Pilot Support:

- Create categorized pilot-restricted tickets for bug, confusing workflow, store-data correction, feature idea, and security/privacy concern
- Attach an allowlist only: store/account identifiers, app version, timestamp, and basic device/browser details
- Exclude tokens, shopper data, precise location, and internal logs
- Permit one optional screenshot only after warning, crop/redact, final preview, and confirmation; scan, quarantine, re-encode, strip metadata, and delete it 30 days after ticket closure or sooner on removal
- Restrict ticket/reply/status access to submitting Store Representative and Administrators
- Send status-only notification email
- Alert Administrator urgently for security/privacy concern
- Accept sign-in-failure fallback email without disclosing pilot data until identity verification
- Allow owner resolution confirmation and reopen

## Store and administrator capability acceptance

Entry conditions:

- Phase 1 public-directory and identity foundations required by this work are complete.
- Store Partner invitation, consent, Pending Partner Identity, draft, approval, role-grant, support, and audit contracts are bounded using the approved first-pilot rules.
- Only Synthetic Stores and separate test accounts are present.

- Claim-listing intake and first-pilot authority-verification workflow
- Store Partner Invitation, consent, Pending Partner Identity, Pilot Store Draft, atomic approval, and scoped role grant
- Store Portal home and direct/controlled publishing labels
- Owner-managed weekly hours, dated exceptions, 14-day preview, confirmation, and Undo
- Native Store Updates, reversible archive, and image hold/review
- Official Store Profile media and validated social profile links
- Pilot Support lifecycle
- Administrator home, type-aware content/claim review workspace, Access & Safety, revocation, regrant, and narrow D30 `View Audit`

Security and trust:

- Role assignment and every privileged state transition are server-side.
- Store Representative access is one-store scoped and existing-session revocation is tested.
- Client code cannot approve drafts, publish reviewed fields/media, grant roles, or alter audit records.
- Privileged audit events are append-only and retained for two years; D31 full Audit History UI/export remain excluded.
- Public-review routes, tables, policies, and UI remain absent or server-denied during this subphase.

- Representative cannot access shopper activity or write outside the assigned store.
- Direct versus reviewed content, atomic onboarding, image replacement, support, and access revocation/regrant pass the `DESIGN.md` journeys.
- Phase 2A plus Phase 1 and Phase 3 synthetic work can enter the Cross-phase Internal Alpha gate without enabling Public User-Generated Content.

## Public-review capability acceptance

- Cross-phase Internal Alpha gate has passed.
- The approved review identity, eligibility, conflict, deletion, arithmetic aggregate, moderation, evidence, appeal, and abuse rules in the controlling documents are translated without policy invention into the Package 9 execution contract.
- Server-owned `public_reviews_enabled` remains false in every Internal Alpha and Private Beta environment; direct route/read/write denial is part of entry and exit evidence.
- Public release remains disabled until Phase 6 gates pass.

- Public star rating and text review
- Review editing and deletion behavior
- Reporting and moderation queue
- Rating aggregation
- Approved appeal path

Deferred beyond the Regional Public MVP: store responses and shopper/review photos. Official Store Profile Photos are delivered in Phase 1.

- Review abuse controls, rate limits, eligibility enforcement, and moderation audit logs
- Store owner cannot alter or suppress user reviews.
- Client cannot approve, publish, or change rating aggregation directly.

- Public review and moderation authorization, abuse, aggregation, edit/delete, report, and appeal tests pass.
- Public-review UI passes the applicable `DESIGN.md` and `DESIGN_SYSTEM.md` states without exposing shopper-private data.

## Trip capability acceptance

- Add reviewed Trip Ideas as candidate stops
- Explicit existing-trip/new-trip chooser with area and required date
- Progressive starting point, departure, optional return, and per-stop durations
- Explicit while-in-use device-location request with manual start fallback
- Departure time
- Return destination
- Browse-duration estimates
- Priority stops
- Check My Day suggested feasible order with explanations and explicit Use/Keep choice
- Amber/red/gray schedule warnings with corrective actions and one explicit start confirmation
- Readiness card
- One-trip Creator/Partner invitation, draft collaboration, and Navigator assignment
- Navigator-only active trip with manual arrival
- Done Here private rating/return choice/note
- Skip/Undo, recalculation, summary, immutable history, and Plan Again clone
- Waze handoff
- Google Maps handoff
- Minimum Navigator-only offline active trip with visible pending sync
- Trip history

- Correct next-stop handoff
- Offline trip recovery
- Schedule warnings tested across time zones and daylight-saving changes
- No hidden background tracking
- No precise coordinates in analytics, application logs, email, or support records
- Directory and manual trip planning work when device-location permission is denied
- Trip Partner can access only the invited trip, and only Navigator can mutate Go
- Offline arrival/completion/skip/private-note mutations synchronize exactly once in local order; server authority rejects invalid state, and conflicting private text/rating requires explicit author choice

## Deferred finds and household capability acceptance

- Find capture
- Photos
- Price
- Measurements
- Votes
- Shared household trips
- Shared lists
- Private collection
- Export

- Explicit sharing only
- Immediate revocation
- Private image URLs
- EXIF stripping
- Household authorization tests

## Deferred personalization capability acceptance

- Preference onboarding
- Match score
- Explainable reasons
- Recommendation feedback
- Similar-store suggestions
- Route-aware recommendations

Rules:

- Recommendations are estimates
- Public rating remains separate
- Users can disable personalization
- Users can correct interests
- No sensitive inference beyond product purpose

## Regional launch and expansion acceptance

Phase 6 is a capability grouping implemented only through Packages 10A–10B after every earlier package/gate, not another feature bundle. Phases 4–5 remain deferred.

- External security review
- Legal review
- Support workflow
- Monitoring
- Backup restore
- Store-owner onboarding kit
- Marketing site
- Printed flyer
- QR code
- Store claim instructions
- Regional data verification
- Launch runbook
- Incident response rehearsal
- WCAG 2.2 AA conformance review
- Representative older-adult browse-to-plan and active-trip usability test using the approved cohort and pass thresholds
- All three Controlled Private Beta Store Partners and stores passed their sequential addition gates
- At least 12 active verified Topeka listings and 70% of the independently enumerated eligible baseline, unless the Product Owner signs the defined market-size exception
- Three unique three-store current-hours itineraries per named day for one non-holiday Tuesday, Friday, and Saturday—nine total—within 30 days of evidence: first-store opening start, 45-minute dwell, 10-minute transition buffer, accepted-provider travel matrix, and every visit completed by verified closing
- Eight independent invited Topeka shoppers attempted the core journey; at least seven completed without a Blocking Defect and at least five confirmed return intent or completed a second trip
- Browser/device matrix shows zero Blocking Defects, no repeatable journey failure, and at least 99% success after each critical Browse-to-Plan and Go/handoff synthetic journey runs ten times in every applicable matrix cell
- Named support/security contacts, on-call/backup, status path, and passed Private-Beta plus public incident rehearsals
- Product Owner signs the Regional Public Readiness receipt before real-store anonymous access, public deployment, or advertising

Regional growth order after launch readiness:

1. Launch Topeka city limits
2. Select a community outside a larger metro and roughly within a 60-minute drive of Topeka, with at least two antique/vintage shops and one willing anchor Store Partner
3. Privately prepare and sign the one-area readiness receipt, activate only that community, then pass its Community Expansion Gate: two verified active listings; completed anchor-partner onboarding, direct-edit, controlled-change, and support workflows; separate-account/phone multi-stop trips by Scott and the Independent Internal Tester; voluntary trip-use confirmation from five additional shoppers without precise-location tracking; passing monitoring, support, and data-accuracy checks; zero Blocking/privacy/security/data-loss defects; and dated Primary Internal Tester approval
4. Start another separately approved Package 12 run only after the prior gate passes; stop after ordinal 3
5. Conduct a separate larger-metro readiness review before considering Kansas City or another larger metro

No minimum calendar duration applies to the Community Expansion Gate. Exact community choices remain unresolved.

## Stage dependencies

```text
Package 1 local catalog
  -> Package 2 identity/audit/lifecycle
     -> Package 3 private actions/corrections
        -> Package 4 Candidate Share (separate branch)
        -> Package 5A manual trip/collaboration/Go/offline -> SLM-01 checkpoint
           -> R-01 -> Package 5B provider-backed Check My Day
     -> Package 6 Synthetic partner onboarding/Store Portal/existing-claim/add-store + atomic Free provisioning
        -> E-01 gates real email; M-01 gates real media; both plus H/S/HC gate external use
        -> Package 7 Administrator review/Access & Safety
           -> H-01 + L-01 for shared privileged cycles + S-01 + HC-01 -> Package 8 full Synthetic Internal Alpha + External Testing Readiness
              -> Package 8B three-store Controlled Private Beta
              -> Package 9 public reviews + human dress rehearsal, still disabled in beta
              -> Package 10A Step 0 CAT-01 -> HC-02 + accepted gates -> remaining controlled Regional Readiness
                 -> Package 10B, after Product Owner signature, Topeka release
                    -> signed receipt + passing smoke/monitoring + no active stop -> Package 11 RG-01
                       -> separate Product Owner first-community selection -> Package 12 run 1 activation -> passing current-community gate + next selection -> Package 12 runs 2–3, one area each
                          -> inactive commercial-research authorization -> paid-value packet -> final Product Owner monetization decision -> Package 13 composite paid-activation receipt
```

No arrow authorizes real data, external contact, paid service, promotion, public access, or geography expansion. The applicable evidence gate and Product Owner signature do.

## Provider and external-action prerequisites

An independent team may build only the provider-neutral contract until the named ADR is accepted. The ADR must select the provider/version/plan and record data sent, processor role and retention, region, authentication, quotas/cost caps, timeouts/retry/idempotency, outage fallback, observability without private payloads, replacement path, legal review, and executable contract tests.

- Routing ADR blocks only Package 5B; Package 5A remains manual-order/hours-only.
- Transactional-email ADR blocks real invitation/status delivery and Package 6 external use, not Synthetic UI tests.
- ADRs 0005/0006 and H-01 block any shared environment until Vercel plan eligibility, disabled automatic Git deployment, protection of every reachable hostname, and Alpha restore/quotas pass. Startup has `$0` recurring infrastructure/no overage unless separately funded. Regional Public remains blocked until 15-minute RPO is funded or independently proven at `$0`; no paid ceiling is approved.
- L-01 blocks privileged shared/external mutation until a separately administered append-only chain-root sink passes at `$0` for startup; no sink means local-only privileged testing.
- SEC-01 independent security review and B-01 final brand/domain block Package 10B.
- M-01 blocks real Official Store media/support screenshots; placeholders/text remain. Claim-document upload is not Regional Public MVP scope.
- S-01/HC-01 block first owner contact; HC-02 blocks public promotion. An AI cannot be on-call backup or independent reviewer.
- Analytics remains off; it is never a launch dependency.
- Shopper-image moderation remains post-MVP and off.
- A named independent break-glass reviewer is required only to enable break-glass. Without that artifact the safer disabled state remains mandatory and does not grant an exception.

## Deferred implementation boundary

D31 full Audit History UI/export, households, finds/collections, personalization, shopper/review photos, owner review responses, structured Events, Vendor Contributor, paid placement/ad products, Android packaging, marketplace, AI valuation/authentication, embedded social feeds, and national expansion are not Regional Public MVP work. Consent-based Antique Trail product promotion is release work, not monetization. Empty scaffolding for deferred items is prohibited.

## Product purpose and later value proof

Antique Trail makes nearby antique stores easy to see, understand, save, and turn into a fun, hours-aware day. Its Store Browser is the front door; Candidate Link capture handles places found outside the app. It keeps discovery, planning, navigation handoff, stop status, and a private 1–5 return rating in one place.

The later success test (`SLM-01`) is whether two separate shopper accounts using only Synthetic Stores can replace the fragmented research-to-message-to-route-to-maps-to-notes workflow with a trustworthy Browse → Store Details → Save → manual hours-aware Trip → Partner/Navigator handoff → external-map Go → private memory flow. Capture → Review Idea remains a separate later branch. Both must finish without outside planning documents, lose no input, understand hours/travel-time limits, pass account isolation/offline replay, and show a documented burden improvement against the current baseline before Product Owner `continue`; otherwise disposition is `revise` or `stop`. It is not a public release.

The first public success test is whether Topeka shoppers can discover current listings and build useful days without paid placement, behavioral tracking, or owner access to shopper data. Promotion begins only after Package 10B through separately purposed shopper flyers/QRs, prospective-owner cards to `/for-stores`, permissioned local channels, organic search, and canonical Store sharing. Owner acquisition succeeds only when eligible owners understand the offer and trust boundaries, can start/return to claim or add a store, and no payment or application bypasses authority/listing approval.

## Audience context

The primary early user is an antique shopper, commonly around age 50–80+, researching and planning a multi-store day on a phone. They need to browse readable store cards, understand trustworthy details and images, capture outside leads without retyping them, assemble an understandable trip, navigate one stop at a time, and retain private visit memory without switching among messages, email, documents, maps, and notes.

A second authenticated shopper may send or receive one Candidate Link through a recipient-specific Candidate Share and may receive one explicitly shared trip. Accepting a candidate creates a recipient-owned Trip Idea without exposing either shopper's other ideas, trips, notes, ratings, or profile. Eligible store owners/managers are a separately targeted post-Package-10B audience: `/for-stores` explains how shoppers use listings, supports claim/add-store application without privilege, and routes approved Representatives to Free or separately activated paid photo capacity. Moderators and administrators remain controlled workflows, not the focus of the first shopper slice.
