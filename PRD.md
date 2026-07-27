# Product Requirements Document

## Working title

**Antique Trail**

The final brand name has not been selected.

## Product type

- Public consumer Progressive Web App
- Mobile-first
- Desktop and tablet compatible
- Future Android packaging through Capacitor

## Product summary

Antique Trail helps people discover antique stores, evaluate whether those stores match their interests, plan efficient multi-store shopping trips, navigate one leg at a time, and privately record stores, finds, purchases, trips, and collections.

It is not merely a store directory. Its differentiator is the combination of:

1. Public antique-store directory and reviews
2. Personalized taste matching
3. Store-hours-aware trip planning
4. Active trip management
5. Private find and collection tracking

## Product vision

Help antique shoppers find stores they are likely to enjoy and visit more stores before they close.

The long-term product should be able to answer:

> We are visiting a city this weekend. Which antique stores fit our interests, in what order should we visit them, and which stops are unlikely to be worth our limited time?

## Primary users

### Antique shopper

Needs:

- Find nearby or route-adjacent antique stores
- See trustworthy hours and store details
- Save stores
- Review stores
- Build a preference profile
- Receive personalized recommendations
- Build and execute a multi-stop shopping trip
- Record possible purchases and collections privately

### Shopping partner or household member

Needs:

- Shared trip lists
- Separate opinions on finds
- Shared collections when explicitly enabled
- Individual preferences retained within a household

### Antique-store owner

Needs:

- Claim and verify a listing
- Correct business information
- Maintain hours and holiday hours
- Add official photos and descriptions
- Respond to reviews
- Post events
- See privacy-safe engagement analytics

### Moderator or administrator

Needs:

- Review reports and disputes
- Manage fraudulent or abusive reviews
- Verify business claims
- Audit sensitive administrative actions
- Correct duplicate, closed, or misleading listings

## Product goals

1. Maintain a useful, trustworthy antique-store directory.
2. Let users build a trip in under three minutes.
3. Optimize trips around opening hours, closing hours, drive time, browsing time, and user priorities.
4. Hand off the current destination to Waze or Google Maps in one tap.
5. Learn each user's store and merchandise preferences.
6. Keep private notes, finds, purchases, trips, and collections securely separated from public content.
7. Support regional store-partner marketing through flyers and QR codes.
8. Scale without rebuilding the authorization and data model.

## Non-goals for MVP

- Native turn-by-turn navigation
- Automatic antique authentication
- Professional appraisal
- Marketplace transactions
- Nationwide social network
- Background location tracking
- General-purpose road-trip planning
- AI-first antique identification as the main product

## Rating model

The application has three separate rating concepts.

### Public store rating

A public aggregate from user reviews.

Example:

> 4.6 ★ · 328 reviews

### Personal store rating

A private rating belonging to the user.

Example:

> Your rating: 5 ★

### Personal match score

A recommendation estimate based on the user's private profile and store attributes.

Example:

> 92% match for you

These values must never be merged or presented as interchangeable.

## Public store directory

Public store records may include:

- Name
- Address
- Coordinates
- Phone
- Website
- Social links
- Regular hours
- Holiday-hour overrides
- Store type
- Public rating and review count
- Category tags
- Public photos
- Accessibility details
- Estimated size
- Estimated browsing time
- Last verified date
- Active, temporarily closed, or permanently closed status
- Claimed or unclaimed listing status

## Store categories and attributes

Possible tags:

- Antique mall
- Curated vintage
- Furniture
- Architectural salvage
- Primitive
- Mid-century
- Transferware
- Stoneware
- Copper and brass
- Books
- Advertising
- Collectibles
- Clothing
- Jewelry
- Industrial
- Garden
- Repurposed
- Home décor
- Tools
- Toys
- Kitchenware
- Seasonal

Possible evaluation attributes:

- Furniture quality and variety
- Curated presentation
- Repurposing potential
- Architectural salvage
- Primitive inventory
- Mid-century inventory
- China and pottery
- Metalware
- Collectibles
- Value
- Inventory turnover
- Inspiration

Users choose which attributes matter to them.

## Onboarding and taste profile

New users should answer a short preference survey.

Example questions:

- What categories do you shop for?
- What store types do you prefer?
- Which styles or eras interest you?
- How far will you travel for a strong match?
- How long do you typically browse?
- Do you prefer large malls or small curated stores?
- Which categories do you generally avoid?

The taste profile should improve through:

- Public and personal ratings
- Saved stores
- Hidden stores
- Visit history
- Saved finds
- Purchases
- Search and category behavior
- Explicit feedback on recommendations

## Core workflow

1. Open the app.
2. Browse nearby stores or search a destination.
3. Add candidate stores to Today's Trip.
4. Enter departure time and optional return destination.
5. Review the proposed order.
6. Start the trip.
7. Open the current stop in Waze or Google Maps.
8. Mark arrived, completed, skipped, or closed.
9. Adjust browsing time if needed.
10. Recalculate remaining stops.
11. Save visit notes or finds.
12. Complete and save the trip.

## Trail Map requirements

The map must support:

- Search
- Current area
- Pins
- Clustering
- Public ratings
- Personal match indicators
- Open-now filtering
- Visited/unvisited filtering
- Saved-store filtering
- Category filtering
- Distance filtering
- State or region filtering
- Claimed-store status
- Store detail preview
- Add to trip
- Navigate
- Save

## Today's Trip requirements

### Inputs

- Start location
- Departure time
- Candidate stores
- Expected browsing time
- Optional return destination
- Required stops
- Optional food or rest stops
- User priority for each stop
- Maximum drive distance or total trip duration

### Planning factors

- Opening and closing time
- Holiday or special-event hours
- Travel time
- Expected browsing duration
- User priority
- Personal match score
- Required stops
- Backtracking
- Return destination
- Whether a store can reasonably be reached before closing

### Output

For every stop:

- Order
- Estimated arrival
- Store closing time
- Planned browsing time
- Estimated departure
- Drive time to next stop
- Schedule risk indicator
- Reason for placement in route

### Active-trip actions

- Start
- Navigate
- Arrived
- Completed
- Skipped
- Closed
- Extend visit
- Shorten visit
- Add stop
- Remove stop
- Reorder
- Recalculate
- End trip

The application owns the itinerary. Waze or Google Maps owns turn-by-turn navigation for the current leg.

## Store details requirements

Each store profile must support:

- Public business details
- Public average rating
- Review count
- Approved reviews
- Official owner response
- Public photos
- Store tags and attributes
- Hours and exceptions
- Last verified date
- Report incorrect information
- Claim listing
- Save
- Add to trip
- Navigate
- Personal rating
- Private notes
- Visit history
- Private finds and purchases

## Review requirements

- One active public review per user per store
- A user may edit their own review
- Review edit history retained internally
- Rating from 1 to 5
- Optional review text
- Optional public photos submitted separately
- Report action
- Moderation status
- Store-owner response
- Conflict-of-interest disclosure
- Rate limiting
- Bot and spam defenses
- No paid improvement of public rating
- Aggregate updates executed server-side

## Find capture

Users may privately record an item while shopping.

Required:

- Photo
- Store
- Description
- Asking price
- Status

Optional:

- Booth or dealer
- Measurements
- Category
- Estimated age
- Condition
- Negotiated price
- Potential room or use
- Partner votes
- Pickup requirements
- Seller contact
- Additional photos

Statuses:

- Considering
- Buy now
- Ask partner
- Need measurements
- Need to check space
- Purchased
- Passed
- Sold before decision

## Household sharing

Optional household functionality:

- Invite members
- Shared trips
- Shared saved-store lists
- Shared finds when explicitly selected
- Shared collections when explicitly selected
- Individual preferences remain separate
- Individual votes remain visible
- Membership revocation immediately removes access

## Collection tracking

Private by default.

Fields:

- Name
- Photos
- Category
- Approximate age
- Original purpose
- Current purpose
- Purchased from
- Purchase date
- Purchase price
- Dimensions
- Room or location
- Condition
- Restoration
- Related items
- Story or notes
- Optional insurance value

## Business accounts

Verified Store Representatives may directly publish for their assigned store:

- Maintain regular and holiday hours
- Maintain phone and website
- Maintain official description
- Mark temporary closure

Verified Store Representatives must submit a Store Change Request for:

- Store name
- Address or coordinates
- Ownership
- Permanent closure
- Category tags
- Public photos

Subject to separate feature requirements, verified Store Representatives may:

- Respond to reviews
- Add events
- View aggregated privacy-safe engagement metrics

Store Representatives may not:

- Edit or delete user reviews
- Access private notes
- Access private trips
- Access saved finds
- Access home collections
- Access precise user location history
- Buy a higher public rating
- Identify anonymous browsing behavior

### First Store Partner onboarding

- Demonstrate with Synthetic Stores only
- Obtain Store Partner Pilot Consent before creating a real store record or representative account
- Verify representative authority in person and through a published business contact
- Require an owner-controlled verified email and MFA; prohibit shared credentials
- State that participation is voluntary, invitation-only, unpaid, non-endorsing, and not public advertising
- On withdrawal, revoke representative access and remove the real store from the active pilot
- Audit onboarding, scope grants, withdrawal, and revocation

### First Pilot Store Record

- Administrator creates the record only after Store Partner Pilot Consent and authority verification
- Owner confirms name, address, phone, website, regular and holiday hours, official description, and category tags
- Record source/provenance and verification date
- Restrict visibility to invited Private Beta participants; deny anonymous/public access
- Representative tests only Representative-Managed Fields; Controlled Store Fields still require Store Change Requests
- Exclude photos, ratings/reviews, events, owner responses, and analytics

### Initial Private Beta Cohort

- Scott: separate shopper and Administrator accounts
- Scott's wife: separate shopper account
- First owner: Store Representative account only
- One Pilot Store Record
- Owner shopper activity requires a separately approved shopper account
- AI and Agent-Assisted Test Accounts remain restricted to Synthetic Store data
- No additional user or real store before a separate expansion gate passes

### Initial Private Beta Expansion Gate

- Owner completes Representative-Managed Field edits, submits two Store Change Requests respectively approved and rejected by the Administrator, uses MFA, and participates in scheduled revoke/regrant testing
- Scott and the Independent Internal Tester each complete two shopper trip runs containing the Pilot Store Record
- Support and feedback intake works
- Privileged audit records are complete
- Monitoring, backup restore, and rollback checks remain passing
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Owner confirms that the workflow is understandable
- Primary Internal Tester approves dated evidence for every check
- No minimum calendar duration; any failed check blocks expansion

### Controlled Private Beta Expansion

- Add one verified Store Partner and one Pilot Store Record at a time
- Repeat consent, authority verification, onboarding, owner workflow, shopper-trip, security, audit, support, and recovery checks for each addition
- Do not add the next store until the current addition passes
- Cap at three total Store Partners and Pilot Store Records
- Remain invitation-only with no public advertising
- After all three pass, stop and conduct a separate public-readiness review
- Do not treat pilot passage as authorization for public access

### Store Partner Invitation

- Administrator requires MFA and recent authentication to generate an invitation in person after a Synthetic Store demonstration and verbal interest
- Display a QR code containing only an opaque random token; no owner, store, email, or role data
- Expire after 30 minutes or one successful redemption; allow Administrator revocation and regeneration
- Open the existing PWA partner-onboarding page; do not directly install the PWA or grant a role
- Obtain Store Partner Pilot Consent before creating the Pending Partner Identity
- Verify owner-controlled email and configure MFA
- Keep the identity pending with no store role, scope, or pilot-data access
- Administrator independently verifies authority through the published business contact and approves
- Only after approval, create the Pilot Store Record and grant the store-scoped Store Representative role
- Show device-appropriate PWA installation instructions after approved sign-in
- Audit generation, expiry, revocation, redemption, consent, verification, approval, role grant, and installation handoff

## Moderation

The product requires:

- Review reporting
- Photo reporting
- Store-information disputes
- Moderation queue
- Internal case notes
- Appeal process
- Soft deletion
- Audit trail
- Repeat-abuse controls
- Store-owner dispute workflow
- Duplicate-store merge workflow

## Internal Alpha

Stages:

- Solo Agent-Assisted Alpha: the Primary Internal Tester operates every separate role account; AI Test Agents may execute supervised repeatable tests but cannot replace human acceptance or approve a gate
- Two-Person Acceptance: the Independent Internal Tester completes shopper acceptance on her own phone using a newly created Test User B account; no solo-stage account is reassigned to her
- No store owner, real store, or external participant before both stages and the separately approved External Testing Readiness gate pass; afterward, invite one consenting Store Partner representative into controlled Private Beta before public access

Required:

- Four-role authentication: Test User A, Test User B, Representative Test Account, and Administrator Test Account
- Optional Agent-Assisted Shopper Account for isolated user-two simulation during Solo Agent-Assisted Alpha
- Synthetic Store directory, search, map, details, and hours
- Private saved stores, personal ratings, and notes
- Hours-aware trip planning
- Active-trip navigation handoff
- Offline active-trip recovery
- Store Representative direct publishing and Store Change Requests
- Administrator approval and representative-role management
- Audit records for privileged actions

Excluded:

- Real stores or external participants
- Public ratings, reviews, or photos
- Households
- Finds and collections
- Events
- Notifications
- Owner analytics
- Advanced personalization

Shopper-trip exit gate:

- Primary Internal Tester as Test User A and Independent Internal Tester as Test User B each complete three successful Shopper Trip Acceptance Runs on separate accounts and phones
- Each account proves active-trip recovery after refresh or app restart and while offline in at least one run
- The six runs collectively exercise navigation handoff, arrived/completed/skipped/closed stop states, and route recalculation
- AI-assisted or Primary Internal Tester runs as Test User B are supplemental and cannot replace the Independent Internal Tester's runs
- Zero Blocking Defects
- Zero cross-account exposure or modification of shopper-private data

Privileged-workflow exit gate:

- Primary Internal Tester operates two complete Privileged Workflow Acceptance Cycles; Independent Internal Tester is not required to operate privileged accounts
- Every Representative-Managed Field publishes directly for the assigned Synthetic Store
- At least one Store Change Request is approved and one rejected; unapproved Controlled Store Fields remain unpublished
- Representative self-approval is denied
- Administrator uses a separate MFA-protected session to grant and revoke the representative's store scope
- Revocation denies further writes from the representative's existing session
- Every privileged action has an audit record
- Representative and Administrator Test Accounts cannot read or modify Test User A or Test User B shopper-private data
- Zero Blocking Defects; every allowed action succeeds and every forbidden action is denied

External Testing Readiness gate before first-owner contact:

- Dated passing evidence for Solo Agent-Assisted Alpha and Two-Person Acceptance
- Complete authorization and security test set passes
- Zero open Blocking Defects or known privacy, security, or data-loss defects
- Backup restore and rollback rehearsals pass
- Pilot-environment monitoring, error reporting, and support intake work
- Pilot privacy notice and owner consent are ready
- One External Testing Dress Rehearsal passes
- Primary Internal Tester approves every check; AI Test Agents may collect evidence but cannot approve the gate

## MVP

Required:

- Public directory
- Search and map
- Store details
- User authentication
- Private saved stores
- Public ratings and reviews
- Personal ratings
- Basic preference onboarding
- Today's Trip
- Hours-aware route ordering
- Schedule warnings
- Active trip
- Waze and Google Maps handoff
- Basic visit history
- PWA installation
- Offline active trip
- Secure database policies
- Moderation basics
- Listing claim intake

Strongly preferred:

- Household accounts
- Find capture
- Public photos
- Store-owner verification
- Push or in-app schedule warnings

Excluded:

- AI valuation
- AI authentication
- Social feed
- Marketplace
- Nationwide launch
- Android store release
- Background location history

## Success metrics

- Trip creation under three minutes
- Navigation handoff in one tap
- Visit review under one minute
- Find capture under 30 seconds
- Accurate warning when a stop is unlikely before closing
- No private-data exposure
- Offline active trip continuity
- Store data verification rate
- Percentage of recommendations later rated positively
- User retention across multiple trips
- Number of store claims
- Number of participating flyer locations

## Regional launch strategy

Launch dense, not broad.

Suggested initial area:

- Topeka
- Kansas City metro
- Wamego and surrounding northeast Kansas
- Wichita
- Joplin
- Oklahoma City

Exact launch geography should be validated before implementation.

The seeded store database may include known stores from product discovery, but all seeded records must use public business information only. No private household ratings or notes should be included.
