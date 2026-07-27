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

Run an Internal Alpha with two designated Internal Testers on personally controlled phones before adding real stores or contacting any owner or public entity. Test with Synthetic Stores only. Synthetic records may represent store types and owner workflows, but must not use real names, logos, photos, reviews, or imply affiliation.

### Separate Internal Alpha accounts

Each Internal Tester uses a separate Test Account. Test User A and Test User B may intentionally perform identical actions or enter duplicate values, but each account owns separate records and cannot read or change the other's private data. Household sharing remains disabled during this isolation test.

### Representative Test Account

Internal Alpha includes a third, separate Representative Test Account scoped to one Synthetic Store. Either Internal Tester may operate it, but it is never shared with Test User A or Test User B sessions. It cannot access shopper saves, personal ratings, notes, trips, or other private records.

### Store Representative publishing split

Store Representatives may directly publish regular hours, holiday hours, phone, website, official description, and temporary closure for their assigned store. Name, address or coordinates, ownership, permanent closure, category tags, and public photos require an approved Store Change Request. Store Representatives never edit reviews or access shopper-private data. See `docs/adr/0001-split-store-representative-publishing-by-field-risk.md`.

### Administrator approval during Internal Alpha and Private Beta

Use a fourth, separate Administrator Test Account to approve or reject Store Change Requests, grant or revoke representative roles, and inspect audit records. It uses a separate session with MFA and cannot access shopper-private data. Defer a Moderator role until review volume requires one.

### Internal Alpha feature boundary

Internal Alpha includes four-role authentication; Synthetic Store directory, search, map, details, and hours; private saves, personal ratings, and notes; hours-aware trip planning; active-trip navigation handoff; offline recovery; Store Representative and Administrator workflows; and audit records. It excludes public reviews and photos, households, finds and collections, events, notifications, owner analytics, advanced personalization, and real stores.

### Internal Alpha shopper-trip exit gate

Test User A and Test User B must each complete three successful Shopper Trip Acceptance Runs using separate accounts on separate phones. For each account, at least one run must prove active-trip recovery after refresh or app restart and while offline. Across the runs, the tester must exercise navigation handoff, arrived/completed/skipped/closed stop states, and route recalculation. The gate requires zero Blocking Defects and zero cross-account exposure or modification of shopper-private data.

### Internal Alpha privileged-workflow exit gate

Each Internal Tester must operate one complete Privileged Workflow Acceptance Cycle using the separate Representative Test Account and MFA-protected Administrator Test Account. Across each cycle, every Representative-Managed Field must publish directly; at least one Store Change Request must be approved and one rejected; unapproved Controlled Store Fields must remain unpublished; representative self-approval must fail; revocation must block further writes from the representative's existing session; and all privileged actions must have audit records. Both privileged accounts must remain unable to read or modify Test User A or Test User B shopper-private data. The gate requires zero Blocking Defects; every allowed action must succeed and every forbidden action must be denied.

## Unresolved decisions

1. Final product name
2. Exact launch region
3. Mapping provider
4. Route-optimization provider or custom algorithm
5. Store discovery source
6. Whether Google Places data may be stored and displayed under provider terms
7. Business verification methods
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
