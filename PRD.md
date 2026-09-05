# Product Requirements Document

Status: current normative product-requirements baseline. The 2026-08-03 hardening pass established this contract; later implementation and critique work does not change product behavior unless promoted here. Current implementation, backlog, and release state live in `PROJECT_STATE.md`. D31 full Audit History UI/export and explicitly deferred Product Owner decisions remain unresolved. `DESIGN.md` is the canonical interaction contract; `DESIGN_SYSTEM.md` makes it visually reproducible.

## Working title

**Antique Trail**

The final brand name has not been selected.

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

The primary design audience includes shoppers roughly 50–80+ while the product remains usable by all ages.

- Target WCAG 2.2 AA across the PWA.
- Default body text is at least 18 CSS px with 1.5 line height; essential text is never below 16 CSS px.
- Support 200% text resize, responsive reflow, and user text-spacing overrides without loss of content or function.
- Mobile touch targets are at least 48 by 48 CSS pixels.
- Primary icons have text labels; status never depends on color alone.
- Support keyboard use, visible focus, screen readers, reduced motion, and non-drag alternatives.
- Use plain, concrete labels and keep one primary action visually clear at a time.
- Do not auto-advance or impose time pressure on core tasks; preserve entered data after validation errors.
- Allow store images to enlarge, provide meaningful alternative text or captions, and never place the only essential information inside an image.
- Keep browsing list-first. A map may assist discovery but is never the only path.
- Before public launch, pass the approved eight-person older-adult cohort, composition, task, error, and completion thresholds in `PRODUCT_DECISIONS.md`.

## Private content lifetime

- Keep private saves, trips, trip history, personal ratings, notes, and accepted Trip Ideas until their owner deletes the supported record or deletes the account.
- Do not expire this content only because it is old.
- Individual deletion removes the record from view immediately, offers a short Undo, and deletes its primary database row and associated Storage objects within 24 hours.
- Account deletion revokes access immediately, offers a clearly disclosed seven-day cancellation period, and completes primary database and Storage deletion by day 8 if not cancelled.
- Recoverable backups containing deleted data age out within 30 days. A disaster restore reapplies completed deletion requests before normal access resumes.
- At the first UTC daily job on/after three years without successful sign-in, schedule deletion 90 days later and warn at 90/30/7 days; then apply the seven-day cancellation window. Successful sign-in atomically cancels; jobs are milestone-idempotent, notification failure does not extend retention, and leap-day anniversary uses February's last day.
- Determine inactivity only from authentication state, never browsing, trip, location, or behavior tracking. Reset Synthetic Internal Alpha accounts manually instead of applying this timer.
- Pending Candidate Shares expire after 30 days. Revoked, dismissed, blocked, reported, or expired payloads follow the exact closure/evidence rules in the Candidate Share section; accepted outbound URL/note deletes after 30 days and content-free accepted status after 90 days.
- Raw Trip/Store Partner tokens are never stored. Terminal token hashes/payloads delete within 24 hours; Trip invitation status remains 90 days, accepted participation follows trip lifetime, and Store Partner invitation history remains three years after relationship end.
- Exact completed-trip start/return coordinates delete within 24 hours after sync, are excluded from export, and age out of backups within 30 days.

## Operational retention

- Application/error logs: 30 days.
- Authentication/security events: 90 days.
- Raw IP/device/destination abuse telemetry: 30 days; irreversible security-only aggregates: 90 days; never reuse for analytics or personalization.
- Privileged Store Representative and Administrator audit events: two years.
- Support and moderation cases: two years after closure.
- Pilot consent, authority-verification, and role-grant records: three years after the relationship ends.
- Rejected or quarantined uploads: 30 days.
- Approved store media: unpublish immediately on rights withdrawal/pilot end; delete source/derivatives within 24 hours and backups within 30 days; content-free provenance/audit follows the three-year relationship rule.
- Support screenshots: delete 30 days after case closure or earlier removal and backups within 30 days; the text case may retain two years.
- Content-free deletion receipts: 31 days.
- Never copy shopper-private content into logs or audit events. Securely delete or irreversibly de-identify each record at its deadline.
- Legal review may require longer retention before external testing. A shorter period requires product-owner approval.

## Recovery objectives

| Stage | Maximum data loss (RPO) | Maximum outage (RTO) |
|---|---:|---:|
| Internal Alpha | 24 hours | One business day |
| Private Beta | 4 hours | 8 hours |
| Regional Public MVP | 15 minutes | 4 hours |

Database and Storage recovery must pass separate restore tests before each stage gate. Provider documentation or a successful database-only restore does not prove complete recovery.

## Break-glass emergency access

- Disable break-glass access during Synthetic Internal Alpha.
- During Private Beta and Regional Public MVP, allow it only for a confirmed security or data-recovery incident, never routine support.
- Require Administrator MFA, recent authentication, an incident ID, a plain-language reason, and the exact requested data scope.
- Make access read-only by default and expire it after 30 minutes.
- Require a second Administrator's approval when available. While Scott is the sole Administrator, require an independent review within 24 hours of activation.
- Notify the affected user when safe and legally allowed.
- Audit every attempt for two years in append-only hash-chained records with externally anchored chain roots.
- Prohibit bulk export, role changes, deletion bypass, and access to unrelated data.

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

The applicant path after Package 10B is find existing/add new store → ordinary verified-email account/sign-in → MFA → authority/eligibility and listing draft → Administrator approval atomically creates exact scope and Free (plus the public provenance-bound listing for a new store). A likely duplicate converts through confirmed existing-listing claim review and cannot create another store. Both claim and add-store start deny when the applicant already has an active Representative grant; a legitimate ownership/store change uses the Administrator-reviewed transfer flow, never a second intake. After paid activation, the approved Free Representative may optionally upgrade through fresh explicit paid consent and Stripe Checkout; failed/cancelled checkout leaves Free and the listing intact. A Checkout completed after a sales pause also cannot upgrade the store and must be cancelled/refunded through the provider-confirmed reconciliation path. One active Representative per store and one active store per Representative remain the Regional Public MVP limit; multi-location groups receive a plain unsupported/review path rather than a partially working bulk flow.

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
