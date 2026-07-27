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
