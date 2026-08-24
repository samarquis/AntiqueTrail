# Store Photo-Tier Membership Spec

**Status**: Approved planning baseline · **Date**: 2026-08-23
**Parent ticket**: #87 (closes with this spec) · **Feeds**: #92 (closed by same rulings), photo-tiers package

This spec locks the pricing model, tier features, storage rules, payment flow, and moderation rules for Antique Trail's store listing memberships. It activates at Regional Public MVP per ADR 0005's paid-tier transition plan. **No billing goes live until the photo-tiers package passes its own gates and the Product Owner signs the funding/activation approval; deferred-item 4 (monetization) still prohibits any paid placement, data-sale, or advertising — these tiers sell owner storage capacity only.**

## Tier model

| Tier | Approved photos | Billing |
|---|---|---|
| Free | Cover + 5 gallery images | None, indefinitely |
| Featured | 15 photos | Monthly via Stripe |
| Unlimited | No cap | Monthly via Stripe |

Dollar price points are deliberately unset: monetization is deferred at least through RG-01 and the three-community review (PRODUCT_DECISIONS.md), so figures are recorded in this spec at paid-launch activation, not before.

## Storage rules

- Format WebP after M-01 processing; source uploads JPEG/PNG/WebP; 5 MB max source, 4000px max dimension, ~300 KB average processed.
- Free tier ≈1.5 MB/store fully stocked; Featured ≈4.5 MB; Unlimited uncapped but bounded by intake validation.
- Downgrade hides excess photos above the new limit with a 30-day grace period before deletion (see Mid-cycle changes).

### Storage cost break-even (USP-04) — Decided: analysis recorded

At Supabase Storage free-tier 1 GB: ~690 fully stocked free-tier stores fit before any storage spend. A paid Featured store consumes ~4.5 MB (~3× a free store) while paying monthly, so even modest paid adoption outpaces storage cost growth; bandwidth and egress are the real variables and are covered by the H-01 quota/pause gates rather than this spec. Conclusion: free-tier storage is negligible at pilot and post-MVP scale through hundreds of stores; no pricing action is required for break-even. Revisit only when total stored media approaches the first paid storage threshold, tracked under H-01 quota observations.

## Unspecified-items register

Each previously-unspecified item from #87, now decided or explicitly deferred:

- **USP-01 Store onboarding flow — Decided** (2026-08-23, PRODUCT_DECISIONS.md §Photo-tier memberships): invitation → consent receipt → draft listing → tier selection → Stripe hosted Checkout redirect → Administrator approval → publish. Never a public signup page; payment alone never grants publication.
- **USP-02 Pilot grandfathering — Decided** (2026-08-23): existing pilots keep the free tier indefinitely at cover+5; no expiring window; charging anyone requires a new signed consent receipt with payment terms.
- **USP-03 Mid-cycle tier changes — Decided** (2026-08-23): upgrades instant with Stripe prorations; downgrades at cycle end, last-one-wins scheduling, 30-day grace on hidden excess photos.
- **USP-04 Storage cost break-even — Decided**: analysis above; no pricing action needed before hundreds of stores.
- **USP-05 Stripe integration scope — Decided** (2026-08-22): `docs/research/stripe-integration-scope.md` — Checkout hosted page, customer portal, webhook-driven lifecycle, failed-payment handling via 14-day grace then downgrade to free.
- **USP-06 Photo moderation criteria — Decided** (2026-08-23, closes #92): full rulings in PRODUCT_DECISIONS.md §Photo moderation criteria — accepted types (exterior/interior/signage/inventory), rejection list (screenshots, watermarks, AI-generated, non-consented people, third-party logos, blurry, off-topic, promo banners), single-admin review with malware-only automation, two-business-day target, rejection reasons visible with resubmit allowed, listings go live without waiting on photos.
- **USP-07 Tier enforcement at upload — Decided** (2026-08-23): enforced at intake (upload path validates approved-count vs tier); read path stays uncapped; approval isolation is structural via `media_publication_shape`.
- **USP-08 Annual billing — Deferred**: past Regional Public MVP; revisit with retention data. Monthly-only at launch is the binding rule meanwhile.
- **USP-09 Tax handling — Deferred with mechanism**: Stripe Tax configured during paid-launch work; no manual tax decisions before activation.
- **USP-10 Refund policy — Decided** (2026-08-23): cancel-anytime via Stripe portal; full refund of a charge available within 48 hours of that charge; no other refunds.

## Payment flow summary

Stripe-hosted Checkout redirect (no card fields on Antique Trail) → webhook-verified subscription state → Administrator approval gate remains mandatory for publication → self-serve portal for cancellation/tier changes → 14-day failed-payment grace → automatic downgrade to free tier with photo-hiding grace period.

## Consistency notes

- The current unpaid Pilot Consent model stays untouched for every existing pilot; this spec defines only what happens at the separately gated paid transition.
- Moderation rulings reuse pipeline facts already shipped (`media_uploads` states, required `approved_by`/`approval_reason`, alt-text guarantees), so no schema change is required by #92; enforcement work lands with the photo-tiers package at intake.
