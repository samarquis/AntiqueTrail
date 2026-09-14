# Product Requirements Document

## Purpose, people, and product promise

Antique Trail makes a fun day of antique shopping easy to see, easy to plan, and easy to trust. It brings store discovery, trip planning, and personal shopping memory into one connected experience.

## What it is

A public Progressive Web App, mobile-first, desktop and tablet compatible. Users browse antique shops, plan day trips, visit stores, and leave reviews. Store owners can claim their listing and manage their profile.

## Core users

**Shoppers** — browse stores, save favorites, plan trips, leave reviews.

**Store Owners** — claim a listing, manage photos and hours, post updates.

## Core features

### 1. Browse stores

- List-first browsing with search by name, town, and category
- Each store shows: cover image, name, town, category summary, hours, open/closed state
- Store details page: photos, hours, description, contact, social links, reviews
- No sign-in required to browse

### 2. Save and trip planning

- Save stores to favorites
- Create a trip: name, date, area
- Add stores to a trip, arrange order
- Set expected browsing time per stop
- Review hours before going

### 3. Go mode

- Start a trip, navigate to current stop
- Hand off to Google Maps or Waze for directions
- Mark arrived, mark done, move to next stop
- End trip early if needed

### 4. Reviews and ratings

- Rate stores 1-5 stars
- Write text reviews
- See public rating on store pages
- Personal ratings and notes visible only to the author

### 5. Store portal

Stores claim their listing and manage it:

**Free tier:**
- Claim listing (name, address, hours, phone, website)
- Upload up to 5 photos per month
- Post text updates (sales, announcements)
- Link social media (Facebook, Instagram, etc.)

**Paid tier ($30/month):**
- Unlimited photo uploads
- Photos appear on the store's photo wall

### 6. User accounts

- Create account to save favorites and access filtered stores
- Account-based preferences for nearby stores
- Just-in-time sign-in: browse without account, sign in when saving

## Tech stack

- React + TypeScript + Vite PWA
- Supabase (PostgreSQL, Auth, Storage)
- Stripe for paid memberships
- Hosted on Vercel (hobby tier during testing)

## Current status

Working in beta. The public test exposes browsing only. Trip planning, Go mode, offline-cached trips, trip-partner sharing, map view, and reviews with moderation are built; partner sharing, offline, the map, and reviews are gated off for the catalog-only public test. Plan to move to paid hosting and purchase domain after beta.

## Future considerations (not built yet)

- More store attributes and categories
- Store owner responses to reviews

## Non-goals

- Marketplace transactions
- Turn-by-turn navigation
- AI antique identification
- Social network features
- Background location tracking

## Stage dependencies

Browse, details/photos, optional saves, and exact-store representative publishing support the internal store showcase and the controlled invited pilot. Trips, public reviews (with moderation), Candidate Share, visit memory, personalization, collections, and Android packaging remain deferred. See [capability stage applicability](docs/specs/product-capabilities.md#stage-applicability) and [security stage applicability](SECURITY_AND_TRUST.md#store-first-stage-applicability).

## Deferred implementation boundary

The sole current exception to deferral is the repository-controlled local invitation diagnosis, minimal invitation ACL repair, accepted-partner removal repairs, and joined verification for #321/#342/#343/#344/#365. It exposes no trips and authorizes no adjacent trip work. Security and data-lifecycle obligations still apply to retained data and every reachable path.

## Public test publication

The owner-authorized bounded free public test follows [ADR 0010](docs/adr/0010-free-public-test-publication.md). The stable entry is `https://antique-trail.vercel.app/`. Anonymous visitors browse the synthetic catalog; admission criteria and boundaries are in [public test admission](docs/operations/PUBLIC_TEST_ADMISSION.md), [security](SECURITY_AND_TRUST.md#public-test-boundary), and [execution contract](PACKAGE_CONTRACTS.md#public-test-execution-contract).

## Provider and external-action prerequisites

Provider and external-action activation requires an accepted gate receipt (H-01 hosting, E-01 email, R-01 routing, M-01 media, L-01 audit anchoring, S-01 support channels). ADR 0010 replaces H-01 only for the free public test with its substitute controls. No provider activation follows automatically from a showcase or pilot.

## Assessment environment boundary

The free public test uses synthetic stores and the preserved beta. No real-store marketing, external cohort, deferred-trip exposure, billing, paid provider, or fabricated release receipt is authorized. AI and agent-assisted test accounts remain restricted to synthetic store data.

## Human usability acceptance

The owner's first computer-then-phone evaluation with actual device or assistive-technology observations is required before wider exposure. Preparation is recorded in issue #251 and the human-accessibility worksheet.

## The connected shopper experience

Browse stores and details, save favorites, plan trips, and leave reviews. Sign in when saving; browse without an account. See [core features](#core-features).

## The store and administrator experience

Store owners claim listings, manage hours and photos, and post updates. Administrators approve store changes, manage access, and review support. See [core features](#core-features).

## Next milestone: usable internal store showcase

The current milestone is the bounded free public test: stable public link, anonymous browse of the twelve fictional stores, and scoped saved-store actions. See [public test publication](#public-test-publication).
