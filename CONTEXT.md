# Antique Trail

Antique Trail is a public regional product for discovering antique stores, planning shopping trips, and keeping personal shopping records private.

## Language

**Private Beta**:
A controlled-access pre-release used to prove directory and trip-planning behavior without public user-generated content.
_Avoid_: Public beta, public MVP

**Startup Free Stage**:
Local development, Shared Synthetic Alpha, SLM-01, and any Controlled Private Beta only while applicable controls run at `$0` recurring infrastructure with no automatic paid overage. A free service that cannot prove the stage gate blocks that stage.
_Avoid_: Free forever, weakened recovery

**Startup Learning MVP (`SLM-01`)**:
The private Synthetic-data checkpoint after Packages 1, 2, 3, and 5A proving separate-account Browse → Details → Save → manual Review Hours → Trip/Partner/Navigator → external-map Go → private memory. It authorizes no real store, external participant, provider routing, public review, promotion, or release.
_Avoid_: Regional Public MVP, first coding slice

**Internal Alpha**:
A pre-partner product stage limited to designated Internal Testers using Synthetic Stores on personally controlled devices.
_Avoid_: Private Beta, public preview

**Internal Tester**:
A trusted person authorized to use the Internal Alpha; Internal Testers are not external Beta Testers or Store Partner representatives.
_Avoid_: Beta Tester, Store Partner

**Primary Internal Tester**:
Scott, who operates all separate role accounts during the Solo Agent-Assisted Alpha and performs the privileged-workflow acceptance tests.
_Avoid_: Independent Internal Tester, AI Test Agent

**Independent Internal Tester**:
Scott's wife, who later performs independent shopper acceptance on her own phone and Test Account before any external testing.
_Avoid_: AI Test Agent, Store Partner

**Solo Agent-Assisted Alpha**:
The first Internal Alpha stage, in which the Primary Internal Tester operates separate shopper, representative, and administrator accounts while an AI Test Agent may execute supervised repeatable tests.
_Avoid_: Two-Person Acceptance, Private Beta

**AI Test Agent**:
Automation supervised by the Primary Internal Tester that may execute repeatable test actions and collect evidence but cannot substitute for independent human acceptance or approve a release gate.
_Avoid_: Internal Tester, Administrator

**Two-Person Acceptance**:
The final Internal Alpha stage, in which the Independent Internal Tester completes the required shopper tests using her own account and phone. Store owners and other external participants remain excluded.
_Avoid_: Solo Agent-Assisted Alpha, Private Beta

**External Testing Readiness**:
A release-blocking pre-pilot gate requiring both Internal Alpha stages, authorization/security tests, clean defect status, recovery rehearsals, operational monitoring/support, pilot privacy and consent materials, and an External Testing Dress Rehearsal to have dated passing evidence approved by the Primary Internal Tester. Passing permits invitation of one consenting Store Partner representative into the controlled Private Beta; it does not authorize public access or product promotion.
_Avoid_: Public launch, automatic approval

**External Testing Dress Rehearsal**:
One end-to-end Synthetic Store exercise covering representative invitation, verified sign-in and MFA, store-scope grant, representative-managed publishing, controlled-change approval and rejection, scope revocation, access denial, audit review, support intake, and rollback without using a real owner or store.
_Avoid_: Owner outreach, production pilot

**Test Account**:
A distinct Internal Alpha user identity whose synthetic private data and actions remain isolated from every other Test Account.
_Avoid_: Shared login, household account

**Agent-Assisted Shopper Account**:
A temporary shopper Test Account used only during Solo Agent-Assisted Alpha by the Primary Internal Tester or a supervised AI Test Agent. It is never reassigned to the Independent Internal Tester and its results do not replace Two-Person Acceptance.
_Avoid_: Test User B, shared account

**Synthetic Store**:
A clearly fictional store record that models a business type or workflow without copying or implying affiliation with a real business.
_Avoid_: Seed store, Prospective Store Partner

**Store Browser**:
The list-first public front door for finding stores by name, town or area, and category, with an optional map view. It must work without device-location permission and lead directly to Store Details, Save, or Add to Trip.
_Avoid_: Map-only discovery, trip planner home

**Official Store Profile Photo**:
A storefront or interior image supplied by an authorized Store Partner or otherwise used with specific documented permission. It is approved as a Controlled Store Field before display and is not Public User-Generated Content.
_Avoid_: Shopper photo, copied website screenshot, social-media scrape

**Age-Inclusive Usability Baseline**:
The product-wide interaction and presentation rules designed first for shoppers roughly 50–80+ while remaining usable by all ages: readable defaults, large targets, plain labels, predictable flows, non-color-only status, accessible image alternatives, and no map-only, drag-only, or time-pressured task.
_Avoid_: Senior mode, separate older-user interface

**Regional Public MVP**:
The first publicly accessible release, limited to Topeka city limits, after Packages 1–10B and every provider/human/release gate. It includes Store Browser, approved Official Store Profile Photos only after M-01, private account basics, text-only public reviews, verified store claims, trip planning, and consent-based product promotion. Finds, households, personalization, shopper/review photos, and owner review responses are excluded.
_Avoid_: Private beta, national launch

**Route Location Disclosure**:
The explicit notice that a user-requested route sends only its necessary coordinates to the named routing provider. It never authorizes background tracking, analytics/log collection, or unrelated sharing.
_Avoid_: Location consent, background tracking

**Candidate Link**:
An HTTP or HTTPS URL and optional sender note captured privately as a possible store, sale, inventory page, or event lead. Extracted facts are unverified suggestions and the link is never a public listing, Public User-Generated Content, or proof of a Store Partner relationship.
_Avoid_: Verified listing, public event, scraped catalog record

**Candidate Share**:
One Candidate Link sent by one authenticated shopper to one named authenticated recipient. The recipient may accept or dismiss only that share; neither account gains access to the other's private ideas, trips, notes, ratings, or profile.
_Avoid_: Household sharing, shared account, public link

**Trip Idea**:
A recipient-owned private candidate created after a Candidate Share is accepted or a shopper captures a link directly. It retains source provenance and may be reviewed, corrected, and added to a trip, but cannot publish a store or event record.
_Avoid_: Public listing, shared household list, verified store

**Public User-Generated Content**:
Shopper-created ratings, review text, or media made visible to other users or anonymous visitors.
_Avoid_: Personal content, owner content

**Pilot Area**:
A small geography selected for in-person shop outreach and controlled Private Beta validation before public product promotion.
_Avoid_: Launch region, service area

**Prospective Store Partner**:
A local antique shop considered for outreach but not yet participating; candidate status never implies endorsement or agreement.
_Avoid_: Partner, vendor

**Store Partner**:
An antique shop whose authorized owner or manager explicitly agrees to participate and provide product feedback.
_Avoid_: Vendor, beta tester

**Store Partner Pilot Consent**:
Plain-language written consent submitted before any Store Representative scope or real store record. One application transaction consumes the invitation and creates provisional consent plus an application-only Pending Partner Identity; Supabase Auth signup/sign-in, verified email, MFA, and one-time binding then finalize the receipt. It states participation is voluntary, invitation-only, unpaid, non-endorsing, and non-advertised; identifies permitted store data/contact and withdrawal.
_Avoid_: Verbal interest, public partnership

**Pilot Consent Receipt**:
An immutable, versioned record and owner copy finalized only after email verification and MFA. It binds the immutable provisional consent submission to the required acknowledgments, typed name, business title, store name, verified email, finalization timestamp, invitation identifier, and policy version. Material term changes require a new receipt.
_Avoid_: Editable admin note, verbal confirmation

**Store Partner Invitation**:
An Administrator-generated, 30-minute, single-consumption QR invitation containing only an opaque random token. Its hash is consumed only by the atomic provisional-consent/Pending Partner Identity transaction. It opens onboarding but grants no role, store scope, or pilot-data access.
_Avoid_: Download code, role grant, public QR code

**Representative Activation Handoff**:
The post-approval owner experience: a status-only email links to normal PWA sign-in, verified-email/MFA authentication opens the exact approved store scope, and a guided first-login checklist starts pilot acceptance work.
_Avoid_: Magic role link, emailed access token

**Pilot Support Ticket**:
A pilot-restricted Store Partner request categorized as bug, confusing workflow, store-data correction, feature idea, or security/privacy concern. It contains minimized diagnostics, optional owner-previewed media, authenticated replies, and an owner-visible resolution history.
_Avoid_: Public review, internal log dump

**Pending Partner Identity**:
An application-only unprivileged onboarding record created atomically with provisional consent and invitation consumption. Supabase Auth remains separate; a current verified-email/MFA user binds once through a purpose-specific email HMAC before the receipt/draft. Unbound records expire after 30 days. It never has Store Representative scope or Pilot Store Record access.
_Avoid_: Store Representative, approved claim

**Pilot Store Draft**:
Owner-submitted onboarding data for a proposed Pilot Store Record. It is visible only to its Pending Partner Identity and Administrators, may move through draft, submitted, changes-requested, resubmitted, or approved states, and never grants pilot access by itself.
_Avoid_: Pilot Store Record, public listing

**Pilot Store Record**:
The first real Store Partner listing, created by an Administrator only after Store Partner Pilot Consent. It contains owner-confirmed core listing data with provenance and verification date, may display approved Official Store Profile Photos, is visible only to invited Private Beta participants, and excludes Public User-Generated Content.
_Avoid_: Synthetic Store, public listing

**Store Data Provenance**:
The evidence for each catalog fact: Store Partner confirmation or manual verification from an official public business source, together with the source reference, verifier, and verification date.
_Avoid_: Copied listing, Google Places snapshot

**Listing Freshness**:
The trust state derived from the oldest required core fact group—identity/location, contact, hours, or categories/attributes. Each group has independent provenance and verification time; editing one refreshes only that group. The listing is verified through day 180, overdue and excluded from hours-dependent route promises through day 365, then hidden from normal discovery until every core group is reverified. Optional media/social freshness does not stale the listing; records and provenance are never automatically deleted.
_Avoid_: Permanent verification, automatic deletion

**Initial Private Beta Cohort**:
The first controlled external test: Scott's separate shopper and administrator accounts, Scott's wife's separate shopper account, and one Store Partner representative account, with one Pilot Store Record. AI accounts, additional users, and additional real stores are excluded.
_Avoid_: Public beta, open signup

**Initial Private Beta Expansion Gate**:
A Primary Internal Tester-approved evidence gate that the first owner workflow, shopper use of the Pilot Store Record, support, auditing, monitoring, recovery controls, and defect status all passed before any additional user or real store may be added. It has no minimum calendar duration.
_Avoid_: Automatic expansion, public launch gate

**Controlled Private Beta Expansion**:
The post-gate addition of one verified Store Partner and one Pilot Store Record at a time, using the same onboarding and acceptance checks, capped at three total Store Partners before the Regional Public Readiness Gate.
_Avoid_: Bulk onboarding, public launch

**Regional Public Readiness Gate**:
Dated Product Owner approval that all three controlled Store Partners, Packages 1–10A, Topeka catalog density, independent-shopper evidence, browser/accessibility, legal, human capacity, security, support, incident, stage-applicable recovery, hosting/cost, and promotion-artifact checks passed with zero Blocking Defects. It is required before Package 10B public deployment, promotion, or anonymous real-store access. The public 15-minute RPO/four-hour RTO is a separate Package 10B prerequisite and is not implied by the 10A signature.
_Avoid_: Pilot completion, automatic launch

**RG-01**:
The Package 11 Topeka-to-small-community evidence gate. It is separate from D30 Access & Safety and uses authoritative consenting data, fixed formulas/targets, a maximum 180-day window, a frozen signed Product Owner receipt, and linkage purge. Passage never selects or activates a community.
_Avoid_: Product Decision 30, open-ended success metric

**One-Community Activation**:
One repeatable Package 12 per-area run after RG-01. Run 1 needs a separate Product Owner choice; runs 2–3 also need the prior community's passing postactivation Community Expansion Gate. Each run privately prepares one anchor owner and at least two listings, reuses Package 10A/10B catalog, promotion, recovery, consent, and rollback controls, signs preactivation readiness, then activates only that area.
_Avoid_: Automatic geography, bulk owner contact, Kansas City shortcut

**Product Promotion**:
Consent-based unpaid promotion of Antique Trail itself after Package 10B through ordinary public flyers/QRs, permissioned local channels, organic search, and canonical Store sharing. It cannot buy ranking, verification, ratings, or shopper data.
_Avoid_: Paid placement, advertising product, partner implication

**Campaign Aggregate**:
A daily count tied only to an allowlisted opaque source code for campaign opens, Store Details opens, or public Share actions. It contains no cookie, device/account identifier, fingerprint, precise location, or shopper linkage and deletes after 180 days unless frozen as a signed gate total.
_Avoid_: User analytics, attribution profile

**Small-Community Expansion**:
The second regional growth stage after the Topeka public launch, adding one Eligible Small Community at a time before considering a larger metro. It stops after three communities for a separate larger-metro readiness review.
_Avoid_: Kansas City launch, statewide expansion

**Eligible Small Community**:
A community outside a larger metro, roughly within a 60-minute drive of Topeka, with at least two antique or vintage shops and one willing anchor Store Partner before activation.
_Avoid_: Any nearby town, metro suburb

**Community Expansion Gate**:
A dated Primary Internal Tester approval that one active small-community rollout has passed its store, partner, shopper, support, monitoring, data-accuracy, and defect checks before another community may be activated.
_Avoid_: Automatic regional expansion, time-based gate

**Store Representative**:
An authorized owner or manager who acts for one Store Partner; Internal Alpha simulates this role against one Synthetic Store.
_Avoid_: Vendor, store account

**Representative Test Account**:
A distinct Internal Alpha account scoped to one Synthetic Store and operated by the Primary Internal Tester to test Store Representative permissions without granting shopper-private access.
_Avoid_: Shopper account, shared owner login

**Administrator Test Account**:
A distinct privileged Internal Alpha identity that reviews Store Change Requests, grants or revokes representative roles, and inspects audit records without shopper-private access.
_Avoid_: Moderator, Representative Test Account

**Shopper Trip Acceptance Run**:
One complete Synthetic Store shopper journey performed by Test User A or Test User B on that tester's phone: discover stores, inspect details and hours, create private records, build and run an hours-aware trip, hand off navigation, update stop status, recalculate, and recover the active trip.
_Avoid_: Spot check, demo

**Blocking Defect**:
A defect that prevents a required acceptance journey from completing or causes required data to be lost, corrupted, or exposed to the wrong account.
_Avoid_: Cosmetic defect, non-blocking defect

**Privileged Workflow Acceptance Cycle**:
One complete Internal Alpha authorization test operated by the Primary Internal Tester in which an Administrator Test Account grants one Synthetic Store scope, a Representative Test Account directly publishes allowed fields and submits controlled changes, the administrator approves and rejects requests, the administrator revokes the scope, and the existing representative session is denied further writes; every privileged action is audited and shopper-private data remains inaccessible.
_Avoid_: Owner demo, happy-path test

**Representative-Managed Field**:
A public store field that its Store Representative may publish directly: regular hours, holiday hours, phone, website, official description, or temporary closure.
_Avoid_: Controlled Store Field

**Controlled Store Field**:
A store identity, location, ownership, permanence, classification, or public-media field that requires approval before publication.
_Avoid_: Representative-Managed Field

**Store Change Request**:
A proposed change to a Controlled Store Field that remains unpublished until an authorized reviewer approves it.
_Avoid_: Direct edit, correction report

**Trip Creator**:
The authenticated shopper who owns one trip, may invite one Trip Partner, and may assign either participant as Navigator before the trip starts.
_Avoid_: Household owner, Navigator

**Trip Partner**:
One authenticated shopper granted access to one shared trip through a verified-email-bound, seven-day, single-use invitation. The role grants no access to other trips or private history.
_Avoid_: Household member, shared account

**Navigator**:
The one trip participant authorized to control Go mode. The other participant sees read-only progress; private ratings and notes remain separate.
_Avoid_: Trip Creator, driver profile

**Store Update**:
A native Store Representative post of type New Finds, Sale, Announcement, or Store News. Text may publish directly; any image remains unpublished until Administrator image approval.
_Avoid_: Social feed, public Event, shopper post

**Official Social Profile Link**:
One validated external link to a Store Partner's official Facebook, Instagram, YouTube, Pinterest, or TikTok business profile. It contains no social credential, embed, synchronized feed, or imported tracking.
_Avoid_: Social login, embedded feed

**New Since Your Last Visit**:
An authenticated in-app catalog-freshness card derived from a coarse last-seen timestamp and manually selected area. It is not a push/email notification or location-tracking feature.
_Avoid_: Notification center, nearby alert

**Administrator Review Workspace**:
One readable type-aware screen for reviewing onboarding, store changes, images, or support with exact context, previews, type-specific actions, required reasons, and audit records.
_Avoid_: Bulk approval dashboard, submitted-field editor

**Access & Safety**:
The Administrator area for scoped Store Representative invitations, grants, revocation, regrant, and related audit activity. It never exposes shopper activity.
_Avoid_: User management dashboard, account deletion

**Beta Tester**:
An invited person who uses the Private Beta and provides feedback; a Store Partner's owner or manager may be a Beta Tester.
_Avoid_: Store, partner business
