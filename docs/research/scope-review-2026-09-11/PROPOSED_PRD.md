# Proposed PRD: Antique Trail store showcase

Draft for owner approval, September 11, 2026. This document proposes replacement product direction; it does not supersede the current PRD or authorize activation. Supporting findings: [review](REVIEW.md).

## Purpose

Help antique stores present their shop and interesting merchandise through trustworthy information and photographs. Let shoppers explore without an account. Let approved store representatives maintain their own listing and optionally buy a larger photo gallery.

## People and permissions

| Person | Can do | Boundary |
| --- | --- | --- |
| Anonymous visitor | Browse/search stores; open details, approved photos, hours and official links | No account or location permission required to browse. |
| Registered shopper | Sign in and use existing private saved stores | Sees only their private data. Signing up does not make them a store representative. |
| Store representative | Manage an approved exact store's permitted details, hours, photos and membership | Existing verified-email/MFA and server-side scope enforcement remain. A new applicant has no store authority until approval. |
| Administrator | Approve listings/claims/photos, handle corrections and support, manage store authority | No default access to shopper-private activity; sensitive actions stay controlled and auditable. |

Use one Supabase account system. These are permissions/states on identities, not four separate login systems. Retain the current login/recovery implementation unless a focused test demonstrates a defect. Do not build a new auth framework.

## Core journeys

1. Shopper opens Browse, searches, opens a store, views its photos/details/hours and follows an official contact or directions link. Back returns to useful browsing context. Missing information is clearly identified.
2. Shopper optionally saves a store. Just-in-time sign-in preserves the interrupted action; cancellation writes nothing.
3. An invited pilot store representative completes the existing verified account/approval path. The administrator confirms authority and grants the exact store's Free listing. Public self-service acquisition is a later pilot extension if invitation-assisted onboarding is sufficient initially.
4. Representative updates permitted store information and submits photos. The interface explains what publishes directly and what requires review. Admin approval makes the permitted content visible on the public listing.
5. Once paid pilot activation is separately approved, an approved representative chooses Gallery, sees the exact price and terms, uses Stripe-hosted Checkout, and receives the paid photo entitlement only after verified provider confirmation. Failed or cancelled Checkout preserves Free. Existing subscribers use supported Stripe customer-portal management.

## First offer

Free includes the current cover plus five approved gallery photos. The first paid offer is Gallery with the current cover plus fifteen approved gallery photos. Prices are not chosen by this draft. Payment buys photo capacity, not search rank, reviews, verification or moderation outcomes. Featured placement is deferred, as the owner selected.

Use Stripe Checkout, its customer portal and verified webhooks. Keep one store-to-customer/subscription mapping, server-selected approved prices, retry-safe event processing, cancellation/failed-payment handling and clear photo-limit behavior. Preserve existing servicing code; do not rewrite it simply to reduce line count. Do not offer Full Gallery or new custom paid-to-paid changes in the initial pilot. Any compatibility changes must account for verified existing provider state and explicit commercial terms.

## Next milestone: usable internal store showcase

Use an exact recorded build with existing labeled fictional stores and permitted synthetic imagery. Show the product owner, on computer then phone: Browse → store → photos/details → return, followed by one representative edit and one admin approval demonstration. Existing favorites may be evaluated separately. This milestone does not depend on trip invitation acceptance, route optimization, Navigator/Go, offline trips, public reviews or community expansion.

Done means:

1. The exact routes and data setup run reproducibly, and the demonstrated transitions have scoped browser evidence.
2. The owner can attempt the journey and record problems plus a continue/revise/stop decision. Automated persona opinions cannot provide that decision.
3. The handoff identifies which actions use real local services and which use fixtures. It includes the command or verified permitted URL, access/setup instructions and known limitations.

Do not demand an ideal whole-product persona score before showing a safe, clearly bounded internal candidate. Blocking problems on the selected path must be fixed; unrelated deferred features do not prevent feedback on the showcase.

## Following milestone: small real-store pilot

Before inviting real stores, verify the permitted hosting, real account/email configuration, content rights and moderation, exact-store authorization, backups/recovery, support ownership and applicable security/accessibility obligations. Use invited onboarding first and enough permitted shops to evaluate whether owners can maintain useful listings; do not create a geography-expansion program as a prerequisite.

The owner selects the actual pilot scope and participants in the activation decision. Agent tasks prepare and verify; they do not invent owner consent, legal sign-off, external participants or human evidence. Public discovery/indexing remains a separate release decision from a controlled pilot.

## Following milestone: paid Gallery pilot

Gate on the actual business offer: approved price/terms and service limits; permitted owner feedback; Stripe test-mode purchase, portal/cancellation, failed payment and webhook evidence; entitlement isolation; refund/support/recovery handling; and explicit live activation approval. The proposal removes mandatory regional launch, RG-01 and three community expansions as prerequisites to this bounded paid pilot. It does not waive the security, provider, consent or operating evidence relevant to accepting money.

## Deferred work

Preserve existing implementation and findings for trips/partner sharing, route planning, Go/offline navigation, Candidate Share, public reviews, personal visit histories, community expansion, Full Gallery sales, paid featured placement, personalization, households, collections and Android packaging. They may be reconsidered after pilot evidence. None is an implicit commitment to further implementation now.

Do not expose an unaccepted deferred path in a pilot just because its code exists. Decide and verify capability exposure as part of the pilot route inventory; retain enforcement for any path that remains reachable.

## What stays unchanged

React/TypeScript/Vite, Supabase, Stripe, existing visual identity, anonymous browsing, private-data isolation, exact-store authority, privileged assurance, photo permissions/moderation and honest evidence reporting. Keep required branch checks and independent review for sensitive changes. Existing approved requirements remain controlling until the corresponding amendment is adopted.

## Evidence that decides further investment

Continue when the owner can use the showcase, selected real owners can maintain useful listings, and permitted feedback supports testing the priced Gallery offer. Revise when the path is confusing or its offer lacks value. Stop expansion when the core path is unusable, privacy/payment correctness fails, or owners do not value the proposed service. Do not create more feature tickets solely to postpone these observations.
