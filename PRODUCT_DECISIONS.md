# Product Decisions

Status: planning baseline approved through the 2026-08-03 adversarial hardening pass. D31 full Audit History UI/export, the final public name/domain, any paid production budget, and the first post-Topeka community remain unapproved. Coding requires a separate start instruction.

`DESIGN.md` is the canonical interaction contract for the approved flows summarized here; `DESIGN_SYSTEM.md` defines reproducible visual and component rules. This file records scope and policy; it does not replace the detailed interaction requirements.

## Confirmed decisions

### Public, multi-user product

The application is not built for one household. Original research informs the design but personal data and personal assumptions must be removed.

### PWA first

Build a Progressive Web App first. Preserve the ability to package the same app for Android later with Capacitor.

### Public ratings resemble Google-style ratings

Stores have public 1–5 star aggregate ratings and review counts.

### Separate rating concepts

- Public store rating
- Private personal rating
- Private personalized match score

### Preference profile belongs to the user account

Every user's taste model is private and individualized.

### Directory data sources and provenance

Store Partners provide and confirm their own listing data. A non-partner listing may contain only manually verified public business facts: name, address, phone, hours, website, and categories. Preserve Store Data Provenance with the source URL or owner confirmation, verifier, and verification date. Do not copy descriptions, photos, or reviews without permission. Do not scrape or bulk-import a source without written license review. Google Places content is not the stored catalog; an optional Google place ID may be retained for a later approved live lookup that follows current [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), attribution, and provider terms.

### Store Browser is the shopper front door

Open on a list-first Store Browser, not the trip planner or map. Search supports store name, town or area, and category. Manual area browsing works without device location. An optional map is a secondary view. Each store card shows a cover image or neutral placeholder, name, town or distance when available, category/what-you-will-find summary, today's hours and open state, freshness state, Save, and Add to Trip. Store Details adds the approved gallery, description, address/map, full hours/exceptions, contact links, provenance/freshness, Navigate, Report correction, and shopper-private history.

### Official Store Profile Photos

Include rights-cleared Official Store Profile Photos in the Store Browser, Store Details, and trip presentation. Internal Alpha uses generated fictional images for Synthetic Stores. Real images must be provided by an authorized Store Partner or have specific documented permission; automatic website/social screenshots and copied third-party images are prohibited. Store Representatives submit photos through a Store Change Request; quarantine, validation, re-encoding, metadata removal, accessible alternative text, and Administrator approval precede display. A missing photo uses a neutral placeholder and does not hide an otherwise valid listing. Shopper/review photo submissions remain deferred until after the Regional Public MVP.

### Age-inclusive usability baseline

Design first for shoppers roughly 50–80+ without creating a separate age mode. Target WCAG 2.2 AA. Use at least 18 CSS px default body text, 1.5 line height, and no essential text below 16 CSS px; support 200% text resize, reflow, and user text-spacing overrides without loss. Use at least 48 by 48 CSS pixel mobile targets, keyboard access, visible focus, meaningful image alternatives, text with primary icons, and status that does not rely on color alone. Keep labels plain, one primary action clear at a time, inputs preserved after errors, and alternatives to drag gestures. Avoid automatic advancement or time pressure. Images may enlarge but never contain the only copy of essential information. Test required shopper journeys with the approved 2026-07-31 older-adult cohort and pass thresholds before public launch.

### Listing freshness and stale behavior

A listing remains verified for 180 days after Store Partner confirmation or manual source verification. A correction or closure report triggers immediate review. From day 181 through day 365, label the listing `Verification overdue`, keep it searchable with a warning, and exclude it from Open Now and automatic trip ordering. After day 365, hide it from normal discovery until reverified. Never automatically delete the listing or its provenance. Successful reverification resets the clock.

### Trip app owns the itinerary

Navigation providers handle only the current leg.

Regional Public MVP limits one trip to eight active stops. This bounds phone usability, offline state, and deterministic Check My Day evaluation; a later measured need may raise the limit through a product/algorithm contract change.

### Routing location privacy

Antique Trail may send only the coordinates necessary for a user-requested route to a named routing provider disclosed in the privacy notice. Device location requires explicit while-in-use permission; users may instead enter a start location manually. Directory browsing and manual trip planning work without device-location permission. Do not collect background or continuous location, raw movement history, or precise coordinates in analytics, application logs, email, or support records. Saved trip locations remain private to their shopper. Completed-trip location data follows a separately approved retention policy.

### Professional and commercial standard

The application must be secure, maintainable, moderated, monitored, and polished enough to promote through opt-in printed flyers in participating stores.

### Security is launch-blocking

Security, privacy, moderation, backups, logs, incident response, and authorization testing are required before launch.

### Regional launch

Start with one strong region and verified store data rather than a sparse national launch.

### Staged release gates

Launch first as a controlled-access Private Beta without public user-generated content. After directory, trip planning, moderation, and abuse controls are proven, launch a Regional Public MVP with text-only public ratings and reviews.

### Regional Public MVP boundary

The Regional Public MVP requires Packages 1–10B and every named provider, human-capacity, security, privacy, legal, recovery, accessibility, age-representative usability, operations, and release gate. Phase headings are capability groupings, not execution authority. Defer Phase 4 finds/households, Phase 5 preference onboarding/personalization, shopper/review photos, and owner review responses until after the Regional Public MVP.

### In-person store-partner pilot

Choose a Pilot Area where direct shop-owner outreach is practical before public product promotion. A candidate shop is a Prospective Store Partner until an authorized owner or manager explicitly agrees to participate; that person may then join the Private Beta as a Beta Tester. Do not imply a partnership before consent.

### Topeka Private Beta Pilot Area

Use Topeka city limits as the future Private Beta Pilot Area. Store outreach, partner claims, and real-location import remain deferred until a separate pre-pilot readiness gate is defined and passed.

### Internal Alpha before external participation

Run an Internal Alpha before adding real stores or contacting any owner or public entity. It begins with a Solo Agent-Assisted Alpha: Scott, as Primary Internal Tester, operates all separate role accounts and may supervise AI Test Agents. It ends with Two-Person Acceptance: Scott's wife, as Independent Internal Tester, performs shopper acceptance using her own account and phone. AI evidence cannot substitute for her independent acceptance or approve a release gate. Test with Synthetic Stores only. Synthetic records may represent store types and owner workflows, but must not use real names, logos, photos, reviews, or imply affiliation.

### Separate Internal Alpha accounts

Every role uses a separate Test Account. During Solo Agent-Assisted Alpha, the Primary Internal Tester operates Test User A and may use a separate Agent-Assisted Shopper Account for user-two simulation while preserving separate sessions, ownership, and visibility. During Two-Person Acceptance, the Independent Internal Tester uses a newly created Test User B account on her own phone; the solo-stage account is never reassigned to her. Test User A and Test User B may intentionally perform identical actions or enter duplicate values, but neither can read or change the other's private data. Household sharing remains disabled during this isolation test; recipient-specific Candidate Share grants no household membership or broader access.

### Recipient-specific Candidate Share

An authenticated shopper may send one Candidate Link to one named authenticated recipient. The recipient may accept or dismiss only that share; acceptance creates a recipient-owned Trip Idea. Preserve the original URL, capture time, sender-supplied note, and extraction provenance. Treat extracted name, address, hours, contact, inventory, or event hints as unverified suggestions until the recipient reviews them. A blocked, private, or unsupported source retains the link and uses manual-entry fallback. Candidate Share never publishes a store or event, implies a Store Partner relationship, enables household access, or exposes either shopper's other private records. Include this narrow Capture workflow in Internal Alpha and the Regional Public MVP while full household lists and public Events remain deferred. Approved 2026-07-30.

### Candidate Share expiry and cleanup

A pending Candidate Share expires 30 days after it is sent. The sender may revoke it while pending, and the named recipient may dismiss it. An expired, revoked, or dismissed unaccepted payload becomes unreadable and unclaimable immediately and is deleted from the primary database and associated Storage within 24 hours. Acceptance creates a recipient-owned Trip Idea governed by the approved private-content lifetime; it does not expose later recipient edits or activity to the sender. Approved 2026-07-31.

### Candidate Share delivery and abuse protection

The sender addresses a Candidate Share to the verified email of an existing Antique Trail account. The server resolves the address to that account without revealing whether an account, block, or delivery match exists; only the matched verified account may receive or open the payload. The recipient may Accept, Dismiss, Block, or Report. Block closes the current share and denies later shares from that sender. Report closes the share and creates an access-controlled moderation case. The sender sees only `Pending`, `Accepted`, or `Closed`; `Closed` does not distinguish an unknown or unverified address, dismissal, block, report, revocation, or expiry. Use the same generic confirmation, response shape, and timing behavior for matched, unmatched, and blocked addresses, with server-side rate limits. Do not send an invitation or payload to an unregistered address. Approved 2026-07-31.

### Representative Test Account

Internal Alpha includes a separate Representative Test Account scoped to one Synthetic Store and operated by the Primary Internal Tester. It is never shared with shopper sessions. The Independent Internal Tester is not required to use it. It cannot access shopper saves, personal ratings, notes, trips, or other private records.

### Store Representative publishing split

Store Representatives may directly publish regular hours, holiday hours, phone, website, official description, and temporary closure for their assigned store. Name, address or coordinates, ownership, permanent closure, category tags, and Official Store Profile Photos require an approved Store Change Request. Store Representatives never edit reviews or access shopper-private data. See `docs/adr/0001-split-store-representative-publishing-by-field-risk.md`.

### Administrator approval during Internal Alpha and Private Beta

Use a fourth, separate Administrator Test Account to approve or reject Store Change Requests, grant or revoke representative roles, and inspect audit records. It uses a separate session with MFA and cannot access shopper-private data. For initial Regional Public MVP, the Administrator also performs narrowly scoped routine review moderation with MFA, recent authentication, reason-coded transitions, minimized case evidence, and append-only hash-chained audit with externally anchored roots. Defer a separately staffed Moderator role until review volume requires one.

### Internal Alpha feature boundary

Internal Alpha includes four-role authentication; a list-first Synthetic Store Browser with search, optional map, details, hours, and generated fictional profile images; private Candidate Link capture, recipient-specific Candidate Share, and Trip Ideas using synthetic sources; private saves, personal ratings, and notes; hours-aware trip planning; active-trip navigation handoff; offline recovery; Store Representative and Administrator workflows; and audit records. It applies the Age-Inclusive Usability Baseline. It excludes public reviews, shopper/review photos, household lists or broad shared access, finds and collections, public Event records, notifications, owner analytics, advanced personalization, and real stores.

### Internal Alpha shopper-trip exit gate

The Primary Internal Tester using Test User A and the Independent Internal Tester using Test User B must each complete three successful Shopper Trip Acceptance Runs on separate phones and accounts. At least one run must prove Test User B can send a synthetic Candidate Share to Test User A, Test User A alone can accept it into a recipient-owned Trip Idea and add it to Plan, and neither account can read the other's unrelated private records or recipient edits. Anonymous, wrong-recipient, Representative, and Administrator access must be denied. For each account, at least one run must prove active-trip recovery after refresh or app restart and while offline. Across the runs, the tester must exercise navigation handoff, arrived/completed/skipped/closed stop states, and route recalculation. AI-assisted or Primary Internal Tester runs against Test User B are supplemental and do not replace the Independent Internal Tester's three runs. The gate requires zero Blocking Defects and zero unauthorized cross-account exposure or modification of shopper-private data.

### Internal Alpha privileged-workflow exit gate

The Primary Internal Tester must operate two complete Privileged Workflow Acceptance Cycles using the separate Representative Test Account and MFA-protected Administrator Test Account; the Independent Internal Tester is not required to operate privileged accounts. Across each cycle, every Representative-Managed Field must publish directly; at least one Store Change Request must be approved and one rejected; unapproved Controlled Store Fields must remain unpublished; representative self-approval must fail; revocation must block further writes from the representative's existing session; and all privileged actions must have audit records. Both privileged accounts must remain unable to read or modify Test User A or Test User B shopper-private data. The gate requires zero Blocking Defects; every allowed action must succeed and every forbidden action must be denied.

### No store-owner participation before readiness

Do not contact or include a store owner, import a real store, or add any external participant until Solo Agent-Assisted Alpha and Two-Person Acceptance pass and a separate External Testing Readiness gate is defined and passed. After that gate passes, invite one consenting Store Partner representative into the controlled, invitation-only Private Beta to test the real owner workflow before public access. The gate does not authorize public product promotion.

### External Testing Readiness gate

Before first-owner contact, require dated passing evidence approved by the Primary Internal Tester for all nine checks: both Internal Alpha stages; the complete authorization and security test set; zero open Blocking Defects or known privacy, security, or data-loss defects; successful backup-restore and rollback rehearsals; working pilot-environment monitoring, error reporting, and support intake; legally reviewed final pilot privacy notice and owner-consent wording; one successful External Testing Dress Rehearsal; one Private-Beta incident rehearsal covering detection, containment, credential/scope revocation, user/store communication, database and Storage recovery, deletion-receipt replay, and post-incident evidence; and documented confirmation from qualified counsel/insurance professionals that the operating legal entity and required pilot insurance are active for the planned owner contact and participation. A failed check blocks outreach. AI Test Agents may collect evidence but cannot approve the gate.

### First Store Partner onboarding

Demonstrate the product using Synthetic Stores only. Before creating a real store record or representative account, obtain Store Partner Pilot Consent and verify the representative's authority both in person and through a published business contact. The representative must use an owner-controlled verified email and MFA; shared credentials are prohibited. Consent states that the pilot is voluntary, invitation-only, unpaid, non-endorsing, and not public product promotion. On withdrawal, revoke representative access and remove the real store from the active pilot. Audit onboarding, scope grants, withdrawal, and revocation.

### First Pilot Store Record

After consent and authority verification, atomic Administrator approval of the owner-submitted Pilot Store Draft creates one Pilot Store Record using owner-confirmed name, address, phone, website, regular and holiday hours, official description, and category tags. Record the source/provenance and verification date. The Store Representative then tests the already-approved Representative-Managed Field workflow and submits rights-confirmed Official Store Profile Photos through Store Change Requests. Quarantine and process images before Administrator approval and display. Restrict the record to invited Private Beta participants. Exclude ratings/reviews, shopper/review photos, events, owner responses, and analytics.

### Initial Private Beta Cohort

Limit the Initial Private Beta Cohort to four human accounts and one Pilot Store Record: Scott's separate shopper and Administrator accounts, Scott's wife's separate shopper account, and the first owner's Store Representative account. The owner does not use the representative account for shopper activity; any future shopper testing requires a separately approved account. AI and Agent-Assisted Test Accounts remain restricted to Synthetic Store data. Do not add another user or real store until a separate expansion gate passes.

### Initial Private Beta Expansion Gate

Before adding any additional user or a second real store, require dated evidence approved by the Primary Internal Tester that: the owner completed Representative-Managed Field edits, one independently completed direct hours/content edit, submitted two Store Change Requests that the Administrator approved and rejected respectively, used MFA, and participated in a scheduled revoke/regrant test; Scott and the Independent Internal Tester each completed two shopper trip runs containing the Pilot Store Record; support and feedback intake worked; privileged audit records were complete; monitoring, backup restore, and rollback checks remained passing; and no Blocking Defect or known privacy, security, or data-loss defect remained open. The owner must independently record `continue` or `withdraw` and whether the listing is useful, hours maintenance and reviewed changes are understandable, each flyer/social channel is accepted or declined, and the operator interventions/minutes/support cases were acceptable. `Withdraw` or missing owner evidence blocks expansion; `continue` still requires Product Owner acceptance of support load. No minimum calendar duration applies. A failed check blocks expansion.

### Controlled Private Beta Expansion

After the Initial Private Beta Expansion Gate passes, add one Store Partner and one Pilot Store Record at a time. Apply the same consent, authority verification, account onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks to each addition before adding the next. Cap the controlled Private Beta at three total Store Partners and stores. Keep it invitation-only with no public product promotion. After all three pass, stop expansion and conduct the separate Regional Public Readiness Gate below; passing the pilot does not automatically authorize public access.

### Regional Public Readiness Gate

Public access remains blocked until dated evidence proves all three Controlled Private Beta additions passed; every Package 1–10A prerequisite required by the Regional Public MVP passed; all provider, human-capacity, security, privacy, legal, accessibility, browser/device, support, availability, DB/Auth/Storage recovery, and incident gates passed; and zero Blocking Defects or known privacy, security, or data-loss defects remain. Topeka catalog readiness additionally requires 100% of active discoverable listings inside their approved verification interval, at least 12 active verified listings inside Topeka city limits, at least 70% coverage of an independently enumerated eligible-shop baseline, and at least three valid unique three-store itineraries on each of Tuesday, Friday, and Saturday—nine total—using current hours. Use one non-holiday date per named day within 30 days after the baseline recheck; each itinerary starts at the first store's verified opening, allows 45 minutes per store plus a 10-minute transition buffer, uses the accepted Package 5B provider's recorded travel-time matrix, and finishes every visit no later than verified closing. An eligible shop is a brick-and-mortar business inside Topeka city limits, open to the public on at least one recurring day per week, whose primary advertised inventory is antiques or vintage goods; event-only markets and general thrift or consignment businesses without that primary focus are excluded. Two people independently enumerate the baseline from dated public sources, reconcile disagreements, preserve the source list, and recheck it within 30 days before signature. If the 70% rule requires fewer than 12 listings, 12 still controls; if fewer than 12 eligible shops exist, the Product Owner must approve a written market-size exception instead of silently weakening the gate. Before public product promotion, at least eight invited independent Topeka shoppers outside the Initial Private Beta household/owner cohort—including the approved older-adult cohort where eligible—must attempt Browse, Details, Plan, Go, and private visit memory; at least seven must complete without a Blocking Defect and at least five must confirm return intent or complete a second trip. The Product Owner signs the evidence. Public deployment, product promotion, and anonymous real-store access remain unauthorized until that signature and Package 10B's public recovery/domain/capacity gate.

### Regional growth sequence

Use Topeka city limits for the first Regional Public MVP. After Package 11 RG-01 passes and the Product Owner separately selects one Eligible Small Community, Package 12 privately recruits its approved anchor owner, verifies at least two listings, and reuses Package 10A/10B exact catalog, consented-promotion, recovery/capacity, preactivation signature, and rollback controls before activating only that area. After activation, run the Community Expansion Gate below; its passing receipt is required before a separately approved Package 12 run for another community. Package 12 is repeatable once per area for ordinals 1–3, with a separate Product Owner selection each time. An Eligible Small Community is outside a larger metro, roughly within a 60-minute drive of Topeka, has at least two antique or vintage shops, and has at least one willing anchor Store Partner before activation. Stop after three communities and conduct a separate larger-metro readiness review before considering Kansas City or another larger metro. Exact communities remain unresolved.

### Community Expansion Gate

Before activating another small community, require dated Primary Internal Tester approval that the current community has: at least two verified active shop listings; one anchor Store Partner who completed onboarding, one direct edit, one controlled change, and one support request; separate-phone/account multi-stop trip runs completed by Scott and the Independent Internal Tester; voluntary trip-use confirmation from five additional shoppers without requiring precise-location tracking; passing monitoring, support, and store-data accuracy checks; and zero open Blocking Defects or known privacy, security, or data-loss defects. No minimum calendar duration applies. A failed or incomplete check blocks the next community.

### In-person Store Partner QR invitation

After a Synthetic Store demonstration and verbal interest, the recently authenticated MFA-protected Administrator creates a Store Partner Invitation and displays its QR code. The QR contains only an opaque random token, expires after 30 minutes or one successful redemption, and contains no owner, store, email, or role data. Scanning opens the same PWA's partner-onboarding page; it does not install the PWA or grant access. The owner reviews the pilot privacy notice and terms, enters the required consent statements and identity credentials, and submits once. One idempotent transaction consumes the invitation, stores an immutable provisional consent submission, and creates an owner-controlled Pending Partner Identity with no store, role, scope, or pilot-data grant. The owner then verifies email and configures MFA. Only after verified email and MFA does the system finalize the immutable Pilot Consent Receipt, bind it to that verified email, and deliver the owner copy. Interruption before transaction commit consumes nothing; interruption after commit resumes the same pending onboarding record and cannot create a second identity or receipt. The invitation remains pending for authority review until the Administrator independently verifies authority through the published business contact and approves it. Only final Pilot Store Draft approval may create the Pilot Store Record and store-scoped Store Representative grant. Installation instructions appear after approved sign-in. Generation, expiry, revocation, consumption, provisional consent, identity creation, email/MFA verification, receipt finalization, authority review, approval, role grant, and installation handoff are audited. See ADR 0002.

### Store Partner pilot-consent capture

Use a phone-friendly consent screen with a plain-language summary and links to the full, legally reviewed pilot privacy notice and terms. Require separate acknowledgments of authority, voluntary participation, permitted store-data use, no payment or endorsement, and withdrawal. Require typed name, business title, store name, and owner-controlled email. Submission creates the immutable provisional consent record and unprivileged Pending Partner Identity atomically; it does not grant access. After email verification and MFA, finalize the immutable Pilot Consent Receipt with the provisional submission, verified email, finalization timestamp, invitation identifier, and policy version. Email the owner a receipt/PDF copy without internal verification evidence. Administrators may view but never edit either consent record. A material term change requires fresh consent before continued participation.

### Pilot Store Draft review and approval

After consent, verified email, and MFA, the Pending Partner Identity enters the owner-confirmed core listing fields into a Pilot Store Draft. Only that identity and Administrators may read it. The owner may edit while draft or changes-requested and submits it for review. The Administrator verifies the submission against the published business contact and may approve it or return comments, but may not silently edit owner-submitted values. The owner corrects and resubmits. Approval requires MFA, recent authentication, and an exact final preview. One atomic transaction freezes the approved draft snapshot and provenance, creates the Pilot Store Record, and grants only its store-scoped Store Representative role; any failure creates neither record nor grant. Preserve comments and all state transitions in the audit history. See ADR 0003.

### Representative activation and first login

After successful approval, send a status-only email containing the normal PWA sign-in link; never send a reusable invitation, magic role, or authorization token. The owner signs in using the already verified email and MFA. The portal shows the exact approved Pilot Store Record, store-scoped Representative permissions, Pilot Consent Receipt, and approval history, then offers device-appropriate PWA installation instructions. Start a guided checklist: confirm the listing, review hours, make one Representative-Managed Field edit, submit one Store Change Request, and use pilot support. Changes-requested or rejected emails contain status only; comments and store data require authenticated portal access. Audit email delivery, first approved sign-in, installation handoff, and checklist progress. See ADR 0002.

### Store Partner Pilot Support

Provide an in-app Pilot Support Ticket workflow with categories for bug, confusing workflow, store-data correction, feature idea, and security/privacy concern. Automatically attach only store/account identifiers, app version, timestamp, and basic device/browser details; never attach tokens, shopper data, precise location, or internal logs. Allow an optional screenshot only after owner preview. The submitting Store Representative and Administrators may read the ticket, replies, and status in the authenticated portal. Email contains status only. Security/privacy concerns trigger an urgent Administrator alert. A fallback support email accepts sign-in-failure reports but exposes no pilot data until identity is verified. The owner may confirm resolution or reopen the ticket.

### Product promise and first arrival

The product promise is: “Antique Trail makes a fun day of antique shopping easy to see, easy to plan, and easy to trust.” Browse Stores is the first-arrival screen for the approved area and shows results immediately without sign-in or location permission. Anonymous visitors may Browse, open Store Details, and Navigate. Save, Add to Trip, private ratings, and private notes use just-in-time authentication and return to the interrupted action without creating a write on cancellation or failure. Approved through D5–D6 on 2026-07-30.

### Trip construction and readiness

Add to Trip always names the destination trip and supports an explicit existing-trip or new-trip choice. A new trip initially requires only editable area name and date; starting point, departure, optional return, and stop durations are completed progressively in Plan. Starting location is private, manual by default, and may use current location only after an explicit action. Check My Day previews a suggested feasible order, explains reasons and warnings, and never silently reorders. Users choose `Use Suggested Order` or `Keep My Order`; accessible move controls remain available. Approved through D7–D14 on 2026-07-30.

### Active trip and private visit memory

Arrival is manual; Antique Trail does not geofence or provide turn-by-turn navigation. Go shows one stop at a time and hands the current leg to an external map. A quiet active-visit screen ends with `Done Here`, then offers an optional private 1–5 rating, return choice of No/Maybe/Yes, and note. Skip is immediate and reversible with Undo. Completion or confirmed early ending produces a private summary and immutable visit history; private notes and ratings remain editable, and `Plan Again` clones the trip. Approved through D15–D19 on 2026-07-30.

### One-trip partner handoff

A Trip Creator may invite one Trip Partner to one trip. Both may edit the draft, and either may be assigned Navigator. Only the Navigator controls Go; the other participant sees read-only progress. Ratings and notes stay private to their author, and neither participant gains access to the other person's unrelated trips or account data. The invitation is bound to a verified matching email, single-use, valid seven days, and may be presented through the native share sheet or a QR code. Removal of an active Navigator pauses the trip until another Navigator is assigned. Approved through D20–D21 on 2026-07-30.

### Offline active trip

Only the assigned Navigator receives the minimum offline snapshot for the active trip. Arrival, completion, skip, private rating, and private note may be recorded offline with a visible pending-sync state and safe resume after refresh or restart. Draft collaboration stays online-only. The partner sees last-updated state, and external-map offline availability remains outside Antique Trail's control. Approved as D22 on 2026-07-30.

### Offline active-trip storage

Persist only the assigned Navigator's minimum active-trip snapshot and pending offline mutations in encrypted IndexedDB. Bind the cache cryptographically to the authenticated account and local PWA installation with a non-extractable device-local Web Crypto key; never place authenticated trip data in the public service-worker cache. The snapshot may survive refresh, browser close, and PWA restart. Purge it after completed-trip changes successfully synchronize, on account switch, and on logout. If unsynced changes exist, logout must warn plainly that continuing will delete those local changes and require explicit confirmation. On known authorization loss, delete the key and cache; when the device was offline during revocation, recheck authorization on reconnect and purge before accepting sync or showing refreshed private data. Already decrypted data on an offline device cannot be remotely recalled. Approved 2026-07-31.

### Offline synchronization and device precedence

Bind each active Go session to one Navigator account and one active Navigator device. A device transfer requires authenticated online confirmation; the old device cannot submit later mutations after transfer. Give every offline mutation a unique idempotency key and local sequence number, then replay authorized mutations exactly once in their original order. Server authorization, current Navigator/device assignment, and trip lifecycle/state always win. Reject queued actions that lost authorization or conflict with a completed/reassigned trip, and show a plain sync explanation without exposing other-account data. Apply non-conflicting actions normally. If the same private rating or note changed from the offline base version on another device, preserve both versions and require the author to choose `Keep This Phone's Version` or `Keep Saved Version`; never silently overwrite either. Approved 2026-07-31.

Online shared-draft edits use one monotonically increasing trip version and an idempotency key per mutation. Every reorder, add/remove, time/duration, return, partner, or Navigator mutation names its base version. A stale base is rejected without partial application; the client loads the latest plan, highlights the changed fields/order, and offers `Reapply My Change` or `Keep Latest`. Reapply is a new authorized mutation against the new version. Never last-write-wins, silently merge ordered lists, or expose the other participant's private fields. Approved 2026-07-31.

### Store Portal and publishing states

Store Portal home shows store identity, listing status, hours verification/staleness, `Update Hours`, and `Preview Listing`, with secondary access to Store Info, Photos, Pending Changes, and Access & Help. It excludes analytics, advertising, and shopper data. Every field is labeled `Publishes Immediately` or `Requires Admin Review`; controlled changes preserve the current public value and use Pending, Changes Requested, Approved, or Rejected states. Approved through D23–D24 on 2026-07-30.

### Hours editing

Representatives maintain weekly Open/Closed hours, one range plus an optional second range, dated exceptions, and closure dates. Approved address determines time zone. A 14-day preview and explicit confirmation precede publication; successful publication refreshes verification and offers Undo. Active trips receive updated hours on next sync while completed history remains frozen. Approved as D25 on 2026-07-30.

### Store Updates and Vendor Contributor boundary

Store Representatives may post native Store Updates of New Finds, Sale, Announcement, or Store News. Text publishes directly; any image remains held for Administrator image approval. The latest three appear on Store Details with `See All`. No scraping, feed synchronization, comments, likes, or event system is included. MVP may label store-posted vendor content, but a separate Vendor Contributor role is deferred until pilot demand and authorization testing justify it; if added, it is store/booth-scoped and draft-only. Approved through D26–D27 on 2026-07-30.

### Official images and social links

One cover plus five gallery images are allowed on a Store Profile; a Store Update may contain one image. Every profile-image change requires Administrator approval, and the current image remains live during replacement. Uploads require preview/crop, meaningful alternative text, rights confirmation, quarantine, re-encoding, metadata removal, and review. Copied website/social screenshots and shopper images are prohibited. A verified Representative may directly publish one validated official link for each approved social platform; no credentials, embed, scrape, sync, or imported tracking is allowed. Approved through D24–D25 on 2026-07-30.

### Store Update lifecycle and support

Sales require an end date and auto-archive. Announcements may have an end date; New Finds and Store News archive manually. Archive is reversible and representatives do not permanently delete history. Pilot Support uses categorized tickets, allowlisted diagnostics, at most one previewed/sanitized screenshot, authenticated replies/history, status-only email, urgent security routing, and a verified-identity fallback for sign-in failure. Approved through D26–D27 on 2026-07-30.

### New-store discovery

Authenticated shoppers may see `New Since Your Last Visit` based only on a coarse last-seen timestamp and manually selected area. The in-app card appears in Browse and home/return context, links to the new listings, and may be dismissed. No push/email notification, background location, or behavior tracking is implied. Approved as D28A on 2026-07-30.

### Administrator home and review workspace

Administrator home shows role/environment, urgent safety items, and one grouped `Needs Review` queue ordered urgent-first then oldest. It excludes shopper activity, ratings, trips, traffic, and marketing. The review workspace preserves fixed context, shows current and requested values or image evidence, provides type-specific Approve/Request Changes/Reject actions, requires reasons where applicable, confirms effects, and writes audit records. Administrators cannot directly edit submissions, bulk approve, or silently advance. Approved through D28–D29 on 2026-07-30.

### Access & Safety

Access & Safety separates pending invitations from active Store Representative grants and shows exact scope, verified-email/MFA state, dates, and relevant privileged activity without shopper activity. Revocation requires Administrator MFA, recent authentication, reason, and consequence preview; it removes only the selected store scope and blocks the next server-authorized write, including an open session. Regrant repeats identity and scope gates. No bulk changes, multi-store Representative grants, self-service role changes, or history deletion are allowed. Approved as D30 on 2026-07-30.

### Implementation baseline approved; coding held

Discovery decisions through D30 are sufficient for planning the single-PWA scaffold and synthetic Internal Alpha implementation. Unresolved choices block only the dependent feature or release gate; they do not block unrelated scaffold planning. Real-store outreach, public access, and external participants remain prohibited until their approved readiness gates pass. The earlier 2026-07-30 implementation authorization is superseded by the product owner's 2026-07-31 instruction to finish the plan but not start coding; a separate start instruction is required.

### Bounded first development slice

Keep the full approved PRD and phased roadmap, but do not implement Phases 0–3 as one work package. The first development slice is limited to the React/TypeScript/Vite PWA foundation, reproducible local Supabase schema/migrations/seed containing only Synthetic Stores, anonymous list-first Store Browser and Store Details, the Age-Inclusive Usability Baseline, automated test foundations, and CI. Exclude authentication/private actions, Candidate Link/Share, trip planning/Go/offline, Store Portal, Administrator workflows, public reviews, mapping/provider calls, real stores, external participants, advertising, and deployment to a public audience. Approved 2026-07-31. This is sequencing, not a reduction of the PRD.

### Startup Learning MVP

After the first slice, `SLM-01` is the first private value checkpoint: Packages 1, 2, 3, and 5A with Synthetic Stores. It proves separate Test User A and Agent-Assisted Shopper accounts can complete Browse → Details → Save → manually ordered hours-aware Trip → one-trip Partner/Navigator handoff → external-map Go → private visit memory, including refresh/offline recovery and cross-account denial. Package 4 Candidate Share is a separate branch and does not block this checkpoint. SLM-01 excludes Package 5B routing suggestions, Store Partner/Admin workflows, real stores, external participants, public reviews, public indexing, acquisition, or advertising. Completion authorizes only Product Owner continue/revise/stop disposition; it does not skip any Regional Public MVP package or gate. Approved 2026-08-03.

SLM-01 `continue` additionally requires both accounts to finish without an outside planning document, retain every input through refresh/offline replay, correctly explain hours warnings and the absence of travel-time calculation, pass every cross-account allow/deny result, and show a written comparison with the current completion-time/retyping/tool-switch baseline. The Product Owner must identify at least one reduced burden without material regression in the others and record both testers' return intent. Any privacy/authorization/data-loss failure is `stop`; incomplete flow, warning misunderstanding, or no supported burden improvement is `revise` or `stop`. Approved 2026-08-03.

### Startup free-service and hosting boundary

The startup `$0` infrastructure boundary includes audit anchoring and geocoding as well as the services listed below; failure to find a compliant free L-01/R-01 option disables the dependent remote capability rather than authorizing spend.

Local development, Shared Synthetic Alpha, SLM-01, and Controlled Private Beta must use `$0` recurring infrastructure unless the Product Owner separately approves a paid service. Automatic upgrades and paid overages are prohibited. The rule includes hosting, database/Auth/Storage/functions, email, routing, backups, monitoring/status, scanning, and bandwidth; domain registration, legal/insurance services, and optional printing remain separate approval-controlled costs. A free plan that cannot prove eligibility or the applicable access, security, privacy, deletion, recovery, or abuse requirement blocks that stage; the requirement is not weakened. Vercel prebuilt deployment plus Supabase is selected under ADRs 0006/0005; Vercel replaced Cloudflare for the frontend on 2026-08-20. Regional Public MVP remains blocked until its 15-minute RPO is proven by an approved paid configuration or validated `$0` alternative.

### Product promotion is not monetization

Antique Trail may promote its own Regional Public MVP only after Package 10B signature. Startup has no ad inventory, sponsored listing, paid ranking, affiliate link, lead sale, shopper-data sale, paid claim verification, paid Store Partner tier, ad network, or behavioral targeting. Verification, discovery order, public ratings, and moderation cannot be purchased. Any monetization requires a new Product Decision and is deferred at least through RG-01 and the separately approved first three small-community reviews. Approved 2026-08-03.

Approved unpaid launch channels are opt-in Store Partner counter flyers and ordinary public QR codes, one voluntary Store Partner social post, founder-owned public posts, permission-based antique/community groups, tourism/chamber/community calendars, earned local press/radio/newsletters, organic search, and native sharing of canonical Store Details URLs. No scraped lists, bulk unsolicited email, automated posting, group-rule bypass, or unapproved partnership claim. Scott is the initial Local Acquisition Owner. Package 10A prepares private artifacts and channel-specific consent; Package 10B alone authorizes publication/distribution. Withdrawal stops future distribution and reprinting, requests removal of remaining materials, and removes future logo/co-brand use. Non-partner listings may use verified public facts only and never imply participation. Approved 2026-08-03.

Public promotional QR codes open `/stores?area=topeka-ks`, contain no invitation, bearer, account, authority, location, or user-identifying tracking token, and remain distinct from Partner/readiness QR codes. Privacy-safe source measurement, if enabled at Package 10B, uses only an allowlisted opaque aggregate `src` code and daily aggregate opens, Store Details opens, and share actions: no campaign cookie, device ID, fingerprint, IP-derived identity, user/account linkage, or owner-facing shopper analytics. Daily aggregates delete after 180 days; signed gate-receipt aggregates retain three years. Approved 2026-08-03.

### Correction, claim, and review-delete closure decisions

- **Correction identity:** anyone may draft a correction, but submission requires just-in-time verified account authentication. Cancellation writes nothing. The submitter may read only reason-neutral status for their own report; anonymous writes and internal case detail are denied. Approved 2026-08-03.
- **Claim stage and evidence:** Package 6 builds/tests claims with Synthetic data while `public_listing_claims_enabled=false` through Alpha, Private Beta, and Package 10A. Package 10B alone may enable it after release signature. Two authority signals must use distinct channel classes, evidence objects, and verification events; the same email, phone, document, or contact cannot count twice. Regional Public MVP accepts content-free callback, mailed-code, public-filing, or in-person verification records. User-uploaded claim documents are not accepted; lease/utility evidence may be inspected in person but no copy is retained. Raw digital claim evidence has no approved storage path. Approved 2026-08-03.
- **Claim cardinality:** Regional Public MVP permits one active Store Representative grant per store and one active store scope per Representative. Transfer revokes the old grant before a new one can activate. Multi-representative and multi-store grants require a later Product Decision. Approved 2026-08-03.
- **Review delete:** deletion atomically removes public display and aggregate effect, enters `delete_pending`, and offers an accessible 60-second Undo. After the window, text purge completes within 24 hours subject only to minimum evidence already copied to an active restricted moderation/legal case. Approved 2026-08-03.

### Private shopper-content lifetime

Private saves, trips, trip history, personal ratings, notes, and accepted Trip Ideas remain available while their account owner wants Antique Trail to remember them. They do not expire only because they are old. The owner may delete an individual supported record or delete the account. Temporary invitations, pending Candidate Shares, inactive-account handling, primary-system deletion timing, backup aging, and operational-record retention use separately approved rules. Approved 2026-07-31.

### Private-content deletion and backup aging

Deleting an individual supported private record removes it from the user experience immediately, offers a short Undo, and deletes its primary database row and associated Storage objects within 24 hours. Account deletion immediately revokes access and starts a clearly disclosed seven-day cancellation period; cancellation restores access, otherwise primary database and Storage deletion completes by day 8. Managed recoverable backups containing deleted data must age out within 30 days. A disaster restore must reapply completed deletion requests before normal access resumes. Retain only a content-free opaque deletion receipt long enough to cover the backup window and prove/reapply deletion. Approved 2026-07-31.

### Inactive-account lifecycle

An account becomes inactive after three years without a successful sign-in. Send warnings to its verified email 90, 30, and 7 days before scheduled account deletion. Any successful sign-in cancels the schedule. Measure inactivity only from authentication state; do not use browsing, trip, device-location, or behavioral tracking. Synthetic Internal Alpha accounts are excluded from this timer and reset manually. Approved 2026-07-31.

### Operational-record retention

Retain application/error logs for 30 days; authentication/security events for 90 days; privileged Store Representative and Administrator audit events for two years; support and moderation cases for two years after closure; Pilot Consent Receipts, authority verification, and role-grant history for three years after the relationship ends; rejected or quarantined uploads for 30 days; and content-free deletion receipts for 31 days. Never copy shopper-private content into logs or audit events. At each deadline, securely delete or irreversibly de-identify the record. Legal review may require a longer period before external testing; no shorter period is allowed without product-owner approval. Approved 2026-07-31.

### Recovery objectives

Use staged recovery targets. Internal Alpha permits at most 24 hours of data loss and one business day of outage. Private Beta permits at most four hours of data loss and eight hours of outage. Regional Public MVP permits at most 15 minutes of data loss and four hours of outage. Prove database and Storage recovery separately before passing each corresponding gate; a provider backup claim alone is insufficient. Approved 2026-07-31.

### Break-glass emergency access

Disable break-glass access during Synthetic Internal Alpha. During Private Beta and Regional Public MVP, allow it only for a confirmed security or data-recovery incident, never routine support. Require Administrator MFA, recent authentication, an incident ID, a plain-language reason, and the exact requested data scope. Access is read-only by default and expires after 30 minutes. Require a second Administrator's approval when available; while Scott is the sole Administrator, permit activation only with an independent review within 24 hours. Notify the affected user when safe and legally allowed. Audit every attempt for two years in append-only hash-chained records with the externally anchored chain-root verification defined by the security plan. Prohibit bulk export, role changes, deletion bypass, and access to unrelated data. Approved 2026-07-31; storage wording aligned 2026-08-03.

### Closed lifecycle, portability, usability, and release decisions

- **Inactive-account timing:** use UTC instants. On the first daily job run at or after the third anniversary of the last successful sign-in, schedule deletion for 90 days later and send the 90-day warning; send the remaining warnings at or after 30 and 7 days. A successful sign-in before deletion atomically clears the schedule. Jobs are idempotent by account and milestone; retries do not duplicate deletion requests, and notification failure alerts operations but does not extend retention. At the deletion instant, apply the approved seven-day account-deletion cancellation period, so primary deletion completes by day 98 after scheduling unless cancelled. Leap-day anniversaries use February's last day. Approved 2026-07-31.
- **Completed-trip location:** device/provider traces are never stored. Exact manual/current start and optional return coordinates are removed from primary data within 24 hours after completed-trip synchronization; only a user-entered coarse label, store IDs, chosen order, planned/actual stop states, and user-authored private memory remain. Coordinates are excluded from later exports and age out of backups within 30 days. Approved 2026-07-31.
- **Candidate Share terminal states:** on acceptance, the recipient-owned Trip Idea becomes the independent retained copy. The outbound envelope remains visible only to the sender for 30 days, then its URL and note are deleted; a content-free `Accepted` status may remain for 90 days. Block immediately closes the share, deletes its payload within 24 hours, and retains only a pseudonymous sender-recipient block edge until unblock or account deletion. Report closes the share and copies only opaque party IDs, an HMAC of the normalized destination host, reason, timestamps, and the minimum reported text necessary to evaluate abuse into the moderation case; neither the full URL nor path/query/fragment is retained. The share payload then deletes within 24 hours. Case evidence follows the approved two-year-after-closure rule. Approved 2026-08-03.
- **Invitation terminal states:** raw tokens are never retained. Pending token hashes expire at the stated deadline; expired, cancelled, revoked, malformed, or consumed token hashes delete within 24 hours. Content-free Trip Partner invitation status/actor/time records remain 90 days; an accepted participant record follows the trip lifetime and deletes within 30 days after the trip/account deletion request. Content-free Store Partner invitation history follows the three-years-after-relationship rule. Backups age deleted token hashes/payloads out within 30 days; exports include only the requesting user's visible status metadata, never tokens or verification evidence. Approved 2026-07-31.
- **Participant exit:** a recipient can unblock a sender from privacy controls. An accepted Trip Partner can leave immediately; access ends on the next request, offline authorization fails on reconnect, and Go pauses if that partner was Navigator until the remaining creator assigns a Navigator. The creator may remove the partner under the same rule. Approved 2026-07-31.
- **Freshness:** track identity/location, contact, hours, categories/attributes, and media/social provenance independently. Listing-level freshness is the oldest required core fact group among identity/location, contact, hours, and categories/attributes; optional media/social does not stale the listing. Editing one group refreshes only that group. At day 181 show overdue and exclude the listing from hours-dependent route promises; after day 365 hide normal discovery until every required core group is reverified. Approved 2026-07-31.
- **Duplicate merge:** Administrator-only, MFA/recent-auth, previewed, and audited. Choose one canonical store; in one transaction reparent allowed public references, saves, trip stops, review identities, provenance, and nonconflicting approved media without changing private authorship or visibility. Never reparent active authority. Duplicate saves collapse to the earliest. Same-user memory collisions preserve one active canonical record plus an own-only conflict copy for explicit user choice. Same-author active-review collisions keep the canonical review active, hide the other from public/aggregate, and require explicit author choice; trip-stop duplicates preserve both with a private warning and count once for readiness. Record every collision state/aggregate delta in the merge ledger. Quarantine/revoke noncanonical claims/grants; replacement scope requires normal reverification/new grant. Rollback restores original IDs/states/aggregates but never silently reactivates access. Approved 2026-07-31.
- **Account scope:** Regional Public MVP is United States only. Anonymous browsing has no age gate; account creation, public reviewing, Store Partner participation, and trip sharing require age 18 or older until legal review approves broader participation. Approved 2026-07-31.
- **Authentication:** Supabase Auth owns credentials. Regional Public MVP uses verified email plus a 12–128-character password, single-use 30-minute verification and recovery links under the provider's shared email-link expiry, 15-minute access tokens, rotating refresh sessions expiring after 30 days of inactivity, refresh-reuse revocation, and enumeration-resistant/rate-limited account flows. Password recovery and account deletion revoke all sessions. Administrator and Representative roles require TOTP MFA and 10-minute password+MFA recent authentication; shoppers may enable MFA. Approved 2026-07-31.
- **Trip duration and Check My Day:** one trip has at most eight active store/rest stops. Default dwell is the verified store estimate or 60 minutes; presets are 30/45/60/90, and Custom accepts whole minutes from 5 through 720. Optional maximum drive is 1–500 miles and optional maximum total duration is 30–1,440 minutes. Stop priority is `Must`, `Prefer`, or `Flexible`; `Must` is the required-stop value. Package 5B uses the accepted provider's start/stop/optional-return distance/time matrix, exhaustively evaluates all orders, permits waiting before opening, and adds a 10-minute transition buffer. It selects by: routes satisfying every set maximum; most `Must` stores completed by closing; most on-time priority points (`Must=3`, `Prefer=2`, `Flexible=1`); most stores completed by closing; least summed proportional excess over unmet maximums; least late minutes; least travel minutes; most original adjacent pairs; then stable stop-ID sequence. Departure-to-first and last-to-return legs affect arrivals, distance, duration, limits, estimated finish, and scoring; rest stops are always-available private waypoints. The algorithm never drops a stop, auto-applies, or claims real-world optimality. Only provider selection remains ADR-gated. Approved 2026-07-31.
- **Account-deletion cancellation and recent authentication:** cancelling within seven days restores ordinary account/private-data access but never silently restores Administrator or Store Representative grants; those require the normal audited identity/authority/regrant path. Before scheduling deletion or issuing/regenerating an export download URL, the server requires shopper password authentication within 10 minutes and the shopper's MFA when enrolled. Approved 2026-07-31.
- **Portability:** shopper export is a ZIP containing canonical UTF-8 JSON, convenience CSV tables, and user-owned media files with a manifest; it excludes secrets, other users' private data, purged precise coordinates, moderation evidence, and internal verification data. D31 privileged-audit export remains unresolved and separate. Approved 2026-07-31.
- **Browser/device baseline:** test latest and previous major Chrome, Edge, Firefox, and Safari desktop; current and previous iOS Safari; current Chrome Android; 320px through 1280px+ responsive widths; keyboard; NVDA with Firefox/Chrome on Windows; and VoiceOver with Safari on iOS/macOS. Run each critical Browse-to-Plan and Go/handoff synthetic journey ten times in every applicable browser/device matrix cell. A public gate requires zero Blocking Defects, no repeatable journey failure, and at least 99% successful executions across that recorded repeated release suite. Approved 2026-07-31.
- **Older-adult cohort:** before public release, at least eight participants age 55+, including at least three age 70+ and at least two who use low-vision, motor, or assistive-technology adaptations, attempt Browse, Details, Add/Create Trip, Check My Day, Go/handoff, and private visit memory on their own device. At least 90% of required tasks must complete without moderator intervention, zero participant may encounter a safety/privacy/authorization failure, the group average is no more than one noncritical task error per participant, and every repeated critical failure must be fixed and retested. Approved 2026-07-31.
- **External support:** before first owner contact, publish one monitored support address/form and one security contact. During Private Beta acknowledge security/privacy reports within four clock hours and other tickets within two business days; during Regional Public MVP acknowledge security/privacy reports within four clock hours and other tickets within one business day. Publish planned/unplanned incident status in the PWA and status channel; name the on-call owner and backup in the release runbook. Approved 2026-07-31.
- **Metric gate RG-01:** D30 remains Access & Safety. The Topeka-to-community expansion scorecard is `RG-01`, not a product-decision number. Formulas and eligibility rules in `PRD.md` are approved. Targets are 100% current verification coverage, zero Blocking Defects, at least 25 eligible Topeka shoppers completing a first qualifying trip, at least 10 completing a second qualifying trip on a later date, at least three active consented flyer locations, and support load no greater than one new case per active store plus one per ten completed trips during the evidence window. Each human counts once through one nonprivileged shopper account; Scott, the Independent Internal Tester, AI/Synthetic/test operators, duplicate accounts, and own-store Representative activity are excluded. Use a rolling 180-day maximum evidence window but no minimum elapsed duration; the gate passes as soon as all denominators and targets are met with dated evidence. Claim conversion is reported, not pass/fail, during first regional launch. Approved 2026-07-31.

### Public review and scalable claim policy

- **Review eligibility:** Regional Public MVP accounts are verified-email, age-attested 18+, and rate-limited. A user may review after an Antique Trail trip marks that store `Done Here`, or after a manual `I visited` attestation that displays the honesty/conflict rules. One active review per user/store; rating is integer 1–5 with optional text. A new or edited review enters automated validation and may remain pending moderation. Approved 2026-07-31.
- **Display and aggregate:** publish rating, allowed text, author-chosen public display name, visit month/year, edit marker, and disclosed conflict only. Never publish email, exact visit time, trip, note, location, or account history. Aggregate is the arithmetic mean and count of active eligible ratings, updated transactionally with review state; show from the first eligible rating and label the count. No weighting, paid boost, owner override, or hidden personalized score changes the public aggregate. Approved 2026-07-31.
- **Conflicts:** the author must disclose current/recent employment, ownership, family, vendor, or compensated connection to the reviewed store. A currently scoped Store Representative cannot review that same store. Disclosed reviews remain visibly labeled and excluded from the aggregate; undisclosed material conflicts may be removed. Approved 2026-07-31.
- **Moderation:** reject or remove spam/duplicates, threats, harassment/hate, personal or sensitive information, illegal content, impersonation, undisclosed material conflict, compensated manipulation, irrelevant content, and claims that cannot safely remain while a legal/safety review is open. Do not remove a review merely because it is negative. At initial launch, an MFA/recent-auth Administrator may perform only the case-scoped `Hold`, `Remove`, `Restore`, and `Dismiss Report` transitions with a reason; every transition is append-only audited and evidence is minimized. A separately staffed Moderator role remains deferred until volume requires it. Store Representatives may report but cannot edit, suppress, answer, or identify reviewers. Owner responses remain deferred. Approved 2026-07-31.
- **Edit/delete/report:** author edits preserve internal version history and recompute aggregate atomically. Author deletion immediately removes public/aggregate effect, offers author-only accessible Undo for 60 seconds, then irreversibly finalizes and deletes current/historical text within 24 hours unless an open moderation/legal case already holds minimum copied evidence. Retain only content-free review/version/audit metadata after purge. Reports are rate-limited, reason-coded, non-public, and reveal no reporter identity to the store. Cases retain minimum evidence two years after closure. Updated 2026-08-03.
- **Appeal:** the author or scoped Store Representative may appeal a moderation result once within 30 days. The appeal states the challenged rule and new evidence. A different Administrator reviews when available; with one Administrator, an independent qualified reviewer signs the decision. Target decision is 14 business days. Restore recomputes aggregate; uphold supplies a plain rule-based reason. Appeal records follow the moderation-case retention. Approved 2026-07-31.
- **Review effect of account deletion:** scheduling account deletion immediately hides every active or pending authored review and removes its aggregate effect in the same transaction. During the seven-day cancellation window, the content remains private and inaccessible except to the cancellation workflow or a live restricted moderation/legal case. A successful cancellation restores the prior published/pending state only if the review remains eligible and is not held/removed. On day 8, delete the public display name and all current/historical review text; retain only content-free version/audit metadata, or the minimum evidence already copied into a live restricted case. Approved 2026-07-31.
- **Scalable claim verification:** after the three-store pilot, continue manual risk-tiered verification. Require verified email, MFA, exact store scope, and two independent authority signals from different channel classes: one claimant-controlled business-domain/published-contact response plus one of in-person inspection, published phone callback, business filing, or mailed code. Lease/utility evidence may be viewed in person but no copy is stored; user-uploaded claim documents are unavailable. High-risk conflicts, ownership transfers, closures, or duplicate claims require Administrator review and no silent auto-approval. Reverify authority annually and on risk signal; revoke exact scope immediately when authority ends. Approved 2026-08-03.

## Remaining deferred or provider-gated decisions

1. Final product name and B-01 signed brand/domain consistency receipt
2. Exact Small-Community Expansion community choices
3. Route provider for Package 5B; the exact suggestion algorithm is approved above and Package 5A remains provider-free/manual-order
4. Monetization after RG-01 and the three-community review; until a new Product Decision, all paid placement, data-sale, and ad products remain prohibited
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
