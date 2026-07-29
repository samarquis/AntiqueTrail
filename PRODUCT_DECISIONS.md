# Product Decisions

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

### Listing freshness and stale behavior

A listing remains verified for 180 days after Store Partner confirmation or manual source verification. A correction or closure report triggers immediate review. From day 181 through day 365, label the listing `Verification overdue`, keep it searchable with a warning, and exclude it from Open Now and automatic trip ordering. After day 365, hide it from normal discovery until reverified. Never automatically delete the listing or its provenance. Successful reverification resets the clock.

### Trip app owns the itinerary

Navigation providers handle only the current leg.

### Routing location privacy

Antique Trail may send only the coordinates necessary for a user-requested route to a named routing provider disclosed in the privacy notice. Device location requires explicit while-in-use permission; users may instead enter a start location manually. Directory browsing and manual trip planning work without device-location permission. Do not collect background or continuous location, raw movement history, or precise coordinates in analytics, application logs, email, or support records. Saved trip locations remain private to their shopper. Completed-trip location data follows a separately approved retention policy.

### Professional and commercial standard

The application must be secure, maintainable, moderated, monitored, and polished enough to advertise through printed flyers in participating stores.

### Security is launch-blocking

Security, privacy, moderation, backups, logs, incident response, and authorization testing are required before launch.

### Regional launch

Start with one strong region and verified store data rather than a sparse national launch.

### Staged release gates

Launch first as a controlled-access Private Beta without public user-generated content. After directory, trip planning, moderation, and abuse controls are proven, launch a Regional Public MVP with text-only public ratings and reviews.

### Regional Public MVP boundary

The Regional Public MVP requires completed Implementation Phases 0–3: product/security foundation, public directory and private account basics, text-only public reviews and verified store-claim workflows, and the trip planner. Phase 6 supplies security, privacy, legal, recovery, accessibility, operations, and launch-readiness gates; it is a release gate rather than another feature bundle. Defer Phase 4 finds/households, Phase 5 preference onboarding/personalization, public photos, and owner review responses until after the Regional Public MVP.

### In-person store-partner pilot

Choose a Pilot Area where direct shop-owner outreach is practical before public advertising. A candidate shop is a Prospective Store Partner until an authorized owner or manager explicitly agrees to participate; that person may then join the Private Beta as a Beta Tester. Do not imply a partnership before consent.

### Topeka Private Beta Pilot Area

Use Topeka city limits as the future Private Beta Pilot Area. Store outreach, partner claims, and real-location import remain deferred until a separate pre-pilot readiness gate is defined and passed.

### Internal Alpha before external participation

Run an Internal Alpha before adding real stores or contacting any owner or public entity. It begins with a Solo Agent-Assisted Alpha: Scott, as Primary Internal Tester, operates all separate role accounts and may supervise AI Test Agents. It ends with Two-Person Acceptance: Scott's wife, as Independent Internal Tester, performs shopper acceptance using her own account and phone. AI evidence cannot substitute for her independent acceptance or approve a release gate. Test with Synthetic Stores only. Synthetic records may represent store types and owner workflows, but must not use real names, logos, photos, reviews, or imply affiliation.

### Separate Internal Alpha accounts

Every role uses a separate Test Account. During Solo Agent-Assisted Alpha, the Primary Internal Tester operates Test User A and may use a separate Agent-Assisted Shopper Account for user-two simulation while preserving separate sessions, ownership, and visibility. During Two-Person Acceptance, the Independent Internal Tester uses a newly created Test User B account on her own phone; the solo-stage account is never reassigned to her. Test User A and Test User B may intentionally perform identical actions or enter duplicate values, but neither can read or change the other's private data. Household sharing remains disabled during this isolation test.

### Representative Test Account

Internal Alpha includes a separate Representative Test Account scoped to one Synthetic Store and operated by the Primary Internal Tester. It is never shared with shopper sessions. The Independent Internal Tester is not required to use it. It cannot access shopper saves, personal ratings, notes, trips, or other private records.

### Store Representative publishing split

Store Representatives may directly publish regular hours, holiday hours, phone, website, official description, and temporary closure for their assigned store. Name, address or coordinates, ownership, permanent closure, category tags, and public photos require an approved Store Change Request. Store Representatives never edit reviews or access shopper-private data. See `docs/adr/0001-split-store-representative-publishing-by-field-risk.md`.

### Administrator approval during Internal Alpha and Private Beta

Use a fourth, separate Administrator Test Account to approve or reject Store Change Requests, grant or revoke representative roles, and inspect audit records. It uses a separate session with MFA and cannot access shopper-private data. Defer a Moderator role until review volume requires one.

### Internal Alpha feature boundary

Internal Alpha includes four-role authentication; Synthetic Store directory, search, map, details, and hours; private saves, personal ratings, and notes; hours-aware trip planning; active-trip navigation handoff; offline recovery; Store Representative and Administrator workflows; and audit records. It excludes public reviews and photos, households, finds and collections, events, notifications, owner analytics, advanced personalization, and real stores.

### Internal Alpha shopper-trip exit gate

The Primary Internal Tester using Test User A and the Independent Internal Tester using Test User B must each complete three successful Shopper Trip Acceptance Runs on separate phones and accounts. For each account, at least one run must prove active-trip recovery after refresh or app restart and while offline. Across the runs, the tester must exercise navigation handoff, arrived/completed/skipped/closed stop states, and route recalculation. AI-assisted or Primary Internal Tester runs against Test User B are supplemental and do not replace the Independent Internal Tester's three runs. The gate requires zero Blocking Defects and zero cross-account exposure or modification of shopper-private data.

### Internal Alpha privileged-workflow exit gate

The Primary Internal Tester must operate two complete Privileged Workflow Acceptance Cycles using the separate Representative Test Account and MFA-protected Administrator Test Account; the Independent Internal Tester is not required to operate privileged accounts. Across each cycle, every Representative-Managed Field must publish directly; at least one Store Change Request must be approved and one rejected; unapproved Controlled Store Fields must remain unpublished; representative self-approval must fail; revocation must block further writes from the representative's existing session; and all privileged actions must have audit records. Both privileged accounts must remain unable to read or modify Test User A or Test User B shopper-private data. The gate requires zero Blocking Defects; every allowed action must succeed and every forbidden action must be denied.

### No store-owner participation before readiness

Do not contact or include a store owner, import a real store, or add any external participant until Solo Agent-Assisted Alpha and Two-Person Acceptance pass and a separate External Testing Readiness gate is defined and passed. After that gate passes, invite one consenting Store Partner representative into the controlled, invitation-only Private Beta to test the real owner workflow before public access. The gate does not authorize public advertising.

### External Testing Readiness gate

Before first-owner contact, require dated passing evidence approved by the Primary Internal Tester for all seven checks: both Internal Alpha stages; the complete authorization and security test set; zero open Blocking Defects or known privacy, security, or data-loss defects; successful backup-restore and rollback rehearsals; working pilot-environment monitoring, error reporting, and support intake; legally reviewed final pilot privacy notice and owner-consent wording; and one successful External Testing Dress Rehearsal. A failed check blocks outreach. AI Test Agents may collect evidence but cannot approve the gate.

### First Store Partner onboarding

Demonstrate the product using Synthetic Stores only. Before creating a real store record or representative account, obtain Store Partner Pilot Consent and verify the representative's authority both in person and through a published business contact. The representative must use an owner-controlled verified email and MFA; shared credentials are prohibited. Consent states that the pilot is voluntary, invitation-only, unpaid, non-endorsing, and not public advertising. On withdrawal, revoke representative access and remove the real store from the active pilot. Audit onboarding, scope grants, withdrawal, and revocation.

### First Pilot Store Record

After consent and authority verification, atomic Administrator approval of the owner-submitted Pilot Store Draft creates one Pilot Store Record using owner-confirmed name, address, phone, website, regular and holiday hours, official description, and category tags. Record the source/provenance and verification date. The Store Representative then tests only the already-approved Representative-Managed Field workflow; Controlled Store Fields still require Store Change Requests. Restrict the record to invited Private Beta participants. Exclude photos, ratings/reviews, events, owner responses, and analytics.

### Initial Private Beta Cohort

Limit the Initial Private Beta Cohort to four human accounts and one Pilot Store Record: Scott's separate shopper and Administrator accounts, Scott's wife's separate shopper account, and the first owner's Store Representative account. The owner does not use the representative account for shopper activity; any future shopper testing requires a separately approved account. AI and Agent-Assisted Test Accounts remain restricted to Synthetic Store data. Do not add another user or real store until a separate expansion gate passes.

### Initial Private Beta Expansion Gate

Before adding any user or real store, require dated evidence approved by the Primary Internal Tester that: the owner completed Representative-Managed Field edits, submitted two Store Change Requests that the Administrator approved and rejected respectively, used MFA, and participated in a scheduled revoke/regrant test; Scott and the Independent Internal Tester each completed two shopper trip runs containing the Pilot Store Record; support and feedback intake worked; privileged audit records were complete; monitoring, backup restore, and rollback checks remained passing; no Blocking Defect or known privacy, security, or data-loss defect remained open; and the owner confirmed that the workflow was understandable. No minimum calendar duration applies. A failed check blocks expansion.

### Controlled Private Beta Expansion

After the Initial Private Beta Expansion Gate passes, add one Store Partner and one Pilot Store Record at a time. Apply the same consent, authority verification, account onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks to each addition before adding the next. Cap the controlled Private Beta at three total Store Partners and stores. Keep it invitation-only with no public advertising. After all three pass, stop expansion and conduct a separate public-readiness review; passing the pilot does not automatically authorize public access.

### Regional growth sequence

Use Topeka city limits for the first Regional Public MVP. After Topeka succeeds, run a Small-Community Expansion that recruits nearby local antique and vintage shops one community at a time to build store and shopper traction. An Eligible Small Community is outside a larger metro, roughly within a 60-minute drive of Topeka, has at least two antique or vintage shops, and has at least one willing anchor Store Partner before activation. Add and validate one community at a time under the Community Expansion Gate. Stop after three communities and conduct a separate larger-metro readiness review before considering Kansas City or another larger metro. Exact communities remain unresolved.

### Community Expansion Gate

Before activating another small community, require dated Primary Internal Tester approval that the current community has: at least two verified active shop listings; one anchor Store Partner who completed onboarding, one direct edit, one controlled change, and one support request; separate-phone/account multi-stop trip runs completed by Scott and the Independent Internal Tester; voluntary trip-use confirmation from five additional shoppers without requiring precise-location tracking; passing monitoring, support, and store-data accuracy checks; and zero open Blocking Defects or known privacy, security, or data-loss defects. No minimum calendar duration applies. A failed or incomplete check blocks the next community.

### In-person Store Partner QR invitation

After a Synthetic Store demonstration and verbal interest, the recently authenticated MFA-protected Administrator creates a Store Partner Invitation and displays its QR code. The QR contains only an opaque random token, expires after 30 minutes or one successful redemption, and contains no owner, store, email, or role data. Scanning opens the same PWA's partner-onboarding page; it does not install the PWA or grant access. The owner reviews the pilot privacy notice and terms, gives Store Partner Pilot Consent, creates an owner-controlled Pending Partner Identity, verifies email, and configures MFA. The invitation remains pending until the Administrator independently verifies authority through the published business contact and approves it. Only then may the system create the Pilot Store Record and grant the store-scoped Store Representative role. Installation instructions appear after approved sign-in. Expiry, redemption, consent, verification, approval, role grant, and installation handoff are audited. See ADR 0002.

### Store Partner pilot-consent capture

Use a phone-friendly consent screen with a plain-language summary and links to the full, legally reviewed pilot privacy notice and terms. Require separate acknowledgments of authority, voluntary participation, permitted store-data use, no payment or endorsement, and withdrawal. Require typed name, business title, and store name; bind the immutable Pilot Consent Receipt to the verified email, timestamp, invitation identifier, and policy version. Email the owner a receipt/PDF copy without internal verification evidence. Administrators may view but never edit submitted consent. A material term change requires fresh consent before continued participation.

### Pilot Store Draft review and approval

After consent, verified email, and MFA, the Pending Partner Identity enters the owner-confirmed core listing fields into a Pilot Store Draft. Only that identity and Administrators may read it. The owner may edit while draft or changes-requested and submits it for review. The Administrator verifies the submission against the published business contact and may approve it or return comments, but may not silently edit owner-submitted values. The owner corrects and resubmits. Approval requires MFA, recent authentication, and an exact final preview. One atomic transaction freezes the approved draft snapshot and provenance, creates the Pilot Store Record, and grants only its store-scoped Store Representative role; any failure creates neither record nor grant. Preserve comments and all state transitions in the audit history. See ADR 0003.

### Representative activation and first login

After successful approval, send a status-only email containing the normal PWA sign-in link; never send a reusable invitation, magic role, or authorization token. The owner signs in using the already verified email and MFA. The portal shows the exact approved Pilot Store Record, store-scoped Representative permissions, Pilot Consent Receipt, and approval history, then offers device-appropriate PWA installation instructions. Start a guided checklist: confirm the listing, review hours, make one Representative-Managed Field edit, submit one Store Change Request, and use pilot support. Changes-requested or rejected emails contain status only; comments and store data require authenticated portal access. Audit email delivery, first approved sign-in, installation handoff, and checklist progress. See ADR 0002.

### Store Partner Pilot Support

Provide an in-app Pilot Support Ticket workflow with categories for bug, confusing workflow, store-data correction, feature idea, and security/privacy concern. Automatically attach only store/account identifiers, app version, timestamp, and basic device/browser details; never attach tokens, shopper data, precise location, or internal logs. Allow an optional screenshot only after owner preview. The submitting Store Representative and Administrators may read the ticket, replies, and status in the authenticated portal. Email contains status only. Security/privacy concerns trigger an urgent Administrator alert. A fallback support email accepts sign-in-failure reports but exposes no pilot data until identity is verified. The owner may confirm resolution or reopen the ticket.

## Unresolved decisions

1. Final product name
2. Exact Small-Community Expansion community choices
3. Mapping provider
4. Route-optimization provider or custom algorithm
5. Scalable business-verification methods after the first Store Partner pilot
6. Monetization model
7. Free versus paid store-owner features
8. Analytics provider
9. Email and transactional notification provider
10. Image moderation provider
11. Hosting platform
12. Legal entity and insurance requirements
13. Minimum age
14. Whether the service launches only in the United States
15. Data retention periods
16. Review appeal policy
17. Public photo approval workflow after Regional Public MVP
18. Store-event model
19. Accessibility information source
20. Export formats and portability
