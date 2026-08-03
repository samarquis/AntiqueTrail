# Implementation Plan

Regional Public MVP boundary: Packages 1–10B plus every named gate. Package 11 is the postlaunch RG-01 evidence gate; each Package 12 run activates one separately approved small community, ordinals 1–3, with the prior community's gate required before the next. Phases 4–5 remain deferred.

Status: plan hardened through the 2026-08-03 adversarial review. Coding is not authorized until the Product Owner gives a separate start instruction. The full PRD remains intact. Explicit deferred decisions gate only dependent features/releases. No real-store outreach, external participant, public launch, promotion, or public deployment is authorized.

**Execution authority:** phase headings are capability groupings only. Packages are the sole executable order. Package 1 is controlled by this file; Packages 2–12 by `PACKAGE_CONTRACTS.md`. A phase heading never authorizes its full feature set.

| Capability grouping | Executable packages |
|---|---|
| Phase 0 foundation | Planning and provider/human gate ADRs |
| Phase 1 directory/private intake | 1–4 |
| Phase 3 trip workflow | 5A–5B |
| Phase 2A partner/admin | 6–7 |
| Internal/private evidence | 8–8B |
| Phase 2B public reviews | 9 |
| Regional readiness/release | 10A–10B |
| Postlaunch RG-01 | 11 |
| One approved small-community activation | 12 |
| Phases 4–5 | Deferred; no scaffolding |

**Milestones:** first development slice is Package 1 local Synthetic Browse/Details only. `SLM-01` is the private Synthetic checkpoint after Packages 1, 2, 3, and 5A. Regional Public MVP remains Packages 1–10B. None authorizes the next milestone automatically.

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
- Stage/provider cost model from ADR 0005: `$0` local/shared startup, no automatic paid overage, 25% headroom, conditional `$0` Private Beta only when restore/availability gates pass, and public release blocked until 15-minute RPO is funded or otherwise proven.
- Regional launch definition

Exit criteria:

- No unresolved contradiction in public/private data behavior
- Every role has documented permissions
- Every sensitive data class implemented in the next slice has an approved retention and deletion behavior
- A provider ADR and legal/data review exist before any provider-dependent feature is enabled
- D31 full Audit History UI remains excluded; two-year append-only privileged audit events required by D30 are specified

## Phase 1 — Public directory foundation

Features:

- Responsive app shell
- List-first Store Browser as the default shopper entry point
- Search by store name, town/area, and category
- Optional map toggle; never the only discovery path
- Scannable store cards and Store Details
- Approved Official Store Profile Photo cover/gallery with neutral fallback
- Hours
- Categories
- Last-verified information
- Listing freshness state and warnings
- Report incorrect information
- Provenance-controlled seed import
- Authentication
- Just-in-time authentication that resumes the interrupted private action
- `New Since Your Last Visit` using coarse last-seen state and a manual area
- Private Candidate Link capture and Trip Ideas
- Recipient-specific Candidate Share between two authenticated shoppers
- Source-aware unverified extraction with blocked/private-source manual fallback
- Private saved stores
- Personal ratings
- Age-Inclusive Usability Baseline: readable defaults, 48-by-48 targets, labeled actions, 200% text resizing/reflow, keyboard/screen-reader support, non-color-only status, and non-drag alternatives

Security:

- RLS
- Storage policies
- Rate limiting
- Secure session handling
- Audit framework
- Environment separation
- Isolated external-link fetcher with SSRF, redirect, DNS-rebinding, size, timeout, content-type, and rate-limit controls

Exit criteria:

- User A cannot access User B data
- Candidate Share is readable and actionable only by its sender and named recipient; acceptance creates a recipient-owned Trip Idea without exposing recipient edits or other private records
- Pending Candidate Shares expire after 30 days; revoke, dismiss, and expiry deny further access immediately and delete unaccepted payloads from primary database and Storage within 24 hours
- Candidate Share verified-email matching returns indistinguishable results for matched, unmatched, unverified, and blocked addresses; only the matched account receives a payload, and unregistered addresses receive no invitation
- Failed or blocked extraction preserves the original Candidate Link and cannot write public store or Event data
- Public browsing works without an account
- Saved stores remain private
- Seed data has provenance and verification fields
- Seed validation rejects copied descriptions, photos, reviews, and unlicensed provider content
- Official photo pipeline rejects unscoped or unpermissioned submissions and publishes only approved processed derivatives with alternative text
- Freshness rules enforce the 180-day verified window, overdue hours-feature exclusion through day 365, and discovery hiding after day 365 without deleting provenance

## Cross-phase Internal Alpha gate

Assemble the Phase 1, Phase 2A, and Phase 3 synthetic slices and test this gate before Phase 2B public reviews, real-store import, or owner outreach.

Stages:

- Solo Agent-Assisted Alpha: Primary Internal Tester operates all separate roles; supervised AI Test Agents may execute repeatable tests but cannot replace human acceptance or approve a gate
- Two-Person Acceptance: Independent Internal Tester performs shopper acceptance using a newly created Test User B account on her own phone; no solo-stage account is reassigned to her
- External Testing Readiness: separately defined gate required after both internal stages; passing permits one consenting Store Partner representative and one real store in controlled Private Beta, but not public access or advertising

Required:

- Phase 1 Store Browser/authentication/private-data foundation using Synthetic Stores and generated fictional profile images only
- Candidate Link capture, recipient-specific Candidate Share, and recipient-owned Trip Ideas using synthetic pages and fictional data only
- Explicit trip selection/creation, progressive Plan setup, Check My Day warnings/order choice, readiness, manual-arrival Go, private visit memory, summary, and offline recovery
- One-trip Creator/Partner/Navigator invitation and server-side authorization
- Test User A, Test User B, Representative Test Account, and Administrator Test Account
- Optional Agent-Assisted Shopper Account for isolated user-two simulation during Solo Agent-Assisted Alpha
- Store Portal home, hours editor, Store Updates, official image/social-link workflows, support, and Store Change Requests
- Administrator home, review workspace, Access & Safety, revocation, and regrant
- Audit records for privileged actions
- Age-Inclusive Usability Baseline across browse, details, plan, and active-trip journeys

Excluded:

- Public reviews, shopper/review photos, and other Public User-Generated Content
- Real stores or external participants
- Household accounts/shared lists, finds/collections, public Event records, push notifications, owner analytics, and advanced personalization; one-trip Partner access and recipient-specific Candidate Share are the only approved narrow cross-account exceptions

Shopper-trip exit criteria:

- Primary Internal Tester as Test User A and Independent Internal Tester as Test User B each complete three successful Shopper Trip Acceptance Runs using separate accounts on separate phones
- Test User B sends a synthetic Candidate Share to Test User A; Test User A alone accepts it into a recipient-owned Trip Idea and adds it to Plan
- Anonymous, wrong-recipient, Representative, and Administrator access is denied; sender cannot read recipient edits, notes, ratings, or resulting trips
- Synthetic clock-advance, revoke, and dismiss tests prove immediate denial and 24-hour unaccepted-payload deletion without deleting an accepted recipient-owned Trip Idea
- Accept, Dismiss, Block, and Report tests prove recipient-only actions; Block denies future sends, Report creates a private moderation case, and the sender sees only `Pending`, `Accepted`, or indistinguishable `Closed`
- Blocked-source/manual fallback and failed extraction preserve the original link without public publication
- Each account proves active-trip recovery after refresh or app restart and while offline in at least one run
- Each account proves that only its Navigator snapshot and pending mutations exist in encrypted IndexedDB, no authenticated trip data enters public Cache Storage, and another account cannot decrypt or resume it
- Completed synced trips purge locally; account switch and confirmed logout purge locally; logout with unsynced changes requires an explicit data-loss warning
- A simulated offline revocation is denied before reconnect sync or refreshed private display and purges the local key/cache
- Go accepts mutations from one active Navigator device only; authenticated online transfer causes later old-device mutations to fail
- Duplicate/retried offline mutations apply exactly once and valid actions replay in recorded local order
- Server authorization, Navigator/device assignment, and trip state reject stale or incompatible queued actions without cross-account disclosure
- Same-author rating/note conflicts preserve both versions and require an explicit `Keep This Phone's Version` or `Keep Saved Version` choice
- Across the runs, exercise Synthetic Store discovery/details/updates/official links, just-in-time auth, explicit Add to Trip, progressive Plan, Check My Day choice/warnings, one-trip partner handoff, Navigator-only Go, manual arrival, private review, skip/Undo, summary/Plan Again, and recalculation
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
- Store content/image/social/support review paths enforce their labels and lifecycle; Administrators cannot edit submissions or bulk approve
- Access revocation and regrant affect only the selected store scope; an already-open Representative session is denied on its next write
- Representative and Administrator Test Accounts cannot read or modify either shopper Test Account's private data
- Every Synthetic Internal Alpha break-glass request is denied and audited
- Zero Blocking Defects; every allowed action succeeds and every forbidden action is denied

External Testing Readiness criteria before first-owner contact:

- Dated passing evidence for Solo Agent-Assisted Alpha and Two-Person Acceptance
- Complete authorization and security test set passes
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Backup restore and rollback rehearsals pass
- Database and Storage restores separately meet the current stage's approved RPO/RTO
- Before Private Beta, a synthetic-data rehearsal proves every break-glass request is denied and audited while Scott is the sole Administrator through Packages 8/8B. If a real second qualified Administrator exists, also rehearse the enabled path's scope, read-only default, 30-minute expiry, approval, notice, two-year hash-chained audit, and external anchor. Otherwise defer that enabled-path rehearsal until Package 9 reviewer enrollment and capability tests pass; Private Beta proceeds only with break-glass disabled.
- A full Private-Beta incident rehearsal proves detection/severity, containment, credential/store-scope revocation, user/store/status communication, database and Storage recovery, deletion-receipt replay, and post-incident evidence
- Pilot-environment monitoring, error reporting, and support intake work
- Monitored support address/form and security contact are published; the Private Beta response commitments, named on-call owner and backup, and in-PWA/status-channel incident path are exercised
- Pilot privacy notice and owner consent are ready
- Qualified professional evidence confirms the operating legal entity and required pilot insurance are active for owner contact and participation
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
- Submit rights-confirmed Official Store Profile Photos through Store Change Requests; display only approved processed derivatives with alternative text
- Exclude ratings/reviews, shopper/review photos, events, owner responses, and analytics

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
- Keep access invitation-only with no public product promotion
- Stop after all three pass and conduct a separate public-readiness review

Store Partner Invitation:

- Require Administrator MFA and recent authentication to generate an in-person invitation
- Generate a high-entropy opaque token, store only its hash, and embed no identity, store, email, or role data in the QR
- Expire after 30 minutes or one successful atomic consumption; support revocation and regeneration
- Route the QR to the existing PWA partner-onboarding page without granting access or triggering installation
- Present pilot terms and collect consent statements plus identity credentials before any identity/grant exists
- In one idempotent transaction consume the invitation, store the immutable provisional consent submission, and create one unprivileged Pending Partner Identity; rollback all on failure and resume the same record after interruption
- Require verified owner-controlled email and MFA, then finalize the immutable Pilot Consent Receipt bound to the verified identity
- Require published-business-contact authority verification and separate Administrator approval
- Create the Pilot Store Record and store-scoped Store Representative grant only after approval
- Show PWA installation instructions after approved sign-in
- Audit every invitation and authorization transition

Pilot consent capture:

- Render a phone-friendly plain-language summary and full-policy links
- Require separate authority, voluntary-participation, permitted-data-use, no-payment/endorsement, and withdrawal acknowledgments
- Capture typed name, business title, store name, and owner-controlled email
- Create the immutable provisional submission atomically with invitation consumption and the Pending Partner Identity
- After email verification/MFA, finalize the immutable Pilot Consent Receipt bound to the provisional submission, verified email, finalization timestamp, invitation identifier, and policy version
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
- Permit one optional screenshot only after warning, crop/redact, final preview, and confirmation; scan, quarantine, re-encode, strip metadata, and delete it 30 days after ticket closure or sooner on removal
- Restrict ticket/reply/status access to submitting Store Representative and Administrators
- Send status-only notification email
- Alert Administrator urgently for security/privacy concern
- Accept sign-in-failure fallback email without disclosing pilot data until identity verification
- Allow owner resolution confirmation and reopen

## Phase 2A — Store claims, Store Portal, and administration before external testing

Entry conditions:

- Phase 1 public-directory and identity foundations required by this work are complete.
- Store Partner invitation, consent, Pending Partner Identity, draft, approval, role-grant, support, and audit contracts are bounded using the approved first-pilot rules.
- Only Synthetic Stores and separate test accounts are present.

Features:

- Claim-listing intake and first-pilot authority-verification workflow
- Store Partner Invitation, consent, Pending Partner Identity, Pilot Store Draft, atomic approval, and scoped role grant
- Store Portal home and direct/controlled publishing labels
- Owner-managed weekly hours, dated exceptions, 14-day preview, confirmation, and Undo
- Native Store Updates, reversible archive, and image hold/review
- Official Store Profile media and validated social profile links
- Pilot Support lifecycle
- Administrator home, type-aware content/claim review workspace, Access & Safety, revocation, regrant, and narrow D30 `View Audit`

Security and trust:

- Role assignment and every privileged state transition are server-side.
- Store Representative access is one-store scoped and existing-session revocation is tested.
- Client code cannot approve drafts, publish reviewed fields/media, grant roles, or alter audit records.
- Privileged audit events are append-only and retained for two years; D31 full Audit History UI/export remain excluded.
- Public-review routes, tables, policies, and UI remain absent or server-denied during this subphase.

Exit criteria:

- Representative cannot access shopper activity or write outside the assigned store.
- Direct versus reviewed content, atomic onboarding, image replacement, support, and access revocation/regrant pass the `DESIGN.md` journeys.
- Phase 2A plus Phase 1 and Phase 3 synthetic work can enter the Cross-phase Internal Alpha gate without enabling Public User-Generated Content.

## Phase 2B — Public reviews and moderation after Internal Alpha

Entry conditions:

- Cross-phase Internal Alpha gate has passed.
- The approved review identity, eligibility, conflict, deletion, arithmetic aggregate, moderation, evidence, appeal, and abuse rules in the controlling documents are translated without policy invention into the Package 9 execution contract.
- Server-owned `public_reviews_enabled` remains false in every Internal Alpha and Private Beta environment; direct route/read/write denial is part of entry and exit evidence.
- Public release remains disabled until Phase 6 gates pass.

Features:

- Public star rating and text review
- Review editing and deletion behavior
- Reporting and moderation queue
- Rating aggregation
- Approved appeal path

Deferred beyond the Regional Public MVP: store responses and shopper/review photos. Official Store Profile Photos are delivered in Phase 1.

Security and trust:

- Review abuse controls, rate limits, eligibility enforcement, and moderation audit logs
- Store owner cannot alter or suppress user reviews.
- Client cannot approve, publish, or change rating aggregation directly.

Exit criteria:

- Public review and moderation authorization, abuse, aggregation, edit/delete, report, and appeal tests pass.
- Public-review UI passes the applicable `DESIGN.md` and `DESIGN_SYSTEM.md` states without exposing shopper-private data.

## Phase 3 — Trip planner

Features:

- Add reviewed Trip Ideas as candidate stops
- Explicit existing-trip/new-trip chooser with area and required date
- Progressive starting point, departure, optional return, and per-stop durations
- Explicit while-in-use device-location request with manual start fallback
- Departure time
- Return destination
- Browse-duration estimates
- Priority stops
- Check My Day suggested feasible order with explanations and explicit Use/Keep choice
- Amber/red/gray schedule warnings with corrective actions and one explicit start confirmation
- Readiness card
- One-trip Creator/Partner invitation, draft collaboration, and Navigator assignment
- Navigator-only active trip with manual arrival
- Done Here private rating/return choice/note
- Skip/Undo, recalculation, summary, immutable history, and Plan Again clone
- Waze handoff
- Google Maps handoff
- Minimum Navigator-only offline active trip with visible pending sync
- Trip history

Exit criteria:

- Correct next-stop handoff
- Offline trip recovery
- Schedule warnings tested across time zones and daylight-saving changes
- No hidden background tracking
- No precise coordinates in analytics, application logs, email, or support records
- Directory and manual trip planning work when device-location permission is denied
- Trip Partner can access only the invited trip, and only Navigator can mutate Go
- Offline arrival/completion/skip/private-note mutations synchronize exactly once in local order; server authority rejects invalid state, and conflicting private text/rating requires explicit author choice

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

Phase 6 is a capability grouping implemented only through Packages 10A–10B after every earlier package/gate, not another feature bundle. Phases 4–5 remain deferred.

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
- WCAG 2.2 AA conformance review
- Representative older-adult browse-to-plan and active-trip usability test using the approved cohort and pass thresholds
- All three Controlled Private Beta Store Partners and stores passed their sequential addition gates
- At least 12 active verified Topeka listings and 70% of the independently enumerated eligible baseline, unless the Product Owner signs the defined market-size exception
- Three unique three-store current-hours itineraries per named day for one non-holiday Tuesday, Friday, and Saturday—nine total—within 30 days of evidence: first-store opening start, 45-minute dwell, 10-minute transition buffer, accepted-provider travel matrix, and every visit completed by verified closing
- Eight independent invited Topeka shoppers attempted the core journey; at least seven completed without a Blocking Defect and at least five confirmed return intent or completed a second trip
- Browser/device matrix shows zero Blocking Defects, no repeatable journey failure, and at least 99% success after each critical Browse-to-Plan and Go/handoff synthetic journey runs ten times in every applicable matrix cell
- Named support/security contacts, on-call/backup, status path, and passed Private-Beta plus public incident rehearsals
- Product Owner signs the Regional Public Readiness receipt before real-store anonymous access, public deployment, or advertising

Regional growth order after launch readiness:

1. Launch Topeka city limits
2. Select a community outside a larger metro and roughly within a 60-minute drive of Topeka, with at least two antique/vintage shops and one willing anchor Store Partner
3. Privately prepare and sign the one-area readiness receipt, activate only that community, then pass its Community Expansion Gate: two verified active listings; completed anchor-partner onboarding, direct-edit, controlled-change, and support workflows; separate-account/phone multi-stop trips by Scott and the Independent Internal Tester; voluntary trip-use confirmation from five additional shoppers without precise-location tracking; passing monitoring, support, and data-accuracy checks; zero Blocking/privacy/security/data-loss defects; and dated Primary Internal Tester approval
4. Start another separately approved Package 12 run only after the prior gate passes; stop after ordinal 3
5. Conduct a separate larger-metro readiness review before considering Kansas City or another larger metro

No minimum calendar duration applies to the Community Expansion Gate. Exact community choices remain unresolved.

## Bounded first development slice — execution contract

This is the first implementation package, not the complete Regional Public MVP. It turns the approved Store Browser front door into a locally runnable, testable foundation while preserving every later phase.

### Outcome and acceptance boundary

The slice is complete only when a clean checkout can reproduce the local stack and all automated gates pass for:

- one React/TypeScript/Vite PWA using the approved single-application architecture
- local Supabase schema, migrations, RLS, grants, deterministic seed data, and generated database types
- Synthetic Stores only, with fictional names, content, and rights-safe generated or neutral local images
- anonymous list-first Store Browser at `/stores` and Store Details at `/stores/:slug`
- search by name, town/area, and category; manual browsing without sign-in, device location, or map access
- cover-image fallback, category summary, today's hours/open state, freshness state, full hours/exceptions, contact links, provenance/freshness, and plain verification caveat; correction reporting begins in Package 3
- Age-Inclusive Usability Baseline across both routes
- unit/component, database authorization, accessibility, and browser end-to-end tests
- GitHub Actions CI that installs from the lockfile, checks formatting/lint/types/tests, starts the local Supabase stack for database tests, builds the PWA, and runs browser tests
- local setup and verification instructions in `README.md`

This slice does not create private data or private actions. Hide `Save`, `Add to Trip`, private ratings/notes, and `Report correction`; do not render disabled or teaser controls. Store Details may show only `Website`, `Call`, and external-map address links when valid fixture data exists. Later packages add private/correction actions with their complete authentication and endpoint contracts.

### NOT in scope

- authentication, accounts, profiles, roles, scoped grants, or privileged audit events
- Candidate Link/Share, Trip Ideas, saved stores, personal ratings, or private notes
- trip planning, routing, maps, device location, navigation handoff, Go, or authenticated offline data
- Store Portal, Store Partner Invitation, Administrator, moderation, support, or break-glass workflows
- public reviews, public user-generated content, events, vendor access, or social-feed synchronization
- uploads, Supabase Storage, remote image fetching, scraping, email, notifications, analytics, or external APIs
- real store names, records, media, owners, shoppers, or public entities
- external participant testing, owner outreach, advertising, public release, hosting choice, or deployment

### What already exists

- approved product, design, decision, security/privacy, threat-model, authorization-matrix, and phased implementation documents
- ADR 0004 approving one React/TypeScript/Vite PWA with Supabase and server-enforced authorization boundaries
- a documentation handoff manifest (`manifest.json`), repository-contained design system, and an archival concept flow lab that is not implementation or acceptance authority; no installable PWA web-app manifest exists yet
- no application source, package manifest, migration, test suite, CI workflow, Supabase project, or deployment; implementation starts greenfield inside this repository

### Runtime and data flow

```text
Anonymous browser
  -> React routes
       -> /stores
            -> one bounded `catalog_list` database RPC per page
            -> loading | results | empty | recoverable error
            -> search/category/area controls update URL/query state and issue a new server request
            -> one deterministic bounded result; `catalog_too_large` fails closed instead of truncating
       -> /stores/:slug
             -> one bounded `catalog_details` database RPC
            -> details | not found | recoverable error
  -> Supabase browser client using publishable/anonymous key only
       -> PostgREST Data API
             -> EXECUTE only on the two catalog RPCs
             -> no anonymous base-table grants
             -> fixed-search-path functions and explicit parent visibility checks
             -> only active, current Synthetic Store rows
  -> local Postgres seeded only from versioned SQL

Static PWA shell and fictional images
  -> Vite build output
  -> service worker caches shell/assets only
  -> no authenticated, user, trip, provider, or catalog response cache
```

Keep one catalog data-access module. Do not add a repository interface, factory, service layer, state library, or second application. The three Package 1 filters apply server-side to the bounded set. Components receive typed catalog results and render explicit loading, empty, error, and success states; pagination remains absent until Package 10A proves it is needed.

### Minimal data model and security boundary

Versioned migrations are the schema source of truth. Dashboard-only schema changes are prohibited.

- `catalog_areas`: immutable UUID, canonical slug, display label, state code, and sort order. Slug is lowercase ASCII `a-z`, `0-9`, and single hyphens only, 1–64 characters, unique; display label is NFKC/trimmed, 1–80 Unicode code points. Package 1 seeds only `topeka-ks` / `Topeka` / `KS`.
- `store_categories`: immutable UUID, canonical slug, display label, and sort order under the same slug/label rules. Package 1 seeds `antique-mall`, `vintage`, `furniture`, `collectibles`, `home-decor`, and `flea-market`; later taxonomy changes require a migration/data receipt, never client-created values.
- `stores`: synthetic flag/audience, publication state, unique slug, name, town, state, address, `area_id` required foreign key to `catalog_areas`, optional coordinates for display-only fixtures, summary, description, phone, website, store time zone, and created/updated timestamps
- `store_category_assignments`: `(store_id, category_id)` primary key with cascading removal only when the parent store is deliberately removed; no free-text category value
- `store_fact_verifications`: store, required group enum (`identity_location`, `contact`, `hours`, `categories_attributes`, optional `media_social`), verified-at UTC, public provenance label, and fixture verifier kind; listing freshness uses the oldest required core group and never refreshes all groups from one edit
- `store_weekly_hours`: `(store_id, iso_weekday, interval_index, is_closed, opens_at, closes_at)` with unique store/day/index; an open day has interval indexes 1 and optionally 2, while a closed day has one index-1 row with null times
- `store_hour_exceptions`: `(store_id, local_date, interval_index, is_closed, opens_at, closes_at, label)` with unique store/date/index; a date has one closed row or one/two replacement intervals and replaces, never layers onto, the weekly day
- `store_media`: store, local fictional asset path, cover/gallery kind, alternative text, and display order

Database constraints enforce required fields, ISO weekdays 1–7, IANA store time zones, unique store/area/category slugs, unique normalized area/category labels, one required area per store, at least one category assignment per published store, zero or one cover image per store through a partial unique constraint, bounded gallery order, valid HTTP/HTTPS contact links, and Synthetic Store-only seed values. A photo-less or rights-withdrawn listing has zero media rows and renders the neutral UI placeholder; no fake placeholder media record is stored. B-tree indexes cover `stores(area_id, publication_state)`, category assignment in both directions, and canonical area/category slugs. An open interval requires `start < end`; overnight ranges are prohibited and must be split at midnight; a day has at most two ordered intervals; overlap or touching intervals are rejected instead of silently merged; `closed` requires zero intervals. An exception date is unique per store and replaces the weekly day. Local wall time is interpreted in the approved store time zone; nonexistent DST wall times are invalid, while an ambiguous open uses the earlier offset and an ambiguous close uses the later offset. Missing or invalid hours return `Hours unavailable` and never an open/closed claim.

Seed rows include stable IDs and fact-group provenance/verification fields so `supabase db reset` produces identical fixtures. Production freshness, local date, and open state are calculated inside the catalog RPC from database `statement_timestamp()`; the client receives `as_of_utc` and display-ready state and does not make a security/freshness decision from its device clock. Tests may override time only through a test-schema function enabled by the local test migration; production migrations, anonymous roles, built assets, and hosted environments cannot execute or reference that override. Wall-clock passage cannot change deterministic seed-test outcomes.

Every base table enables and `FORCE ROW LEVEL SECURITY`; runtime/authenticator/function-owner roles own no application table. Revoke schema create, table/sequence privileges, and function execute from `PUBLIC`; `anon` has no table privilege and receives `EXECUTE` only on `catalog_list`/`catalog_details`. Those are explicitly `SECURITY DEFINER`, owned by a dedicated no-login role with only minimum base-table `SELECT`, no inheritance/BYPASSRLS/table ownership, a literal `search_path=pg_catalog,app_public`, schema-qualified objects, no dynamic SQL, bounded typed output, and explicit input constraints. Every child join passes the trusted parent predicate requiring `synthetic=true`, active publication, and freshness ≤365 days. Unknown/hidden/stale/non-Synthetic detail returns the same not-found. Tests prove direct base/child denial, indirect RPC sibling/hidden denial, hostile search path/object input, excessive result denial, and all anonymous writes denied. Browser receives only the publishable key; service/database credentials never enter client/build/log/CI.

That direct `anon` RPC grant is Package 1 local/Synthetic scope only. Package 10B must revoke it and expose public list/detail solely through the rate-limited Supabase Edge Function catalog gateway contracted in `SECURITY_AND_TRUST.md` and `PACKAGE_CONTRACTS.md`; direct PostgREST bypass must deny. No Package 1 code may assume the direct transport is permanent.

Each RPC returns the complete bounded projection needed by its route, including hours/media children, to prevent per-card queries. The database owns trusted open/freshness state; one matching pure formatter may render returned schedules and is verified against RPC fixtures but cannot widen visibility or contradict `as_of_utc`. No provider call or device location participates.

#### Bounded catalog query contract

- URL parameters are only `q`, `category`, and `area`; each is single-valued. Repeated values use the first and the canonical URL removes the rest.
- Trim/collapse whitespace, reject control characters, and cap `q` at 100 Unicode code points. Empty becomes no text filter. Package 1 uses case-insensitive substring search over store name, town, area label, and category labels; it adds no search extension, normalization trigger, or speculative scale index.
- `category` and `area` are exact slug matches. Unknown valid values return zero; malformed values are removed with an accessible explanation.
- Default order is store name ascending, then immutable store UUID ascending. The deterministic seed contains 12 Synthetic Stores and one RPC returns the full bounded set; Package 1 has no cursor, `Load More`, catalog revision, open/freshness filter, or 100-store scale proof.
- Package 10A adds release-scale Unicode/accent search, `Open Today`, `Open Now`, freshness filtering, index/query-plan proof, and revision-bound pagination only if the verified regional catalog can exceed 50 active listings or measurements show the bounded query is insufficient.

### PWA, dependency, and developer-experience choices

- package manager: `npm` with committed lockfile
- runtime: current supported Node.js LTS pinned in `.nvmrc` and `package.json#engines` when implementation starts; exact npm version pinned in `packageManager`
- application: React, TypeScript strict mode, Vite, and React Router
- data: `@supabase/supabase-js` plus generated database types
- PWA: `vite-plugin-pwa` manifest plus generated service worker limited to the static shell and versioned local assets
- browser/cache: shell/service worker `no-cache`; hashed assets one-year immutable; API/RPC `no-store`; service worker never caches Supabase/API/private data; production uses the exact CSP/security headers in `SECURITY_AND_TRUST.md`
- code quality: ESLint flat configuration with `typescript-eslint`, React hooks rules, and Prettier
- tests: Vitest, Testing Library, `@testing-library/jest-dom`, pgTAP through the Supabase CLI, Playwright, and `@axe-core/playwright`
- versioning: every direct dependency and the Supabase CLI are exact versions in `package.json`; the committed npm lockfile and Playwright browser revision are authoritative. A dependency update is a separate reviewed lockfile change, not an implicit install-time choice.
- CI supply chain: pin every GitHub Action to a full commit SHA; default workflow permissions read-only; no provider/deployment secrets in untrusted PR jobs; protected deployment approval; lockfile/dependency/license/secret/SAST/migration checks; CycloneDX SBOM and tested artifact digest
- configuration: committed `.env.example`; ignored local environment file; startup fails clearly when required public configuration is absent
- commands: one documented `npm run check` aggregate plus focused `dev`, `build`, `typecheck`, `lint`, unit, database, and end-to-end commands

Local Supabase requires a supported Docker-compatible runtime. Treat stack startup failure as an environment error with a documented recovery path, not a reason to bypass database authorization tests. `supabase db reset` is local/destructive and must never point at a shared or production project.

### Failure modes and required behavior

| Failure | Required behavior | Proof |
|---|---|---|
| Supabase unavailable or request times out | Keep app shell usable; show plain error plus Retry; never show stale success | Component and browser test |
| Seed contains zero visible stores | Show intentional empty state, not blank screen or crash | Component and browser test |
| Search/filter returns zero matches | Preserve controls and query; show Clear Filters | Component and browser test |
| More than 50 stores match unexpectedly | Return `catalog_too_large`, show a plain retry/support state, and block Package 1 acceptance; never truncate silently. Package 10A owns measured pagination | Database and browser test |
| Store slug is unknown, hidden, or malformed | Show the same not-found state without leaking hidden-row existence | Database and browser test |
| Hours or exception data is missing/invalid | Show `Hours unavailable`; never guess open state | Unit and component test |
| Image is missing or fails to load | Render neutral accessible placeholder without layout shift | Component and browser test |
| Slow response | Show non-blocking loading state; controls remain understandable; no duplicate request storm | Component test |
| RLS or grants are misconfigured | CI fails on allowed/denied matrix before browser acceptance | pgTAP test |
| Service worker is unsupported or update fails | Online browsing still works; no private/catalog response is cached | Build and browser test |
| CI runner cannot start local Supabase | Job fails with stack logs; database tests are not skipped | CI workflow test |

### Test coverage contract

No code exists yet, so current executable coverage is 0%. Implementation writes tests with each path; tests are not a later hardening phase.

```text
CODE/DATA PATHS                                      USER FLOWS
[PLANNED] catalog query                              [PLANNED] Browse Stores [-> E2E]
  +-- allowed active synthetic rows                    +-- immediate list without sign-in/location
  +-- denied non-synthetic/hidden rows                 +-- search name, area, category
  +-- denied anonymous writes                          +-- zero matches -> Clear Filters
  +-- success | empty | timeout/error                  +-- Retry after failed request

[PLANNED] hours/open-state formatter                 [PLANNED] Store Details [-> E2E]
  +-- weekly hours                                      +-- open card by pointer and keyboard
  +-- dated exception overrides                         +-- direct/deep URL
  +-- store-local time zone                             +-- unknown/hidden slug -> not found
  +-- missing/invalid -> unavailable                    +-- Back preserves Browse state

[PLANNED] media rendering                            [PLANNED] Age-inclusive access [-> E2E]
  +-- cover/gallery order                               +-- keyboard + visible focus
  +-- missing/failing image -> placeholder              +-- 200% text resize/reflow
  +-- meaningful alt text                               +-- 48x48 targets, labeled/non-color status

TARGET: 100% statements/branches/functions/lines for slice-owned catalog
logic and data access. Generated types, framework entry files, and static data
are excluded. Critical browser and RLS behavior must pass independently of
line coverage.
```

Required tests:

- unit: bounded query validation, exact category/area matching, freshness labels with injected test clock, weekly/exception hours invariants, DST boundaries, and invalid/missing-data fallbacks
- component: loading, results, empty seed, zero matches, retry, missing image, hours unavailable, and accessible names/status
- database: schema/hour constraints, deterministic 12-store seed, test-clock isolation, server-side `q/category/area` filtering, deterministic order, active/current Synthetic Store RPC reads, direct base/child-table denial, stale/hidden/non-synthetic denial, all anonymous write denial, and unknown-versus-hidden indistinguishability
- end to end: `/stores` search/filter to `/stores/:slug`, direct details URL, browser Back/query state, keyboard-only path, 200% zoom/reflow, no auth/location prompt, request failure/retry, not found, and installable shell
- CI: clean install, static checks, unit/component tests with coverage, local Supabase reset plus pgTAP, production build, Playwright, and artifact/log retention on failure

### Performance contract

- one catalog request per Store Browser page and one for Store Details; no per-card or per-hour request loop
- explicit selected columns; server-side filters; deterministic sort with stable unique tie-breaker; hard maximum 50 rows
- ordinary indexes supporting active-synthetic filtering, category tags, slug lookup, and store/hour joins; measured release-scale search/pagination indexes belong to Package 10A
- no map SDK, remote feed, remote image fetch, prefetch of every detail record, or speculative client cache
- responsive local images with declared dimensions; lazy-load below-fold images
- initial JavaScript target at or below 250 KiB compressed; exceeding it requires a measured reason recorded in the plan
- lab targets: LCP at or below 2.5 seconds, INP at or below 200 ms, and CLS at or below 0.1 on a local production build in the Playwright-pinned Chromium, `390x844` viewport, 4x CPU slowdown, Fast 4G (`1.6 Mbps` down, `750 Kbps` up, `150ms` RTT), cold HTTP/service-worker cache, and median of three runs per route. Record browser revision, machine/runner, bundle size, request count, bytes, and all three measurements. Field 75th-percentile validation waits for a real authorized audience.
- exercise list, search, and details with the exact deterministic 12-store Synthetic fixture; record query count, transferred bytes, and timings in the slice receipt

### Execution order, gates, and rollback

One sequential implementation lane is preferred; this slice is too small for parallel ownership before schema and route contracts stabilize.

1. Create minimal Vite application, package/lockfile, strict TypeScript, formatting/linting, PWA shell, and CI skeleton. Gate: clean install, typecheck, build, and shell smoke test.
2. Add local Supabase config, migrations, deterministic 12-store Synthetic seed/test clock, generated types, grants/RLS, and pgTAP tests. Gate: reset succeeds twice from clean local state; bounded filter and allowed/denied authorization cases pass.
3. Add catalog data module and pure hours/freshness logic with unit tests. Gate: coverage contract and failure paths pass.
4. Build `/stores` and `/stores/:slug` against `DESIGN.md` and `DESIGN_SYSTEM.md`, including all states and age-inclusive baseline. The archival flow lab is not an implementation source. Gate: component, accessibility, and browser tests pass on phone, tablet, and desktop viewports.
5. Run full `npm run check`, local reset, production build, and browser suite; inspect built assets for secrets and forbidden data; record evidence on the GitHub tracker. Gate: zero failing checks, zero real-store data, zero auth/location/provider calls, and explicit product-owner review before any next slice.

Failure routes to the owning step; never weaken a gate or replace a failed database/browser check with AI judgment. Rollback is a normal Git revert of the bounded slice plus local `supabase db reset`; there is no remote data or deployment to recover. Stop immediately if real-store data appears, a public deployment would be required, authorization tests cannot run, or implementation needs a product decision outside this contract.

### Authoritative implementation references

- [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows) for versioned migrations, deterministic local setup, and Docker-compatible runtime requirements
- [Supabase secure data guidance](https://supabase.com/docs/guides/database/secure-data) for publishable-key, grants, RLS, and service-role boundaries
- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview) for pgTAP, RLS, negative authorization, and CI tests
- [Playwright continuous integration](https://playwright.dev/docs/ci) for browser installation, stable CI execution, and failure artifacts
- [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds) for LCP, INP, CLS, and future 75th-percentile field validation

## Repository structure baseline

```text
/
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ catalog/
│  │  ├─ capture/
│  │  ├─ trips/
│  │  ├─ store-portal/
│  │  ├─ admin/
│  │  └─ reviews/
│  ├─ lib/
│  └─ service-worker/
├─ public/
├─ supabase/
│  ├─ migrations/
│  ├─ functions/
│  ├─ seed/
│  └─ tests/
├─ docs/
│  ├─ adr/
│  ├─ design/
│  ├─ product/
│  ├─ security/
│  └─ operations/
├─ tests/
│  ├─ authorization/
│  └─ e2e/
├─ .github/workflows/
├─ package.json
└─ README.md
```

Start with one React/TypeScript/Vite PWA and one deployable. Keep shopper, Store Portal, and Administrator routes in the same application while enforcing server-side boundaries. Do not create a monorepo, shared package layer, or second admin application until a second deployable or proven reuse exists. Provider selections still require separate ADRs before dependent implementation.

Create only directories required by the active slice. The broader tree above reserves ownership boundaries; it does not authorize empty feature scaffolding.

## Bounded work-package roadmap

Package 1 uses the execution contract above. Packages 2–12 use `PACKAGE_CONTRACTS.md`, which names outcome, scope, routes/states, schema/ownership, authorization/lifecycle, commands/errors, concurrency, jobs, failures, tests, budgets, sequence, rollback, stop conditions, and evidence. A package still remains blocked if its stated prerequisite or provider/human gate is absent; the builder never invents policy.

| Package | Required prerequisites/gates | Required acceptance evidence |
|---|---|---|
| 1. Synthetic catalog foundation | Current bounded-slice contract; explicit coding start | Local reset, RLS allow/deny, deterministic 12-store bounded search/filter, visual/accessibility/browser proof, CI |
| 2. Identity, sessions, roles, audit, and account lifecycle | Auth provider/config contract; MFA/recent-auth/session/recovery screens; role/resource matrix | Account-enumeration, session rotation/revocation, MFA, wrong-role, RLS/function denial, atomic privileged audit, inactive warning/deletion jobs, shopper export, append-only audit tests |
| 3. Shopper-private actions, New Since, and correction intake | Package 2; private-field lifecycle/export contract | User A/User B isolation, JIT-auth return, save/rating/note deletion/Undo, coarse last-seen, scoped correction report and operational-queue tests |
| 4. Candidate Link and Candidate Share | Package 2; blocked/reported payload evidence and terminal cleanup decision | SSRF sandbox, reason-neutral timing/status, sender/recipient isolation, expiry/revoke/dismiss/block/report cleanup tests |
| 5A. Manual Trip Plan, collaboration, Go, and offline | Packages 2–3; completed-trip location and invitation lifecycle decisions | User-owned order, hours-only readiness warnings, trip ownership, stale-write conflict, one Navigator/device, ordered idempotent replay, revocation/purge, external-map handoff and Go journeys; no suggested route order |
| 5B. Browse map and provider-backed Check My Day | Package 5A; accepted mapping/routing ADR and algorithm/provider contract | Secondary accessible Browse map with mandatory list fallback/attribution plus minimized provider request, travel-time feasibility, explained suggestion, `Use Suggested Order`/`Keep My Order`, timeout/fallback, cost and no-optimality-claim tests |
| 6. Store Partner onboarding and Store Portal (Phase 2A) | Package 2; E-01 before real email; M-01 before any real media; public claims remain server-disabled until 10B | Application-atomic pending identity plus separate Auth binding; exact claim cardinality/signal/case scope; store-scope denial; text/hours/update/social/support; media-command absence until M-01 |
| 7. Administrator review, Access & Safety, and duplicate merge (Phase 2A) | Packages 2 and 6 | Typed review, recent-auth privileged action, revoke/regrant open-session denial, narrow audit, no shopper-private access, atomic merge/tombstone/rollback, and grant-quarantine/reverification proof |
| 8. Cross-phase Internal Alpha and External Testing Readiness | Packages 1–7 and 5B; H-01 protected shared environment; L-01 before shared privileged mutation (otherwise local-only cycles); E/M/S gates; HC-01; legal/insurance; break-glass disabled unless reviewer/runbook passes | Scott multi-role run, separate User B phone acceptance, synthetic-only evidence, full session/case/capability authorization, accessibility, DB/Auth/Storage recovery, rollback/incident, monitoring/support/on-call backup |
| 8B. Controlled Private Beta | Package 8; three sequential owner/store additions only | Initial cohort gate, each one-at-a-time expansion receipt, all three Store Partners passed, no public product promotion, separate Regional Public Readiness review opened |
| 9. Public reviews and moderation (Phase 2B) | Package 8; review/appeal/restriction/legal rules | Eligibility/aggregate; 60-second delete Undo; case-scoped moderation; human Synthetic dress rehearsal; stage-off route/RLS/RPC proof |
| 10A. Controlled Regional Readiness Evidence | Packages 1–9 including 8B; Package 10A Step 0 CAT-01 then accepted dependent gates; HC-02 preparation | Three-listing work forecast unlocks remaining work; fact-only catalog/cohort evidence; private/noindex promotion artifacts, consent, canonical URLs, aggregate-only campaign design; no public distribution |
| 10B. Regional promotion and release | Signed Package 10A; Product Owner; B-01/SEC-01/L-01/HC-02; 15-minute RPO/4-hour RTO; 99.5% availability | Same tested Direct Upload digest, exact catalog promotion, public registration/capabilities, DB/Auth/Storage restore, quota/cost stops, unpaid consented promotion, monitoring/rollback, dated receipt |
| 11. RG-01 Topeka success evidence | Signed 10B receipt, production smoke/monitoring pass, no active stop; no elapsed-time minimum; `rg01_collection` capability | Consent, authoritative deterministic formulas/exclusions, frozen/signed/superseding receipt, linkage purge/key destruction, Product Owner-only signature, zero automatic expansion |
| 12. One-community preparation/activation | Signed passing RG-01 plus separate Product Owner community selection | Reuse 10A/10B exact catalog, owner, consent, promotion, recovery/capacity and rollback controls for one area; Community Expansion Gate; stop after three communities for metro review |

Provider decision milestones: H-01 hosting before any shared environment; E-01 email before real verification/recovery/invitation/status; R-01 routing/geocoding before 5B; M-01 media before real upload; L-01 external audit anchor before privileged shared/external use; S-01 support/status before owner contact; SEC-01 independent security review and B-01 brand/domain before 10B; A-01 analytics before optional analytics (otherwise off). Each ADR records data sent, processor/region/retention, auth, quotas/hard cost cap, timeout/retry/idempotency, outage fallback, redacted observability, replacement/export, legal review, executable fixtures, and no-go outcome.

### Startup Learning MVP checkpoint (`SLM-01`)

After Packages 1, 2, 3, and 5A, stop for a private Synthetic-data checkpoint. Test User A and Agent-Assisted Shopper remain separate and both complete Browse → Details → Save → manual Review Hours → Trip → one Partner/Navigator → external-map Go → private memory without an outside planning document. Prove no lost input through refresh/offline replay, account isolation, and correct warning/travel-time comprehension; record elapsed planning time, manual retyping/tool switches, and return intent using the controlled baseline protocol in `USER_RESEARCH.md`. `Continue` requires the Product Owner to identify at least one reduced burden with no material regression in the others and both testers' stated reuse; privacy/authorization/data loss is `stop`; incomplete/misunderstood/no-supported-improvement is `revise` or `stop`. Package 4/5B/6/7, real store/owner/external-participant data, internal-tester data outside the approved minimum allowlist, shared public access, owner contact, promotion, and release remain unauthorized.

Package 10A authorizes only the evidence needed to decide Regional Public Readiness. Operations may create non-partner Topeka listings from manually verified public business facts under the approved provenance/license rules; descriptions, media, reviews, scraped/bulk-imported data, and owner-implying labels remain forbidden without rights. Listings remain staff-only until a two-person fact/provenance review makes them visible solely to the readiness cohort. Invite at most 20 independent Topeka adults by verified email; stop enrollment once at least eight attempt the core journey. Each person accepts the current test privacy notice and receives one cohort-scoped read/use grant expiring after 30 days; revocation or expiry denies the next request. The cohort is direct-invitation only, collects no precise location merely for evidence, and grants no public, partner, representative, or administrative access. Package 10A may gather evidence but cannot enable anonymous real-store access, public reviews, or public/production promotion.

The review subsystem uses a server-owned deployment-stage capability, not a frontend flag. `public_reviews_enabled` is false in Internal Alpha, all Private Beta environments, and Package 10A readiness evidence; routes return not found, reads return no rows, and writes are denied even if a client calls them directly. Only Package 10B migration/promotion may enable it after the Regional Public Readiness Gate. Package 9 development before release uses Synthetic Store/users in a non-pilot test environment.

Delivery ownership is by package even when one person fills every role: Product Owner approves product/release gates; Engineering Owner owns code, schema, migrations, and rollback; Security Owner approves threat/authorization evidence and incident rehearsal; Design/Accessibility Owner approves visual and cohort evidence; Operations Owner owns jobs, monitoring, support, backup/restore, and status communication. No owner may self-certify a failed executable gate; evidence and Product Owner disposition are recorded on the GitHub tracker.

Do not schedule Phase 4–5 features, D31 Audit History UI, Vendor Contributor, social-feed synchronization, or public Events until separately approved.

## Plan-review evidence

The first independent top-down review scored the plan 76/100. A hardening pass raised the fresh seven-lens score to 83/100 and exposed cross-document, first-slice, design, security, package-contract, and release-gate defects. Historical scores are evidence of review progression, not the current score.

Current deterministic plan checks must prove manifest coverage, local references, JSON parsing, clean diff whitespace, and stale-language absence before the final fresh review. The archival flow lab may be smoke-checked as concept provenance but cannot satisfy package interaction, visual, or acceptance evidence. After implementation begins, try the Codex in-app browser first; if localhost isolation prevents it, record the failure and use the bundled Playwright browser against the running build at phone and desktop widths. A successful source parse alone is insufficient. The final score and finding counts belong in `PLAN_ACCEPTANCE.md`, GitHub Issue #1, and the Obsidian project receipt only after a new seven-lens review of the complete current manifest.

No application code is authorized. Package 1 remains the only implementation starting point after a separate explicit Product Owner start instruction. Later package contracts are approved in `PACKAGE_CONTRACTS.md`, but each remains sequence-blocked until its listed prerequisites and preceding-package evidence pass.
