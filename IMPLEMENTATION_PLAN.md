# Implementation Plan

## Phase 0 — Product and security foundation

Deliverables:

- Finalized PRD
- Product name exploration
- Data classification
- Threat model
- Authorization matrix
- Privacy model
- Review and moderation policy
- Business-claim policy
- Architecture proposal
- Architecture Decision Records
- Repository standards
- CI/CD design
- Cost estimate
- Regional launch definition

Exit criteria:

- No unresolved contradiction in public/private data behavior
- Every role has documented permissions
- Every sensitive data class has a retention and deletion plan
- Mapping and store-data legal constraints are understood

## Phase 1 — Public directory foundation

Features:

- Responsive app shell
- Public store listing
- Search
- Map
- Store profile
- Hours
- Categories
- Last-verified information
- Report incorrect information
- Seed import
- Authentication
- Private saved stores
- Personal ratings
- Basic preference onboarding

Security:

- RLS
- Storage policies
- Rate limiting
- Secure session handling
- Audit framework
- Environment separation

Exit criteria:

- User A cannot access User B data
- Public browsing works without an account
- Saved stores remain private
- Seed data has provenance and verification fields

## Phase 2 — Public reviews and store claims

Features:

- Public star rating
- Reviews
- Review editing
- Reporting
- Moderation queue
- Store responses
- Claim listing
- Verification workflow
- Owner-managed hours and public details
- Public photos

Security and trust:

- Review abuse controls
- Role assignment server-side
- Claim verification
- Photo processing
- Moderation audit logs
- Appeals

Exit criteria:

- Store owner cannot alter user reviews
- Client cannot approve or publish restricted content directly
- Rating aggregation cannot be manipulated by client writes

## Phase 3 — Trip planner

Features:

- Add stops
- Departure time
- Return destination
- Browse-duration estimates
- Priority stops
- Hours-aware ordering
- Schedule warnings
- Active trip
- Arrival/completed/skipped states
- Recalculation
- Waze handoff
- Google Maps handoff
- Offline active trip
- Trip history

Exit criteria:

- Correct next-stop handoff
- Offline trip recovery
- Schedule warnings tested across time zones and daylight-saving changes
- No hidden background tracking

## Phase 4 — Personal finds and households

Features:

- Find capture
- Photos
- Price
- Measurements
- Votes
- Shared household trips
- Shared lists
- Private collection
- Export

Security:

- Explicit sharing only
- Immediate revocation
- Private image URLs
- EXIF stripping
- Household authorization tests

## Phase 5 — Personalization

Features:

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

## Phase 6 — Regional launch

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

## Suggested repository structure

```text
/
├─ apps/
│  ├─ web/
│  └─ admin/
├─ packages/
│  ├─ ui/
│  ├─ domain/
│  ├─ validation/
│  ├─ routing/
│  ├─ auth/
│  └─ config/
├─ supabase/
│  ├─ migrations/
│  ├─ functions/
│  ├─ tests/
│  └─ seed/
├─ docs/
│  ├─ adr/
│  ├─ product/
│  ├─ security/
│  ├─ operations/
│  └─ research/
├─ tests/
│  ├─ integration/
│  ├─ authorization/
│  └─ e2e/
├─ .github/
│  └─ workflows/
└─ README.md
```

This is a proposal, not a final decision.

## Initial backlog themes

1. Product naming
2. Store schema
3. Authentication
4. Public/private data separation
5. Store search
6. Map
7. Hours
8. Reviews
9. Moderation
10. Claims
11. Trip planner
12. Navigation handoff
13. Offline PWA
14. Finds
15. Households
16. Collection
17. Personalization
18. Analytics
19. Support
20. Launch operations
