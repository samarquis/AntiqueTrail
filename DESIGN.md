# Antique Trail Design and Interaction Requirements

Status: approved interaction baseline through the 2026-08-03 adversarial hardening pass. D31 full Audit History UI and export policy remain unresolved; two-year append-only privileged-audit retention is approved.

This document is the canonical interaction contract. `DESIGN_SYSTEM.md` defines exact visual tokens, responsive rules, recurring component states, navigation, and screen-level acceptance. `PRD.md` defines product requirements, `PRODUCT_DECISIONS.md` records approved scope, `SECURITY_AND_TRUST.md` defines trust boundaries, and `IMPLEMENTATION_PLAN.md` defines delivery order. When a visual prototype conflicts with these documents, these documents win.

## Product promise and audience

> Antique Trail makes a fun day of antique shopping easy to see, easy to plan, and easy to trust.

Design first for shoppers roughly 50–80+ without creating a separate age mode. The first proven workflow has one person researching and creating a trip and another person navigating it. The product must also work for an individual shopper.

Use the accepted modern field-notebook direction and exact baseline tokens in `DESIGN_SYSTEM.md`: warm neutral surfaces, deep teal, Newsreader editorial headings, Atkinson Hyperlegible body text, restrained gold/rust status, and real or clearly fictional store imagery. Avoid antique-shop costume, distressed type, barnwood, parchment, public-star decoration in private workflows, dense dashboards, or unprovable route claims.

## Global interaction rules

- Use the Age-Inclusive Usability Baseline in `PRODUCT.md` and `PRD.md`.
- Keep one obvious primary action per screen and preserve entered data after errors.
- Explain disabled actions and identify the missing requirement.
- Pair status color with an icon and plain text.
- Provide keyboard, screen-reader, and non-drag paths for every core action.
- Use explicit confirmation for irreversible or high-risk actions. Prefer Undo for reversible routine actions.
- Never show shopper-private ratings, notes, other trips, or profile data to a Store Representative or Administrator.
- Label Internal Alpha as synthetic-only and keep real stores, owners, vendors, and public entities out until External Testing Readiness passes.
- Core trust information—freshness, provenance, hours, warnings, privacy/publishing consequences, and error recovery—is at least 16px. No required action exists only in a horizontally scrolling chip row, icon, drag gesture, toast, timed auto-advance, or color.
- Every form preserves safe input after field/server/auth failure, focuses a linked error summary, works at 320px and 200% zoom, and provides reduced-motion/forced-color/keyboard/NVDA/VoiceOver behavior.
- Decorative directional or symbolic characters used in links and buttons (e.g., `←`, `→`, `↗`, `✓`, `●`, `✕`) must be wrapped in `aria-hidden="true"`. The accessible label of every control must be complete without the symbol. Place `aria-hidden` on the exact character or wrapping span, not on the containing link or button.
- Dark theme (`prefers-color-scheme: dark`) support is mandatory. Dark-mode token definitions in `DESIGN_SYSTEM.md` are not complete until activated in the application stylesheet and verified against all approved contrast pairs. Dark mode is an acceptance check at every package boundary, not a post-launch enhancement.
- Stable shopper navigation is `Browse | My Trip | More`. `Browse` opens `/stores`; `My Trip` opens the active trip or `/trips`; `More` opens Saved Stores, Add a Place from a Link, Shared with Me, Trip Ideas, Account & Privacy, Install, and Help. Go is never a permanent tab. During an active trip, show a non-obscuring `Resume Go`/`View Trip Progress` banner. Server-derived Store Portal/Admin links may appear in More but never authorize. More menu items that require authentication (Saved Stores, Private History, Add a Place from a Link, Shared with Me, Trip Ideas, Account & Privacy) must signal their auth requirement to unauthenticated users before they tap, using a lock icon with `aria-label="Requires sign-in"` or a parenthetical label; the JIT auth pattern still applies on tap.

## Roles and test identities

- `Shopper`: browses public listings anonymously and authenticates for private writes.
- `Trip Creator`: authenticated shopper who owns one trip and may invite one Trip Partner.
- `Trip Partner`: one authenticated shopper bound to one shared trip.
- `Navigator`: the one participant authorized to control Go mode for that trip.
- `Store Representative`: verified, MFA-protected role scoped to one store.
- `Administrator`: separate MFA-protected operational role with no default shopper-private access.
- `Vendor Contributor`: deferred. If later activated after pilot proof, it is store/booth-scoped and draft-only.

Every Internal Alpha role uses a separate account and session. Test User A and Test User B may perform identical actions without sharing ownership or visibility.

The role switcher in `docs/design/antique-trail-flow-lab.html` is a prototype testing control only. Production roles are server-derived and tested through separate accounts and sessions.

## Shopper entry, browsing, and authentication

### First arrival

1. Open directly to Browse Stores in the approved area and show results immediately.
2. Do not require area setup, sign-in, or device-location permission.
3. Provide a prominent manual area selector. Browse never requests device location; precise location remains limited to a user-requested route.
4. Anonymous shoppers may Browse, open Store Details, and open an external navigation handoff.
5. `Save`, `Add to Trip`, personal rating, and private note use just-in-time authentication.
6. Successful authentication completes the original action and returns to the same context. Cancel or failure preserves context and performs no private write.

### Browse Stores

- Use a readable list as the default; map is secondary.
- Search by store name, town/area, and category.
- Show cover image or neutral placeholder, store name, town or distance when available, category summary, today's hours/open state, freshness, `Save`, and `Add to Trip`.
- Keep provenance, stale/missing information, and schedule risk understandable without requiring Store Details.
- Do not use map-only browsing or location permission as a prerequisite.

### New Since Your Last Visit

- For authenticated roles, compare a coarse per-account catalog-last-seen timestamp with approved listings visible to that role and release stage.
- Shopper Browse places `New Since Your Last Visit` prominently and shows no more than three cards plus `View All New`.
- Store Representative and Administrator homes place it below role-critical work.
- Use the manually selected Browse area, never precise/background location.
- Keep viewed or dismissed entries under `Recently Added` for 30 days.
- Treat a second location as a separate listing. Show `New location` only when the relationship is verified.
- This is in-app catalog freshness, not push/email notification, a notification center, behavioral profiling, or personalization.

## Store Details

Store Details shows:

- Approved cover plus up to five approved gallery images with meaningful alternative text.
- Description, address/map, hours and exceptions, contact, accessibility information when verified, provenance, freshness, and correction reporting.
- `Save`, `Add to Trip`, and `Navigate`.
- Latest three Store Updates and a chronological `See All` view.
- `Follow this store` for verified partner listings with official Facebook, Instagram, YouTube, Pinterest, and TikTok profile links.
- Shopper-private visit history, personal rating, and notes only for the signed-in owner.

Official social links open externally. Do not embed feeds, authenticate to social platforms, scrape/synchronize content, or import social tracking.

### Claim this listing

Store Details shows `Is this your store? Claim this listing` only for active, unclaimed, claimable listings after Package 10B enables public claims. Anyone may open the explanation; submission requires verified email and MFA. `/stores/:slug/claim` identifies the exact store and explains that a claim publishes nothing and grants no Portal access. The claimant confirms identity/relationship, two approved independent authority signals, consent, and exact store before `Submit Claim`. Each signal shows `Not started`, `Submitted`, `Changes requested`, or `Accepted`; competing claimant/internal fraud evidence stays hidden.

`/claims` and `/claims/:claimId` expose only claimant-owned `Draft`, `Submitted`, `Verification in progress`, `Changes requested`, `Conflict review`, `Approved`, `Rejected`, `Withdrawn`, or `Revoked`. Changes Requested names only the correctable requirement. Conflict/Rejected use a reason-neutral explanation and support path. Preserve safe fields across validation, authentication, and service failure. Approval routes to Store Portal only after the server atomically creates the exact-store grant; wrong account/hidden store/unauthorized access uses one generic unavailable state. No claim-document upload exists in Regional Public MVP.

### Report a correction

Anyone may open `/stores/:slug/correction`, enter type, description, and optional validated public source URL. `Submit Report` requires just-in-time verified-account authentication. Preserve the safe draft and exact store through authentication; cancellation/failure writes nothing. Success opens `/corrections/:correctionId` with claimant-owned `Submitted`, `In Review`, `Resolved`, or `Closed`. It never exposes assignee, internal notes, other reporters, or abuse signals. Anonymous report writes are denied.

### Candidate capture, sharing, and Trip Ideas

`/capture` accepts a PWA share-target POST or pasted HTTP/HTTPS URL, shows the original host plus optional private note, and never places the URL in a route query, log, or analytics. `Review Link` moves through `Checking the link` to `Suggestions ready`, `Some information could not be read`, or `This source must be entered manually`. Label every extracted field `Unverified suggestion from [host] · checked [time]`. A blocked/private/unsupported source retains the original link/note and opens manual fields. The shopper reviews/edits before `Save as Trip Idea`.

`Send to Someone` accepts one existing-account email and optional note. Every result says `If this email belongs to an eligible Antique Trail account, the idea will appear there.` `/shares` separates Shared with me/Sent; recipient detail offers Accept, Dismiss, Block, and Report. Accept creates an independent recipient-owned Trip Idea and opens Review Idea. `/trip-ideas` provides Edit, Add to Trip, Delete, and source details; the sender never sees recipient edits.

### Install Antique Trail

Installation is optional and never interrupts first-arrival Browse. `/install` remains available from More. After the first completed private action or later return, a nonmodal card may offer `Install`, `Not now`, and `Why install?`; Not now suppresses proactive prompting for 30 days on that installation. Android/desktop invokes the browser prompt only after Install. iOS and unsupported/failed states show numbered browser-specific instructions. Installed state suppresses prompts. Never prompt during consent, MFA, deletion, another destructive action, or Go; Partner activation links to `/install` without any invitation/role token.

## Public reviews — Regional Public MVP only

The review entry is absent—not disabled—until the server stage capability is enabled at Regional Public release. Eligible signed-in shoppers enter from Store Details or a completed visit summary. The screen first shows `Share an honest visit`, the selected store, the no-location-proof statement, conflict disclosure choices, and either the recorded `Done Here` month or a required `I visited this store` attestation.

Composer order is: visible 1–5 rating buttons with text equivalents, optional review text, public display-name preview, visit month/year preview, conflict disclosure, rules link, and `Preview Review`. Preserve content on validation/server error. Preview shows the exact public card and `Back to Edit` / `Publish Review`; publication may end in `Published` or `Pending Review`. Never imply a pending review affected the aggregate.

The user's review card offers `Edit`, `Delete`, `Report a problem`, and status. Delete names the store and says: `Your review disappears from public view and the store average immediately. You can undo for 60 seconds. After that, the review cannot be restored.` Confirmation has Cancel and `Delete Review`; no typed phrase. Show a persistent inline result plus polite live announcement and keyboard/screen-reader-operable `Undo Delete` for 60 seconds—not a toast/countdown. Reopening during the window shows the same own pending state. Undo restores only if still eligible/not held or removed; then purge text within 24 hours. A removed/rejected state shows the rule-based reason and `Appeal` while eligible. Appeal shows the original decision, deadline, one text/evidence submission, different-reviewer rule, and terminal `Restored` or `Upheld`; it never exposes reporter identity or internal fraud signals.

Store Representatives see the same public review and a scoped `Report` action. They never see shopper email, exact visit time, trip, note, location, account history, reporter identity, or internal moderation evidence and cannot reply in MVP. Ratings use a normal arithmetic average plus count. Connected/disclosed reviews show `Connection disclosed — not included in average`.

## Add to Trip and new-trip setup

`Add to Trip` always opens an explicit chooser:

1. Show editable existing trips and `Start a New Trip`.
2. Retain the selected store through authentication and new-trip setup.
3. After addition, name the destination trip and offer `View Trip` and `Undo`.

`Start a New Trip`:

- Generates an editable area-based name.
- Requires and visibly shows the shopping date.
- Retains the first selected store.
- Defers start location, departure time, optional return destination, and per-stop duration to Plan.

## Plan mode

### Progressive setup

- Show the dated trip and planned stops immediately.
- Allow store addition and accessible reordering before route setup.
- Package 5A requires date and stop durations for `Review Hours`; it does not require a route start. Start location and departure time are required before Package 5B `Check My Day` or `Start Trip`.
- Keep return destination optional.
- Starting location is private per trip. Accept manual address/place entry or an explicit `Use My Current Location` action.
- Request device location only after that action. Do not create a saved Home field, background tracking, analytics coordinates, or location logs.

### Stop duration

- Every stop has a visible editable expected browsing duration.
- Use a verified store estimate when available; otherwise default to 60 minutes.
- Offer large 30, 45, 60, and 90 minute choices plus Custom.
- Label schedule results as estimates, not guarantees.

### Package 5A Review Hours and Package 5B Check My Day

Package 5A shows `Review Hours`. It checks the shopper's current manual order against known store-day hours/freshness only, states `Travel time is not included`, and never claims arrival, finish, feasibility, drive time, or suggested order. Accessible `Move Up`/`Move Down` remains the reorder method. Starting with unresolved warnings requires one explicit acknowledgement.

After R-01 and the server capability are enabled, Package 5B replaces it with `Check My Day`. It uses provider travel-time data, displays estimated arrival/departure/finish, explains warnings, and may suggest an order. Require separate `Use Suggested Order` and `Keep My Order`; never auto-apply or claim best/optimized. Provider failure preserves inputs/current order and falls back to Package 5A without stale provider results.

Warnings appear once in a review summary and beside each affected stop:

- Amber: schedule risk, stale information, or closing soon.
- Red: closed today or likely arrival after closing.
- Gray: missing or unverified information.
- Corrective actions: `Move Earlier`, `Shorten Visit`, `Remove`, and `Keep Anyway`.
- Unresolved warnings remain visible. `Start Trip` allows continuation after one explicit confirmation.

### Trip readiness

Use a final card inside Plan, not another wizard. Show date, departure time, stop count, first stop, unresolved warning count, optional return destination, and estimated finish when calculable. `Start Trip` opens Go mode at Stop 1.

## Shared-trip handoff

- A Trip Creator may invite one authenticated Trip Partner to one trip.
- Both participants may edit the draft plan.
- Each online edit is versioned. If the partner changed the plan first, preserve the user's attempted action, show the latest affected fields/order, and offer `Reapply My Change` or `Keep Latest`; never silently overwrite or merge stop order.
- Either participant may be assigned Navigator before start.
- Only the assigned Navigator controls Go mode; the partner sees read-only progress.
- The shared plan and progress never include either shopper's private ratings or notes.
- No participant gains access to other trips, private history, or a household object.

Invitation requirements:

- Creator enters the intended partner email.
- Invitation is single-use and expires after seven days.
- Delivery uses the device share sheet or an in-person QR.
- Acceptance requires authentication with the matching verified email and disclosure of the shared trip data.
- Creator may cancel a pending invitation or remove an accepted partner. The accepted partner has a visible `Leave Trip` action with one consequence confirmation; access ends immediately, and if that partner is Navigator the remaining creator sees `Trip paused — assign a Navigator`.
- Expired, cancelled, and consumed tokens grant nothing and cannot be reused.
- Removing the active Navigator pauses Go mode until another Navigator is assigned.

Candidate Share and shared-trip invitation are separate capabilities. Candidate Share transfers one outside lead into a recipient-owned Trip Idea; a shared-trip invitation grants the named partner access to one trip plan/progress only. A pending Candidate Share expires after 30 days. Revoke, dismiss, or expiry immediately closes it and triggers deletion of its unaccepted payload from primary database and Storage within 24 hours.

For Candidate Share, the sender enters the recipient's verified account email and receives the same generic confirmation whether the address is matched, unmatched, unverified, or blocked. Only the matched account receives the in-app payload; an unregistered address receives no invitation. The recipient actions are `Accept`, `Dismiss`, `Block`, and `Report`. The sender sees only `Pending`, `Accepted`, or `Closed`; `Closed` never explains account state, dismissal, block, report, revocation, or expiry.

## Go mode

### Starting and navigation

- Start at Stop 1 with large `Navigate`, `Skip Stop`, and `Change Order` controls.
- Keep current warnings available.
- `Navigate` opens the selected external map application for the current leg; Antique Trail stays recoverable on return.
- Navigation never launches automatically.

### Arrival and active visit

- A large `I Have Arrived` action records confirmation time only.
- Do not use geofencing, continuous tracking, or stored arrival coordinates.
- The active-visit screen stays quiet: stop position, store, arrival time, and planned-until time without a countdown or automatic completion.
- Secondary actions open Store Details and `Add Private Note`.
- A large `Done Here` records completion time, updates remaining estimates, and opens the private visit review.

### Private visit review

- Optional and private to the individual account.
- Large one-to-five overall-feel choice with labeled endpoints.
- `No`, `Maybe`, or `Yes` return choice.
- One private note shared with notes entered during the visit.
- `Save and Next Stop` continues; `Skip for Now` continues and permits later completion.
- Never publish, aggregate, or expose these values to a store or trip partner.

### Skip, finish, and history

- `Skip Stop` advances immediately without a reason or confirmation.
- Show named Undo, retain the skipped stop in history, allow restore, and recalculate remaining estimates/warnings.
- `Store Appears Closed` is available for Planned/Arrived stops. It immediately records private `observed_closed`, advances/recalculates like Skip, and says `You marked this store as appearing closed at [time]. This is private trip history. It does not change the public listing.` Offer operable Undo; when online, separately offer authenticated `Report incorrect hours`. Summary says `Appeared closed`, never `Permanently closed`.
- Next-stop card shows store, drive estimate, estimated arrival, closing time, warnings, `Navigate`, and remaining stops.
- Finishing or skipping the last stop opens Trip Summary automatically.
- `End Trip Early` requires one confirmation when unvisited stops remain.
- Summary shows visited/skipped counts, trip duration, every store, private-review status, and missing reviews.
- Completed route history is read-only. Private ratings/notes remain editable.
- `Plan This Trip Again` creates a new draft and never alters history.

### Offline behavior

- `Start Trip` saves only the assigned Navigator's minimum snapshot and pending mutations in encrypted, account/install-bound IndexedDB using a non-extractable device-local key.
- Authenticated trip data never enters the public service-worker cache.
- Reopening the PWA prioritizes `Resume Trip`.
- Offline Go supports arrival, completion, skip, private rating, and private note.
- Mark offline changes `Local only · Pending sync` until server acknowledgement.
- Draft planning changes require service. A disconnected Trip Partner sees last-updated state.
- Go is bound to one active Navigator device. Moving Go to another device requires authenticated online confirmation; later old-device mutations are rejected.
- Replay authorized offline actions exactly once in their local order. Server authorization, active device/Navigator assignment, and trip state always win.
- Show a plain sync explanation for rejected stale actions. If the same private rating or note changed elsewhere, show both and require `Keep This Phone's Version` or `Keep Saved Version`; never silently overwrite.
- Purge after completed-trip sync, account switch, logout, or known authorization loss. If logout would discard pending changes, explain the loss and require confirmation.
- On reconnect after offline revocation, recheck authorization and purge before sync or refreshed private display. Already decrypted offline data cannot be remotely recalled.
- Offline display/mutation expires 36 hours after Start Trip. Cold restart decrypts only for the matching locally stored account/device grant; otherwise show only that an offline trip exists. Clear plaintext after 15 minutes backgrounded. At 36 hours lock pending sync; same account may reauthorize online within seven days, after which the next app execution purges ciphertext/key. Clock rollback over five minutes locks until online verification.
- Navigation passes the saved address to the external map app; that provider's offline routing is outside Antique Trail control.

## Store Representative portal

### Phone-first invitation and onboarding

Canonical flow: `/partner/join#token` → scrubbed `/partner/join` → `/partner/verify` → `/partner/draft` → unnumbered `/partner/status` review wait → approval status/email → normal sign-in with verified email and MFA → `/partner/activate` for tasks 4–5 → `/store-portal`. Exchange the fragment once and remove it before any third-party request. Invalid/expired/revoked/consumed/wrong-context tokens show `Invitation unavailable` and `Ask for a new invitation`; they reveal no state.

Use one task per screen at 320px without horizontal scroll. The five participant-controlled tasks are: 1 Review invitation and consent (voluntary, unpaid, invitation-only, grants nothing; plain policy; separate acknowledgements; typed name/title/store/owner-controlled email); 2 Create/verify account, MFA, and recovery codes; 3 Complete and preview the Store Draft; 4 after approval, review the exact approved listing and permissions; 5 finish activation, install help, and checklist. Between 3 and 4, Status is an unnumbered Submitted/Changes Requested/Approved/Rejected/Withdrawn wait screen because the owner cannot advance authority review. Show `Step n of 5` only on numbered tasks, never auto-advance, and preserve safe fields on Back/failure.

Token consumption/provisional consent/pending identity is an application transaction; Supabase Auth signup/verification is separate. Interruption resumes the same unprivileged pending identity. Duplicate submit/reload creates one identity/receipt. Changes Requested returns to exact fields. Approval email is status-only and contains no bearer; Store Portal remains absent until verified email, MFA, authority approval, and exact grant all pass.

### Store Representative Home

- Lead with scoped store name, public-listing state, hours verification date, urgent/stale-hours attention, `Update Hours`, and `Preview Public Listing`.
- Secondary areas: Store Information, Photos, Store Updates, Pending Changes, and Access & Help.
- Use the real shopper layout for preview and distinguish live values from pending changes.
- Exclude traffic analytics, advertising, shopper ratings, shopper-private data, and marketing tools from MVP.

### Publishing labels and hours

- Label every edit `Publishes Immediately` or `Requires Administrator Review` before submission.
- Direct fields: regular/holiday hours, phone, website, official description, temporary closure, and validated official social-profile links.
- Controlled fields: name, address/coordinates, ownership, permanent closure, categories, and Official Store Profile Photos.
- Controlled changes expose Pending, Changes Requested, Approved, and Rejected states while current approved values remain live.
- Hours editor supports Open/Closed per weekday, one normal range plus optional second range, and `Copy to Other Days`.
- Date-specific hours replace the weekly schedule for that date. Temporary closure requires start and end dates.
- Show store timezone derived from the approved address.
- Preview 14 shopper days before immediate publication. Success updates listing freshness and offers Undo.
- Active trips refresh warnings on next sync; completed history never changes.

### Store Updates

- Types: New Finds, Sale, Announcement, Store News.
- Composer: type, headline, details, optional vendor/booth label, optional official source link, optional one image, and shopper preview.
- Text-only updates publish immediately.
- An image-bearing update stays unpublished until Administrator image approval.
- When an approved image update is revised, its current approved version remains visible during review.
- Sale requires an end date and auto-archives. Announcement may have an end date. New Finds and Store News archive manually.
- Archive removes public display but preserves audit history. Restore is allowed; permanent self-service deletion is not.
- A Store Representative may publish on a vendor's behalf and label the vendor/booth.
- Internal Alpha uses synthetic updates. Do not scrape or synchronize Facebook, embed tracking, add comments/likes/followers, or implement structured Events.

### Images and social links

- Store profile: one cover plus no more than five gallery images. Store Update: no more than one image.
- Require local preview/crop, plain alternative text, and explicit rights confirmation.
- Prohibit copied website images, social screenshots, and shopper photos.
- Keep uploads private while validating, re-encoding, stripping metadata, and reviewing.
- Every profile-image add, replacement, reorder, cover change, or removal requires Administrator approval. Current approved images remain live until replacements are approved.
- Support one verified official business-profile link per Facebook, Instagram, YouTube, Pinterest, and TikTok. Validate domains, reject shortened URLs, preview, publish directly, audit, and offer Undo.

### Pilot support

- `Access & Help` contains `Get Help` and `My Requests`.
- Categories: bug, confusing workflow, store-data correction, feature idea, security/privacy concern.
- Disclose attached allowlisted diagnostics.
- Permit one optional owner-previewed, removable, sanitized screenshot; no arbitrary attachments.
- States: Submitted, In Review, Waiting on You, Resolved, Reopened.
- Show authenticated replies and full resolution history. Owner may confirm resolution or reopen.
- Email remains status-only. Security/privacy tickets alert Administrators urgently.
- Sign-in fallback email reveals no pilot data until identity verification.

## Account and privacy controls

`Account & Privacy` is reachable from the signed-in profile menu without entering a privileged role. It lists account email/verification state, `Export My Data`, supported private-history deletion controls, blocked senders, and `Delete My Account`. Destructive actions never share a row or visual style with routine navigation.

### Export My Data

1. Explain the ZIP contents and exclusions before request; show no presigned URL until password authentication within ten minutes plus already-enrolled MFA succeeds. Never require a shopper to enroll MFA to exercise export; use the tested factor-recovery fallback when needed.
2. `Create Export` enters `Preparing`. Duplicate requests return the existing active job rather than creating another.
3. Ready state shows generated time, expiry, file size, checksum, and `Download ZIP`. The private archive expires after seven days; each download URL expires after 15 minutes and may be regenerated while the archive remains available.
4. Failure shows a plain reason-neutral error, preserves the request status, moves focus to the alert, and offers `Try Again` or support. Expired shows `Create New Export`.

### Delete My Account

1. Preview affected categories, immediate session/grant revocation, review hiding/aggregate removal, the seven-day cancellation window, day-8 primary deletion, backup aging, and exclusions retained only by law/security policy.
2. Require password authentication within ten minutes plus MFA only when the shopper already enrolled it, using the tested recovery fallback when an enrolled factor is unavailable; privacy rights never require new MFA enrollment. Then require one unchecked acknowledgment and a single red `Schedule Account Deletion` action. Do not require memorized text or place the action beside Cancel.
3. Success signs out normal access and shows the exact deletion date plus `Cancel Account Deletion`. Reauthentication during seven days enters cancellation-only mode; it cannot read ordinary account content. The preview states that privileged Administrator/Representative grants will not be restored automatically.
4. Cancellation confirms the request ended and restores ordinary account/private-data access. Any privileged grant requires the normal audited regrant/reverification path, and any review that became ineligible or moderated remains unavailable. After day 8, the route shows deletion complete and support cannot promise restoration.
5. Validation/service failure preserves context, does not schedule deletion, moves focus to the error summary, and offers Retry/Back. Browser Back never schedules, cancels, or completes deletion.

## Administrator experience

### Administrator Home

- Persistently label role and environment, for example `Administrator Test Account` and `Internal Alpha · Synthetic Stores Only`.
- Show urgent security/privacy work first.
- Use one `Needs Review` worklist grouped into Partner Onboarding, Store Changes, Images, and Support.
- Queue items show store, submitter, request type, status, and submitted age; order urgent first, then oldest pending.
- Include `Access & Safety` for representative grants/revocations and audit activity.
- Exclude shopper-private records, traffic, ratings, trip details, and marketing metrics.

### Review workspace

- Open one readable type-aware workspace from a queue item.
- Fixed context: request type, store, submitter, status, submitted time/age, current live state.
- Store change: Current vs Requested plus shopper preview.
- Image: rights confirmation, alt text, processing results, shopper preview.
- Partner onboarding: consent/verification state and exact final Pilot Store Draft; Administrator cannot edit owner fields.
- Support: authenticated thread, disclosed diagnostics, sanitized screenshot when present, type-specific actions.
- Actions depend on type. `Request Changes` and `Reject` require a plain reason. Approval shows the exact effect before confirmation.
- Audit every transition with actor, time, before/after or approved snapshot, reason/comment, and result.
- No bulk approval, direct submitted-field editing, automatic queue advance, or shopper-private data.
- Completion offers `Back to Queue` and `Review Next`.

### Public-review moderation and appeal

This workspace and its routes are absent until the public-review stage capability is enabled. The launch Administrator opens one case from a reason-coded moderation queue. Case detail shows only public review/store context, reported rule, minimum necessary report evidence, current aggregate effect, prior transitions, and appeal status; unrelated shopper history, trips, notes, location, reporter identity, and internal fraud signals remain hidden unless separately authorized for a documented abuse investigation.

- Available routine transitions are `Hold`, `Remove`, `Restore`, and `Dismiss Report`. Every action requires recent authentication, a selected rule/reason, a plain explanation to the author, and a preview of the aggregate effect before confirmation.
- Hold and Remove hide the review and exclude it from aggregate immediately. Restore republishes only if eligibility still passes and recomputes aggregate. Dismiss Report changes no review visibility.
- Failed mutation retains the case and typed reason, moves focus to an error summary, and never advances automatically. Success shows exact new state, author-notice status, aggregate result, and `Back to Queue` / `Review Next`.
- Appeal intake shows deadline, appellant type, challenged rule, and new evidence. The original moderator is ineligible to decide. A different Administrator uses the same minimized case view when available.
- With one Administrator, a qualified independent reviewer receives a single-case, 24-hour, MFA-protected view containing only the approved minimized packet. `Restore` or `Uphold` plus a plain reason is terminal, expires the capability, and applies through the trusted service; the Administrator cannot edit that decision.
- Store Representative appeal/report views never disclose reporter identity, shopper email, trip/location/note/account history, or internal fraud signals.

### Access & Safety

- Separate pending invitations from active Store Representative grants.
- Active grant shows representative identity, verified-email state, MFA state, exact store scope, grant status/date, and recent privileged activity without shopper activity.
- Actions: `View Audit`, `Revoke Access`, controlled `Regrant Access`, `Revoke Invitation`, and create a new invitation through approved onboarding.
- Revoke requires Administrator MFA, recent authentication, plain reason, and exact consequence preview.
- Revoke removes only the selected store scope and denies the next server-authorized write, including from an already-open session. It does not delete account, audit history, approved store data, or unrelated shopper data.
- Private Beta withdrawal also hides the Pilot Store Record from the active pilot while preserving record/history for recovery and audit.
- Regrant requires still-valid verified email, MFA, authority verification, exact scope preview, and recent Administrator authentication. It never restores broader access.
- Audit every attempt. Exclude bulk access changes, multi-store Representative scopes, self-service role changes, and history deletion.

### Audit History status

D31 is not approved. The system still requires append-only privileged audit records retained for two years and Administrator access necessary for D30 `View Audit`, but the proposed full searchable Audit History timeline and export policy remain unresolved and must not be treated as approved UI scope.

## Readiness and public-promotion interactions

`/readiness/join#token` follows the same fragment exchange/scrub/no-third-party rules as every invitation. The matching verified-email adult sees the current test privacy notice, 30-day grant, audience restriction, withdrawal, and `Join Readiness Test`; wrong/expired/revoked states use one generic unavailable screen. `/readiness/status` shows only the current person's consent/grant/run status and withdrawal. `/admin/readiness` is operational and case-scoped; it never shows private trip content, precise location, accessibility details beyond approved scheduling bands, or one invitee to another.

Package 10A privately previews `/stores?area=topeka-ks`, canonical Store Details Share, flyer/QR, consent, social preview, sitemap/robots transition, and failure/removal behavior. Package 10B alone publishes/distributes. Public Share sends only the canonical Store URL. A withdrawn flyer/logo/social consent immediately marks the artifact `Do not distribute`, blocks reprint/future post, and gives operations a removal-confirmation task. Broken/substituted QR, unavailable area, stale/hidden store, quota stop, and promotion pause each have plain recovery copy and never redirect to an invitation or privileged route.

## Implementation acceptance journeys

Before external testing, prove at minimum:

1. Anonymous Browse and Details work without location or sign-in.
2. Just-in-time sign-in returns to and completes the original private action.
3. User A and User B cannot read or change each other's unrelated private records.
4. Creator and one verified Trip Partner share only one trip; only Navigator controls Go.
5. Plan warnings, explicit order choice, readiness, Go transitions, private review, summary, and offline resume work without data loss.
6. Store Representative direct/controlled fields, hours, updates, images, social links, and support obey their labels and scopes.
7. Administrator review and access revocation work from separate MFA sessions and never expose shopper-private data.
8. All forbidden actions fail server-side and all privileged attempts create audit records.
9. Public-review routes are absent through Private Beta; at Regional release, eligibility, compose/preview, pending/published, edit/delete, report, moderation, and one appeal preserve privacy and update the arithmetic aggregate transactionally.
