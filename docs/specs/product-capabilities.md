# Product capability reference

Status: delegated product capability requirements under [PRD.md](../../PRD.md), adopted by the 2026-09-11 store-first amendment. This file owns detailed capability behavior; PRD owns purpose, offered scope, stage applicability and progression. Design, security and engineering remain with their specialist owners in [README](../../README.md#source-precedence).

## Stage applicability

Browse, details/photos, optional saves, exact-store representative publishing and Administrator approval support the store showcase and selected pilot. Trips, Candidate Share, public reviews, visit memory, personalization, collections, households and Android packaging are deferred; their retained behavior is not permission or a prerequisite to build, expose or test them now. Security and data-lifecycle obligations still apply to retained data and every reachable path.

The legacy Pilot/Regional subsection names below describe compatibility behavior and the earlier full-program profile, not a compulsory pilot size, geographic sequence or first-sale gate. For the new pilot, use only the capability, consent and operating requirements selected by [PRD stage dependencies](../../PRD.md#stage-dependencies) and [security stage applicability](../../SECURITY_AND_TRUST.md#store-first-stage-applicability). Old stage receipts cannot activate the new pilot. The former full plan is preserved at [main f182871d](https://github.com/samarquis/AntiqueTrail/blob/f182871d9de0d5db2a30ad0de9ac8dc72467648b/PRD.md).

## Working title

**Antique Trail**

Keep Antique Trail as the temporary working name through the private evaluation. The final brand name has not been selected.

When a final name is approved, inventory and account for every reference: rendered screens, PWA/install metadata, titles/sharing/accessibility text, images/logos, emails, print/QR materials, documents, fixtures/tests, code/configuration, domains/URLs, and external settings. Give every reference a migration action and verification result, checking rendered output as well as text. Present an explicit disposition for immutable history, third-party references, and changes that could break data, links, authentication, or integrations; do not silently omit them or promise completeness without that inventory. No rename or domain purchase is authorized by this milestone.

## Product type

- Public consumer Progressive Web App
- Mobile-first
- Desktop and tablet compatible
- Future Android packaging through Capacitor

## Age-inclusive usability requirements

Design first for shoppers roughly 50-80+ while remaining usable by all ages, without a separate age mode. Meet the exact [age-inclusive usability baseline](../../DESIGN_SYSTEM.md#age-inclusive-usability-baseline) and the later [human usability acceptance](../../PRD.md#human-usability-acceptance); the owner's first evaluation does not replace that release evidence.

## Private content lifetime

Private saves, trips, personal ratings, notes, and accepted Trip Ideas remain the owner's private memory until the approved deletion/account-lifecycle rules apply; age alone does not expire them. Exact controls: [Private content lifetime](../../SECURITY_AND_TRUST.md#privacy-by-default).

## Operational retention

Operational records have defined deletion deadlines and must not become a second store of shopper-private content. Exact controls: [Operational retention](../../SECURITY_AND_TRUST.md#operational-retention).

## Recovery objectives

Every stage must prove its required recovery of both database and Storage; a provider promise or database-only restore does not establish recovery. Exact controls: [Recovery objectives](../../SECURITY_AND_TRUST.md#backups).

## Break-glass emergency access

Emergency private-data access remains disabled where the stage or independent-review requirements prohibit it and is never routine support. Exact controls: [Break-glass emergency access](../../SECURITY_AND_TRUST.md#break-glass-emergency-access).

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
- Allow the current tier's approved Store Profile capacity: Free one cover + five gallery, Gallery one cover + fifteen gallery, Full Gallery one cover + no plan-count cap under its published non-count limits. Allow one image per Store Update. The fixture-only 50-photo evaluation profile is a separate internal evaluation surface, not a tier; it never changes these capacities and is never served as public entitlement.
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

### Corrections

Anyone may draft a correction, but submission requires just-in-time verified account authentication; cancellation writes nothing. The submitter can read only the reason-neutral status of their own report, with no anonymous submission or internal case-detail access. The exact commands, authorization tests, retry handling, and case lifecycle live in Package 3 of PACKAGE_CONTRACTS.md.

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

The exact deterministic scoring, limits, start/return treatment, tie-breaks, waiting, and exhaustive permutation contract live in [Package 5B](../../PACKAGE_CONTRACTS.md#package-5b-â-secondary-browse-map-and-check-my-day). The interface offers explicit use/keep choices and never automatically applies an order or claims real-world optimality.

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

**Prior program profile:** retained for historical/implementation compatibility. Its fixed cohort, trip or geographic progression is not a prerequisite to the current showcase or controlled store pilot; PRD stage dependencies and Security stage applicability control the new pilot. Actual consent, account/store authority and existing data obligations remain.

- Demonstrate with Synthetic Stores only
- Obtain Store Partner Pilot Consent before creating a real store record or representative account
- Verify representative authority in person and through a published business contact
- Require an owner-controlled verified email and MFA; prohibit shared credentials
- State that participation is voluntary, invitation-only, unpaid, non-endorsing, and not public product promotion
- On withdrawal, revoke representative access and remove the real store from the active pilot
- Audit onboarding, scope grants, withdrawal, and revocation

### First Pilot Store Record

**Prior program profile:** retained for historical/implementation compatibility. Its fixed cohort, trip or geographic progression is not a prerequisite to the current showcase or controlled store pilot; PRD stage dependencies and Security stage applicability control the new pilot. Actual consent, account/store authority and existing data obligations remain.

Use Topeka city limits as the future Private Beta Pilot Area. Store outreach, partner claims, and real-location import remain blocked until the existing pre-pilot readiness gate passes.

- Atomic Administrator approval of the owner-submitted Pilot Store Draft creates the record only after Store Partner Pilot Consent and authority verification
- Owner confirms name, address, phone, website, regular and holiday hours, official description, and category tags
- Record source/provenance and verification date
- Restrict visibility to invited Private Beta participants; deny anonymous/public access
- Representative tests Representative-Managed Fields and submits rights-confirmed Official Store Profile Photos through Store Change Requests
- Quarantine, validate, re-encode, strip metadata, and require alternative text before Administrator approval and display
- Exclude ratings/reviews, shopper/review photos, events, owner responses, and analytics

### Initial Private Beta Cohort

**Prior program profile:** retained for historical/implementation compatibility. Its fixed cohort, trip or geographic progression is not a prerequisite to the current showcase or controlled store pilot; PRD stage dependencies and Security stage applicability control the new pilot. Actual consent, account/store authority and existing data obligations remain.

- Scott: separate shopper and Administrator accounts
- Scott's wife: separate shopper account
- First owner: Store Representative account only
- One Pilot Store Record
- Owner shopper activity requires a separately approved shopper account
- AI and Agent-Assisted Test Accounts remain restricted to Synthetic Store data
- No additional user or real store before a separate expansion gate passes

### Initial Private Beta Expansion Gate

**Prior program profile:** retained for historical/implementation compatibility. Its fixed cohort, trip or geographic progression is not a prerequisite to the current showcase or controlled store pilot; PRD stage dependencies and Security stage applicability control the new pilot. Actual consent, account/store authority and existing data obligations remain.

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

**Prior program profile:** retained for historical/implementation compatibility. Its fixed cohort, trip or geographic progression is not a prerequisite to the current showcase or controlled store pilot; PRD stage dependencies and Security stage applicability control the new pilot. Actual consent, account/store authority and existing data obligations remain.

- Add one verified Store Partner and one Pilot Store Record at a time
- Repeat consent, authority verification, onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks for each addition
- Require 100% of active discoverable Private Beta listings to remain inside their approved verification interval before each addition
- Do not add the next store until the current addition passes
- Cap at three total Store Partners and Pilot Store Records
- Remain invitation-only with no public product promotion
- After all three pass, stop and conduct a separate public-readiness review
- Do not treat pilot passage as authorization for public access

### Regional Public Readiness Gate

**Prior program profile:** retained for historical/implementation compatibility. Its fixed cohort, trip or geographic progression is not a prerequisite to the current showcase or controlled store pilot; PRD stage dependencies and Security stage applicability control the new pilot. Actual consent, account/store authority and existing data obligations remain.

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

## Account scope requirements

- **Account scope:** Regional Public MVP is United States only. Anonymous browsing has no age gate; account creation, public reviewing, Store Partner participation, and trip sharing require age 18 or older until legal review approves broader participation. Approved 2026-07-31.
