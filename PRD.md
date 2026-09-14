# Product Requirements Document

## Purpose

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
