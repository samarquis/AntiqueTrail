# Antique Trail

Antique Trail is a public regional product for discovering antique stores, planning shopping trips, and keeping personal shopping records private.

## Language

**Private Beta**:
A controlled-access pre-release used to prove directory and trip-planning behavior without public user-generated content.
_Avoid_: Public beta, public MVP

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
A release-blocking pre-pilot gate requiring both Internal Alpha stages, authorization/security tests, clean defect status, recovery rehearsals, operational monitoring/support, pilot privacy and consent materials, and an External Testing Dress Rehearsal to have dated passing evidence approved by the Primary Internal Tester. Passing permits invitation of one consenting Store Partner representative into the controlled Private Beta; it does not authorize public access or advertising.
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

**Regional Public MVP**:
The first publicly accessible release, limited to one approved region; it includes text-only public ratings and reviews after moderation and abuse controls pass.
_Avoid_: Private beta, national launch

**Public User-Generated Content**:
Shopper-created ratings, review text, or media made visible to other users or anonymous visitors.
_Avoid_: Personal content, owner content

**Pilot Area**:
A small geography selected for in-person shop outreach and controlled Private Beta validation before public advertising.
_Avoid_: Launch region, service area

**Prospective Store Partner**:
A local antique shop considered for outreach but not yet participating; candidate status never implies endorsement or agreement.
_Avoid_: Partner, vendor

**Store Partner**:
An antique shop whose authorized owner or manager explicitly agrees to participate and provide product feedback.
_Avoid_: Vendor, beta tester

**Store Partner Pilot Consent**:
Plain-language written consent signed before any real store record or representative account is created. It states that participation is voluntary, invitation-only, unpaid, non-endorsing, and non-advertised; identifies permitted store data and contact; and explains withdrawal.
_Avoid_: Verbal interest, public partnership

**Pilot Store Record**:
The first real Store Partner listing, created by an Administrator only after Store Partner Pilot Consent. It contains owner-confirmed core listing data with provenance and verification date, is visible only to invited Private Beta participants, and excludes public user-generated or promotional features.
_Avoid_: Synthetic Store, public listing

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

**Beta Tester**:
An invited person who uses the Private Beta and provides feedback; a Store Partner's owner or manager may be a Beta Tester.
_Avoid_: Store, partner business
