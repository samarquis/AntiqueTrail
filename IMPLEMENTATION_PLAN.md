# Implementation Plan

Regional Public MVP boundary: complete Phases 0–3, then pass the Phase 6 release gates. Phases 4–5 do not block launch and remain deferred.

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
- Listing freshness state and warnings
- Report incorrect information
- Provenance-controlled seed import
- Authentication
- Private saved stores
- Personal ratings

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
- Seed validation rejects copied descriptions, photos, reviews, and unlicensed provider content
- Freshness rules enforce the 180-day verified window, overdue hours-feature exclusion through day 365, and discovery hiding after day 365 without deleting provenance

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

External Testing Readiness criteria before first-owner contact:

- Dated passing evidence for Solo Agent-Assisted Alpha and Two-Person Acceptance
- Complete authorization and security test set passes
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Backup restore and rollback rehearsals pass
- Pilot-environment monitoring, error reporting, and support intake work
- Pilot privacy notice and owner consent are ready
- One External Testing Dress Rehearsal passes end to end
- Primary Internal Tester approves every check; AI Test Agents may collect evidence but cannot approve the gate

Any failed check blocks owner outreach, real-store import, and external participation.

First Store Partner onboarding:

- Demonstrate with Synthetic Stores only
- Obtain Store Partner Pilot Consent before creating a real store record or representative account
- Verify representative authority in person and through a published business contact
- Require owner-controlled verified email and MFA; prohibit shared credentials
- Record voluntary, invitation-only, unpaid, non-endorsing, and non-advertised pilot terms
- On withdrawal, revoke representative access and remove the real store from the active pilot
- Audit onboarding, scope grants, withdrawal, and revocation

First Pilot Store Record:

- Atomic Administrator approval of the owner-submitted Pilot Store Draft creates one record after consent and authority verification
- Owner confirms name, address, phone, website, regular and holiday hours, official description, and category tags
- Record source/provenance and verification date
- Restrict visibility to invited Private Beta participants; deny anonymous/public access
- Preserve Representative-Managed Field and Controlled Store Field authorization rules
- Exclude photos, ratings/reviews, events, owner responses, and analytics

Initial Private Beta Cohort:

- Scott uses separate shopper and Administrator accounts
- Scott's wife uses a separate shopper account
- First owner uses a Store Representative account only
- Restrict the cohort to one Pilot Store Record
- Require separate approval and a separate account before owner shopper activity
- Keep AI and Agent-Assisted Test Accounts restricted to Synthetic Store data
- Block additional users and real stores until a separate expansion gate passes

Initial Private Beta Expansion Gate:

- Owner completes Representative-Managed Field edits, submits two Store Change Requests respectively approved and rejected by the Administrator, uses MFA, and participates in scheduled revoke/regrant testing
- Scott and Independent Internal Tester each complete two shopper trip runs containing the Pilot Store Record
- Support and feedback intake works
- Privileged audit records are complete
- Monitoring, backup restore, and rollback checks remain passing
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Owner confirms that the workflow is understandable
- Primary Internal Tester approves dated evidence for every check
- No minimum calendar duration; any failed check blocks expansion

Controlled Private Beta Expansion:

- Add one verified Store Partner and one Pilot Store Record at a time
- Repeat consent, authority verification, onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks for each addition
- Block the next addition until the current one passes
- Cap at three total Store Partners and Pilot Store Records
- Keep access invitation-only with no public advertising
- Stop after all three pass and conduct a separate public-readiness review

Store Partner Invitation:

- Require Administrator MFA and recent authentication to generate an in-person invitation
- Generate a high-entropy opaque token, store only its hash, and embed no identity, store, email, or role data in the QR
- Expire after 30 minutes or one successful redemption; support revocation and regeneration
- Route the QR to the existing PWA partner-onboarding page without granting access or triggering installation
- Collect Store Partner Pilot Consent before creating a Pending Partner Identity
- Require verified owner-controlled email and MFA while keeping the identity unprivileged
- Require published-business-contact authority verification and separate Administrator approval
- Create the Pilot Store Record and store-scoped Store Representative grant only after approval
- Show PWA installation instructions after approved sign-in
- Audit every invitation and authorization transition

Pilot consent capture:

- Render a phone-friendly plain-language summary and full-policy links
- Require separate authority, voluntary-participation, permitted-data-use, no-payment/endorsement, and withdrawal acknowledgments
- Capture typed name, business title, and store name
- Create an immutable Pilot Consent Receipt bound to verified email, timestamp, invitation identifier, and policy version
- Email a receipt/PDF copy without internal verification evidence
- Permit Administrator read access but no update/delete
- Require fresh consent after material term changes
- Complete legal review of final wording before external use

Pilot Store Draft:

- Allow Pending Partner Identity to create/read/edit only its own draft after consent, verified email, and MFA
- Support draft, submitted, changes-requested, resubmitted, and approved states
- Permit Administrator read/comment/return/approve but no owner-field edits
- Require the owner to correct and resubmit returned drafts
- Require Administrator MFA, recent authentication, and exact final preview for approval
- Atomically freeze the submitted snapshot and provenance, create the Pilot Store Record, and grant its store-scoped Store Representative role
- Fail closed: create neither the store nor grant if any approval step fails
- Audit comments, transitions, submitted snapshots, approval identity, and timestamps

Representative activation and first login:

- Send status-only approval email with the normal PWA sign-in link
- Do not email a reusable invitation, magic role link, or authorization token
- Require verified-email and MFA sign-in
- Render only the exact approved Pilot Store Record, scoped permissions, Pilot Consent Receipt, and approval history
- Offer device-appropriate PWA installation instructions
- Guide listing confirmation, hours review, one Representative-Managed Field edit, one Store Change Request, and pilot-support use
- Keep changes-requested/rejected emails status-only; require authenticated portal access for details
- Audit delivery, first approved sign-in, installation handoff, and checklist progress

Store Partner Pilot Support:

- Create categorized pilot-restricted tickets for bug, confusing workflow, store-data correction, feature idea, and security/privacy concern
- Attach an allowlist only: store/account identifiers, app version, timestamp, and basic device/browser details
- Exclude tokens, shopper data, precise location, and internal logs
- Permit optional screenshot only after owner preview; re-encode and strip metadata before storage
- Restrict ticket/reply/status access to submitting Store Representative and Administrators
- Send status-only notification email
- Alert Administrator urgently for security/privacy concern
- Accept sign-in-failure fallback email without disclosing pilot data until identity verification
- Allow owner resolution confirmation and reopen

## Phase 2 — Public reviews and store claims

Features:

- Public star rating
- Reviews
- Review editing
- Reporting
- Moderation queue
- Claim listing
- Verification workflow
- Owner-managed hours and public details

Deferred beyond the Regional Public MVP: store responses and public photos.

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
- Explicit while-in-use device-location request with manual start fallback
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
- No precise coordinates in analytics, application logs, email, or support records
- Directory and manual trip planning work when device-location permission is denied

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

- Preference onboarding
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

Phase 6 is a release gate for the completed Phase 0–3 feature set, not another feature bundle. Phases 4–5 remain deferred.

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

Regional growth order after launch readiness:

1. Launch Topeka city limits
2. Select a community outside a larger metro and roughly within a 60-minute drive of Topeka, with at least two antique/vintage shops and one willing anchor Store Partner
3. Add only that community, then pass its Community Expansion Gate: two verified active listings; completed anchor-partner onboarding, direct-edit, controlled-change, and support workflows; separate-account/phone multi-stop trips by Scott and the Independent Internal Tester; voluntary trip-use confirmation from five additional shoppers without precise-location tracking; passing monitoring, support, and data-accuracy checks; zero Blocking/privacy/security/data-loss defects; and dated Primary Internal Tester approval
4. Repeat one community at a time, stopping after three communities
5. Conduct a separate larger-metro readiness review before considering Kansas City or another larger metro

No minimum calendar duration applies to the Community Expansion Gate. Exact community choices remain unresolved.

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
