# Vintage Day Out Design and Interaction Requirements

Approved target scope: [2026-10-06 PRD](PRD.md). Current catalog-only exposure remains separately gated; target interactions below describe the intended next product, not deployed availability.

## Product promise

> Vintage Day Out makes a fun day of antique shopping easy to see, easy to plan, and easy to trust.

Design first for shoppers roughly 50-80 while remaining usable by all ages. Mobile-first, desktop compatible.

## Brand messaging

The selected name and migration boundary are owned by [PRD Brand and positioning](PRD.md#brand-and-positioning). Use **Vintage Day Out** as the selected product name and **Your kind of shops. Your kind of day.** as its marketing hook.

The current-stage supporting line is **Discover antique and vintage shops for your next day out.** It describes store discovery without claiming in-app trip planning. The trip-stage supporting line **Discover antique and vintage stores. Turn your favorites into a day trip.** and campaign line **Choose a few shops. We'll help you make a day of it.** remain reserved for a separately approved trip stage. Do not use either trip-stage line on the current showcase or pilot, or present it as available functionality.

Messaging records intent only. It claims no market exclusivity, automated personalization, live location filtering, route optimization, public reviews, or other unavailable capability, and specifies no new hero, navigation, action flow, visual identity, screen layout, or public campaign.

## Global interaction rules

- One obvious primary action per screen; preserve entered data after errors.
- Explain disabled actions and name the missing requirement.
- Pair status color with an icon and plain text. Never communicate status with color alone.
- Provide keyboard, screen-reader, and non-drag paths for every core action.
- Use explicit confirmation for irreversible actions. Prefer Undo for reversible ones.
- Core trust information (freshness, hours, warnings, privacy consequences) is at least 16px.
- Every form works at 320px width and 200% zoom.
- Never expose shopper-private ratings, notes, or trips to a Store Owner, Store Representative, or Administrator.
- Current bounded public-test navigation is `Browse | Saved stores | More` for anonymous and
  authenticated shoppers. Selected later trip stages replace `Saved stores` with `My Trip`; they
  never add a fourth destination. Go mode is never a permanent tab.

## Roles

Anonymous visitors browse public content. Shoppers authenticate for private writes. Store Owners require verified email, MFA and exact-store approval. Site Admin has a separate privileged permission and no routine shopper-private access. Existing Representative/team identities and grants are preserved pending explicit mapping; no new team-management UI is required. Use separate independent accounts for isolation tests.

## Shopper entry, browsing, authentication

### First arrival

1. Open directly to Browse Stores in the approved area; show results immediately.
2. No area setup, sign-in, or device-location permission required.
3. Provide a prominent manual area selector and optional `Use my location`. Request location only on that explicit action; denied/unavailable location leaves manual browsing usable.
4. `Save`, `Add to Trip`, personal rating, and private note use just-in-time authentication.
5. Successful authentication completes the original action and returns to context. Cancel or failure writes nothing.

### Browse Stores

- Readable list is the default; map is secondary.
- Search by store name, town, and category.
- For the explicitly admitted [Market at Macvicar test listing](docs/adr/0011-market-at-macvicar-public-listing.md), show its single card first only when it matches server-side search, area/category, and admission filters. Preserve all other results' relative order; do not prepend an ineligible store or treat placement as paid ranking.
- Each card: cover image or neutral placeholder, store name, town or distance, category summary, today's hours/open state, freshness, `Save`, `Add to Trip`.
- Do not require map-only browsing or location permission.

### Authentication flow

1. Private action records a safe return target and opens sign-in without writing.
2. Successful sign-in returns to the original context and completes the action.
3. Cancel/failure returns without the write and preserves entered data.
4. Administrator and Representative routes require MFA.
5. Access token stays in memory; refresh session uses IndexedDB only. Logout clears it.

## Store Details

Store Details shows:

- Cover photo and gallery images (capacity varies by store tier)
- Description, address/map, hours and exceptions, contact, provenance, freshness
- `Favorite`, `Share`, `Add to Trip`, `Navigate` (existing `Save` refers to the same favorites collection)
- Latest three Store Updates and `See All`
- Official social links (open externally; never scrape, embed, or track)
- Public review display after public review is enabled
- Shopper-private personal rating and notes only for the signed-in owner

### Claim this listing

Store Details shows `Is this your store? Claim this listing` for unclaimed listings. Submission requires verified email and MFA. A claim publishes nothing and grants no Portal access until Administrator approval.

### Report a correction

Anyone may open the correction form and draft it. During the catalog-only public test, the draft remains in this tab's `sessionStorage` across same-tab reload/navigation. The form offers no sign-in-to-submit or submit action; cancel/back returns to the same store without a server request and leaves the local draft available while its tab-scoped entry remains. With server-only `PUBLIC_TEST_MODE=true`, the Edge handler rejects direct submissions before session verification or gateway/database access, even for an existing authenticated session. Outside that draft-only stage, submission requires just-in-time verified-account authentication. Cancellation/failure creates no server report. The submitter sees only the status of their own report.

## Favorites and sharing

Store details, favorites and an opened shared public store offer Add to Trip. Share uses the public store URL through platform sharing or Copy link; opening it needs no account. No private note/rating, trip ID, account identifier or tracking token is added. An unavailable share API falls back to Copy link. Saving or adding prompts sign-in and retains the selected store. Favorites and existing Saved stores are one collection. In-app recipient delivery and private trip sharing are deferred.

## Add to Trip and new-trip setup

`Add to Trip` always opens an explicit chooser:

1. Show editable existing trips and `Start a New Trip`.
2. Retain the selected store through authentication and setup.
3. After addition, name the destination trip and offer `View Trip` and `Undo`.

`Start a New Trip`:

- Generates an editable area-based name.
- Requires and visually shows the shopping date.
- Retains the first selected store.
- Defers start location, time, return destination, and stop durations to Plan.
- `Add an unlisted stop` accepts name, address, optional source link/hours and duration; label it private and unverified. No public listing is created. Confirm a resolvable destination before claiming reliable navigation.

## Plan mode

### Progressive setup

- Show the dated trip and planned stops immediately.
- Allow store addition and accessible reordering before route setup.
- Starting location is private per trip. Accept manual entry or an explicit `Use My Current Location` action. Account settings may retain an optional private starting address; use it for a trip only after the shopper explicitly chooses it.
- Request device location only after that action. Never infer or automatically apply a Home location. No background tracking or location logs.

### Stop duration

- Every stop has a visible editable expected browsing duration.
- Default 60 minutes; presets 30/45/60/90 plus Custom.
- Label schedule results as estimates, not guarantees.

### Review Hours and Check My Day

`Review Hours` checks the current manual order against known store-day hours and freshness. It states `Travel time is not included`. Accessible `Move Up`/`Move Down` is the reorder method. Starting with unresolved warnings requires one explicit acknowledgement.

The target milestone requires travel-aware `Check My Day`. `Review Hours` is an honest fallback when travel data is unavailable, not complete suggested-order acceptance. `Check My Day` shows: estimated arrival/departure/finish, explained warnings, and a suggested order. Require separate `Use Suggested Order` and `Keep My Order`; never auto-apply or claim an optimized route.

Warnings shown beside each affected stop:

- Amber: schedule risk, stale information, closing soon.
- Red: closed today or likely arrival after closing.
- Gray: missing or unverified information.
- Corrective actions: `Move Earlier`, `Shorten Visit`, `Remove`, `Keep Anyway`.
- `Start Trip` allows continuation after one explicit confirmation.

### Trip readiness

Use a final card inside Plan. Show date, departure time, stop count, first stop, unresolved warning count, and estimated finish when calculable. `Start Trip` opens Go mode at Stop 1.

## Go mode

### Starting and navigation

- Start at Stop 1 with large `Navigate`, `Skip Stop`, `Change Order` controls.
- `Navigate` opens the selected external map app for the current leg. Navigation never launches automatically.

### Arrival and active visit

- A large `I Have Arrived` action records confirmation time only. No geofencing or tracking.
- The active-visit screen stays quiet: stop position, store, arrival time, planned-until time.
- A large `Done Here` records completion time, updates remaining estimates, and opens the private visit review.

### Private visit review

- Optional and private to the account.
- Large 1-5 overall-feel choice, a `No`/`Maybe`/`Yes` return choice, and one private note.
- Never publish or expose these values to a store or trip partner.

### Skip, finish, history

- `Skip Stop` advances immediately, offers named Undo, and keeps the skipped stop in history.
- `Store Appears Closed` records private `observed_closed`, advances like Skip, and states the public listing was not changed.
- Finishing or skipping the last stop opens Trip Summary automatically.
- `End Trip Early` requires one confirmation when stops remain.
- Completed route history is read-only. Private ratings and notes remain editable.
- `Plan This Trip Again` creates a new draft; it never alters history.

### Offline behavior

First scope is online-first. Show loss of connectivity clearly and preserve safe unsent form text without claiming it is saved to the server. Retry after service returns; do not expose replay/purge/device-authority controls as shopping actions. New offline mutation/sync is deferred. Existing encrypted offline data, signed grants and revocation controls must be assessed before changing their runtime dependencies.

## Shared trip (partner)

Deferred from the first outing. Each trip has one organizer. Public store sharing does not grant access to trips, favorites, notes or ratings. Existing partner/device rights and retained data remain protected until any separate retirement/migration. No invitation inbox, shared edit session or Navigator-transfer UI is required.

## Store Owner workspace

Lead with approved store details, hours, photos, updates, pending changes and help. Use the existing portal where suitable. One responsible owner per store; no mandatory team management, analytics, promotion or public review replies. [Store Owner authority](docs/specs/store-owner-authority.md) owns claim, exact-store access and legacy-grant protection. Billing remains subject to separate paid activation.

## Store Representative portal

### Home

- Lead with scoped store name, public-listing state, hours verification date, `Update Hours`, `Preview Public Listing`.
- Secondary areas: Store Information, Photos, Store Updates, Pending Changes, Access & Help.
- Exclude traffic analytics, advertising, shopper ratings, shopper-private data, and marketing tools.

### Publishing labels and hours

- Label every edit `Publishes Immediately` or `Requires Administrator Review` before submission.
- Direct fields: hours, phone, website, description, temporary closure, social profile links.
- Controlled fields: name, address, ownership, permanent closure, categories, profile photos.
- Controlled changes use Pending / Changes Requested / Approved / Rejected states while current approved values stay live.
- Hours editor: Open/Closed per weekday, one range plus optional second range, `Copy to Other Days`, dated exceptions, 14-day preview, Undo.

### Store Updates

- Types: New Finds, Sale, Announcement, Store News.
- Text-only updates publish immediately.
- An image-bearing update stays unpublished until Administrator image approval.
- Sale requires an end date and auto-archives.
- One image per update; no social feed scraping or embedding.

### Images

- Capacity comes only from [membership](docs/specs/store-membership-spec.md). Show current usage/limit and safe replacement; no monthly photo deletion. Never display tentative paid prices as an active offer.
- Require local preview/crop, plain alternative text, and explicit rights confirmation.
- Prohibit copied website images, social screenshots, and shopper photos.
- Keep uploads private during validation, re-encoding, metadata stripping, and review.
- Every profile-image change requires Administrator approval; current approved images stay live until replacements are approved.

### Social links

- One validated official business-profile link per platform: Facebook, Instagram, YouTube, Pinterest, TikTok.
- Validate domains, reject shortened URLs, show final destination, publish directly, offer Undo.

### Support

- `Access & Help` contains `Get Help` and `My Requests`.
- States: Submitted, In Review, Waiting on You, Resolved, Reopened.
- Show authenticated replies and full resolution history.

## Store membership and billing

Free listings support the first outing/owner evaluation. Optional paid photo capacity follows [membership](docs/specs/store-membership-spec.md); exact prices and paid capacities are provisional. Retain photos within capacity until owner replacement/removal or an explicitly disclosed lifecycle. No ads, paid ranking or automatic monthly deletion. Use Stripe-hosted Checkout/customer portal when separately activated; never collect cards. Custom paid-to-paid scheduling is deferred.

## Administrator experience

### Home

- Persistently label role and environment (e.g. `Internal Alpha · Synthetic Stores Only`).
- Show urgent security/privacy work first.
- One `Needs Review` worklist grouped into Partner Onboarding, Store Changes, Images, Support.
- Include `Access & Safety` for representative grants/revocations and audit activity.
- Exclude shopper-private records, traffic, ratings, and trip details.

### Review workspace

- Open one readable type-aware workspace from a queue item.
- Request type, store, submitter, status, submitted time, current live state.
- Actions depend on type. `Request Changes` and `Reject` require a plain reason. Approval shows the exact effect before confirmation.
- No bulk approval, direct submitted-field editing, or automatic advance.
- Audit every transition: actor, time, before/after, reason, result.

### Review moderation (post-MVP)

Moderation of public reviews is applied only after public reviews are enabled. Cases show public review/store context, reported rule, minimum evidence, and current aggregate effect. Transitions: `Hold`, `Remove`, `Restore`, `Dismiss Report`. An appeal goes to a different Administrator or an independent qualified reviewer.

### Access & Safety

- Separate pending invitations from active Store Representative grants.
- Active grant shows identity, verified-email and MFA state, exact store scope, grant dates, recent privileged activity.
- `Revoke Access` requires MFA, recent authentication, a plain reason, and an exact consequence preview.
- Regrant requires verified email, MFA, authority verification, and exact scope preview. Never restores broader access.
- Audit every attempt.

## Account and privacy controls

`Account & Privacy` lists account email/verification state, `Export My Data`, privacy controls, and `Delete My Account`. Destructive actions never share a row or style with routine navigation.

### Export My Data

1. Explain ZIP contents and exclusions before request.
2. Require recent password authentication before issuing a download URL.
3. Downloads expire after 15 minutes; archives after seven days.
4. Failure shows a plain reason-neutral error.

### Delete My Account

1. Preview affected categories and the seven-day cancellation window.
2. Require recent password authentication plus MFA when already enrolled, and one acknowledgment.
3. Success signs out and shows the deletion date plus `Cancel Account Deletion`.
4. Cancellation restores access; privileged grants require normal regrant.
5. Day-8 primary deletion runs; support cannot promise restoration after that.

## Implementation acceptance journeys

For the selected connected-outing evaluation, prove the admitted paths below; they are not new prerequisites for maintaining the existing catalog-only test:

1. Anonymous Browse and Details work without location or sign-in.
2. Just-in-time sign-in returns to and completes the original private action.
3. User A and User B cannot read or change each other's private records.
4. Trip planning warnings, explicit order choice, Go transitions, private review, and summary work without data loss.
5. Store Representative direct/controlled fields, hours, updates, images, social links, and support obey their labels and scopes.
6. Administrator review and access revocation work from separate MFA sessions and never expose shopper-private data.
7. Forbidden actions fail server-side; privileged attempts create audit records.
8. Favorite → share public store → recipient Add to Trip and private unlisted-stop entry work without exposing private fields. Public reviews, team workflows and offline synchronization remain deferred.

## Product brand personality

Trustworthy, practical, welcoming.
