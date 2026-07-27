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

### Directory data may be seeded

The initial database may include public records for known stores. Seed data must not include private notes, private rankings, private photos, or household-specific opinions.

### Trip app owns the itinerary

Navigation providers handle only the current leg.

### Professional and commercial standard

The application must be secure, maintainable, moderated, monitored, and polished enough to advertise through printed flyers in participating stores.

### Security is launch-blocking

Security, privacy, moderation, backups, logs, incident response, and authorization testing are required before launch.

### Regional launch

Start with one strong region and verified store data rather than a sparse national launch.

### Staged release gates

Launch first as a controlled-access Private Beta without public user-generated content. After directory, trip planning, moderation, and abuse controls are proven, launch a Regional Public MVP with text-only public ratings and reviews.

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

After consent and authority verification, an Administrator creates one Pilot Store Record using owner-confirmed name, address, phone, website, regular and holiday hours, official description, and category tags. Record the source/provenance and verification date. The Store Representative then tests only the already-approved Representative-Managed Field workflow; Controlled Store Fields still require Store Change Requests. Restrict the record to invited Private Beta participants. Exclude photos, ratings/reviews, events, owner responses, and analytics.

### Initial Private Beta Cohort

Limit the Initial Private Beta Cohort to four human accounts and one Pilot Store Record: Scott's separate shopper and Administrator accounts, Scott's wife's separate shopper account, and the first owner's Store Representative account. The owner does not use the representative account for shopper activity; any future shopper testing requires a separately approved account. AI and Agent-Assisted Test Accounts remain restricted to Synthetic Store data. Do not add another user or real store until a separate expansion gate passes.

### Initial Private Beta Expansion Gate

Before adding any user or real store, require dated evidence approved by the Primary Internal Tester that: the owner completed Representative-Managed Field edits, submitted two Store Change Requests that the Administrator approved and rejected respectively, used MFA, and participated in a scheduled revoke/regrant test; Scott and the Independent Internal Tester each completed two shopper trip runs containing the Pilot Store Record; support and feedback intake worked; privileged audit records were complete; monitoring, backup restore, and rollback checks remained passing; no Blocking Defect or known privacy, security, or data-loss defect remained open; and the owner confirmed that the workflow was understandable. No minimum calendar duration applies. A failed check blocks expansion.

### Controlled Private Beta Expansion

After the Initial Private Beta Expansion Gate passes, add one Store Partner and one Pilot Store Record at a time. Apply the same consent, authority verification, account onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks to each addition before adding the next. Cap the controlled Private Beta at three total Store Partners and stores. Keep it invitation-only with no public advertising. After all three pass, stop expansion and conduct a separate public-readiness review; passing the pilot does not automatically authorize public access.

### In-person Store Partner QR invitation

After a Synthetic Store demonstration and verbal interest, the recently authenticated MFA-protected Administrator creates a Store Partner Invitation and displays its QR code. The QR contains only an opaque random token, expires after 30 minutes or one successful redemption, and contains no owner, store, email, or role data. Scanning opens the same PWA's partner-onboarding page; it does not install the PWA or grant access. The owner reviews the pilot privacy notice and terms, gives Store Partner Pilot Consent, creates an owner-controlled Pending Partner Identity, verifies email, and configures MFA. The invitation remains pending until the Administrator independently verifies authority through the published business contact and approves it. Only then may the system create the Pilot Store Record and grant the store-scoped Store Representative role. Installation instructions appear after approved sign-in. Expiry, redemption, consent, verification, approval, role grant, and installation handoff are audited. See ADR 0002.

### Store Partner pilot-consent capture

Use a phone-friendly consent screen with a plain-language summary and links to the full, legally reviewed pilot privacy notice and terms. Require separate acknowledgments of authority, voluntary participation, permitted store-data use, no payment or endorsement, and withdrawal. Require typed name, business title, and store name; bind the immutable Pilot Consent Receipt to the verified email, timestamp, invitation identifier, and policy version. Email the owner a receipt/PDF copy without internal verification evidence. Administrators may view but never edit submitted consent. A material term change requires fresh consent before continued participation.

## Unresolved decisions

1. Final product name
2. Exact launch region
3. Mapping provider
4. Route-optimization provider or custom algorithm
5. Store discovery source
6. Whether Google Places data may be stored and displayed under provider terms
7. Scalable business-verification methods after the first Store Partner pilot
8. Whether household sharing belongs in MVP
9. Whether find capture belongs in MVP
10. Monetization model
11. Free versus paid store-owner features
12. Analytics provider
13. Email and transactional notification provider
14. Image moderation provider
15. Hosting platform
16. Legal entity and insurance requirements
17. Minimum age
18. Whether the service launches only in the United States
19. Data retention periods
20. Review appeal policy
21. Public photo approval workflow
22. Store-event model
23. Accessibility information source
24. Export formats and portability
