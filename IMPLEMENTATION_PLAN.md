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

## Internal Alpha gate

Assemble and test this gate before public reviews, real-store import, or owner outreach.

Stages:

- Solo Agent-Assisted Alpha: Primary Internal Tester operates all separate roles; supervised AI Test Agents may execute repeatable tests but cannot replace human acceptance or approve a gate
- Two-Person Acceptance: Independent Internal Tester performs shopper acceptance using a newly created Test User B account on her own phone; no solo-stage account is reassigned to her
- External Testing Readiness: separately defined gate required after both internal stages; passing permits one consenting Store Partner representative and one real store in controlled Private Beta, but not public access or advertising

Required:

- Phase 1 directory/authentication/private-data foundation using Synthetic Stores only
- Hours-aware trip planning, active-trip navigation handoff, and offline recovery
- Test User A, Test User B, Representative Test Account, and Administrator Test Account
- Optional Agent-Assisted Shopper Account for isolated user-two simulation during Solo Agent-Assisted Alpha
- Representative-Managed Field publishing and Store Change Request approval workflow
- Audit records for privileged actions

Excluded:

- Public reviews/photos and other public user-generated content
- Real stores or external participants
- Households, finds/collections, events, notifications, owner analytics, and advanced personalization

Shopper-trip exit criteria:

- Primary Internal Tester as Test User A and Independent Internal Tester as Test User B each complete three successful Shopper Trip Acceptance Runs using separate accounts on separate phones
- Each account proves active-trip recovery after refresh or app restart and while offline in at least one run
- Across the runs, exercise Synthetic Store discovery, details and hours, private save/rating/note creation, hours-aware multi-stop planning, trip start, navigation handoff, arrived/completed/skipped/closed stop states, and route recalculation
- AI-assisted or Primary Internal Tester runs as Test User B are supplemental and cannot replace the Independent Internal Tester's runs
- Zero Blocking Defects
- Zero cross-account exposure or modification of shopper-private data

Privileged-workflow exit criteria:

- Primary Internal Tester operates two complete Privileged Workflow Acceptance Cycles using separate representative and MFA-protected administrator sessions; Independent Internal Tester is not required to operate privileged accounts
- Every Representative-Managed Field publishes directly for the assigned Synthetic Store
- At least one Store Change Request is approved and one rejected; unapproved Controlled Store Fields remain unpublished
- Representative self-approval is denied
- Administrator grants and revokes the representative's store scope; revocation denies further writes from the representative's existing session
- Every privileged action has an audit record
- Representative and Administrator Test Accounts cannot read or modify either shopper Test Account's private data
- Zero Blocking Defects; every allowed action succeeds and every forbidden action is denied

Broader security and operational exit criteria remain to be defined during grilling.

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
