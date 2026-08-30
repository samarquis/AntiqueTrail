# Store Photo-Tier Membership Spec

**Status**: Approved planning baseline, amended 2026-08-30 · **Date**: 2026-08-23
**Parent ticket**: #87 (closes with this spec) · **Feeds**: #92 (closed by same rulings), photo-tiers package

This spec locks the acquisition boundary, tier features, storage rules, payment flow, and moderation rules for Antique Trail's store listing memberships. Approval creates Free automatically; paid Stripe upgrades remain staged off through RG-01 and three separately approved small-community runs/reviews and may activate only after the paid-value gate, a new monetization Product Decision, Package 13 and applicable provider/security/media/CI gates, an approved inactive commercial configuration, and a composite signed activation receipt. **No billing goes live merely because the integration exists; deferred-item 4 still prohibits paid placement, data sale, or advertising — these tiers sell owner photo capacity only. Prices may exist only in the approved private inactive configuration before activation and cannot be displayed publicly or charged.**

## Tier model

| Tier | Approved photos | Billing |
|---|---|---|
| Free | Cover + 5 gallery images | None, indefinitely |
| Gallery | Cover + 15 gallery images | Monthly via Stripe |
| Full Gallery | Cover + no plan-count cap; published non-count file/rate/moderation/quota rules still apply | Monthly via Stripe |

Dollar price points are currently unset. `Featured` is retired because payment never buys prominence; `Unlimited` is retired because operational limits still apply. After three community reviews, a signed commercial-research authorization may approve exact test prices in one versioned inactive configuration for private research/acceptance. The final monetization Product Decision ratifies or rejects that exact version; public display/provider charging begins only when the composite activation receipt promotes its digest.

## Storage rules

- Format WebP after M-01 processing; source uploads JPEG/PNG/WebP; 5 MB max source, 4000px max dimension, ~300 KB average processed.
- Free tier ≈1.5 MB/store fully stocked; Gallery ≈4.5 MB; Full Gallery has no plan-count cap. Before sale, its versioned owner-visible limits must state exact accepted file types/bytes/dimensions, upload-rate and quota/outage behavior, moderation/abuse rules, reason/recovery/appeal, and paid-service remedy. Normal operation cannot impose an undisclosed discretionary count cap.
- Downgrade hides excess photos above the new limit with a 30-day grace period before deletion (see Mid-cycle changes).

### Storage cost break-even (USP-04) — Decided: analysis recorded

The earlier estimate that 1 GB could hold roughly 690 fully stocked Free stores and that a Gallery store would average roughly 4.5 MB is a planning estimate, not a verified paid-business case. Bandwidth, egress, moderation, support, refunds, tax, and provider costs can dominate storage. Paid activation therefore requires observed permitted-owner willingness-to-pay evidence plus a Product Owner go/no-go using current provider costs; no price or break-even conclusion comes from this estimate alone.

## Unspecified-items register

Each previously-unspecified item from #87, now decided or explicitly deferred:

- **USP-01 Store onboarding flow — Amended** (2026-08-30, PRODUCT_DECISIONS.md §Photo-tier memberships): public `/for-stores` → find existing/add new store → ordinary verified account + MFA → authority/eligibility and draft → Administrator approval atomically creates exact scope, listing when new, and Free → publish/activate. After paid activation, the approved Free Representative may optionally upgrade through fresh paid consent and Stripe hosted Checkout. Failed checkout leaves Free/listing intact; payment never grants publication or privilege. Administrator invitation remains an alternate controlled entry into the same approval boundary.
- **USP-02 Pilot grandfathering — Decided** (2026-08-23; clarified 2026-08-30): existing pilots keep Free indefinitely at cover+5; no expiring window. Their Pilot Consent Receipt remains unchanged. Any optional charge requires a separate immutable Photo-Tier Paid Consent Receipt bound to the exact store/Representative/commercial version; it never replaces the pilot receipt.
- **USP-03 Mid-cycle tier changes — Decided** (2026-08-23): upgrades instant with Stripe prorations; downgrades at cycle end, last-one-wins scheduling, 30-day grace on hidden excess photos.
- **USP-04 Storage cost break-even — Decided**: analysis above; no pricing action needed before hundreds of stores.
- **USP-05 Stripe integration scope — Decided** (2026-08-22): `docs/research/stripe-integration-scope.md` — Checkout hosted page, customer portal, webhook-driven lifecycle, failed-payment handling via 14-day grace then downgrade to free.
- **USP-06 Photo moderation criteria — Decided** (2026-08-23, closes #92): full rulings in PRODUCT_DECISIONS.md §Photo moderation criteria — accepted types (exterior/interior/signage/inventory), rejection list (screenshots, watermarks, AI-generated, non-consented people, third-party logos, blurry, off-topic, promo banners), single-admin review with malware-only automation, internal pilot target only, rejection reasons visible with resubmit allowed, listings go live without waiting on photos. No public review-time or SLA claim is authorized until a separately staffed paid-service decision.
- **USP-07 Tier enforcement at upload — Decided** (2026-08-23): enforced at intake (upload path validates approved-count vs tier); read path stays uncapped; approval isolation is structural via `media_publication_shape`.
- **USP-08 Annual billing — Deferred**: past Regional Public MVP; revisit with retention data. Monthly-only at launch is the binding rule meanwhile.
- **USP-09 Tax handling — Deferred with mechanism**: Stripe Tax configured during paid-launch work; no manual tax decisions before activation.
- **USP-10 Refund policy — Decided** (2026-08-23): cancel-anytime via Stripe portal; full refund of a charge available within 48 hours of that charge; no other refunds.

## Payment flow summary

Public `/for-stores` explains eligibility, owner value, shopper experience, complete Free service, process, trust boundaries, and—only after paid activation—exact upgrade prices/summaries. `Add or claim my store` leads to ordinary account/MFA, authority/listing review, and Administrator approval that creates Free without Stripe. After paid activation, an optional upgrade requires fresh consent showing exact monthly price, tax, first charge, auto-renewal, cancellation/refund, proration/downgrade, failed-payment, photo-deletion terms, and Full Gallery limits; then Stripe-hosted Checkout creates webhook-verified state. Failed/cancelled checkout leaves the Free listing intact. Self-serve portal, 14-day failed-payment grace, automatic Free downgrade, and 30-day hidden-photo grace follow.

## Public acquisition and QR contract

- Shopper promotion QR → `/stores?area=topeka-ks`; prospective-owner card → `/for-stores`; secure approved invitation → `/partner/join#token`. The public QR classes never convey identity, authority, admission, or privilege.
- `/for-stores` is a targeted owner landing page; Browse remains the shopper front door. Footer/More and an eligible Store Details claim link may reach it without replacing shopper navigation.
- Before Package 10A the route is absent outside Synthetic tests. Package 10A is private and `noindex`. From signed Package 10B until paid activation it may promote Free and claim/add intake only. Paid cards, exact prices, and paid CTA appear only after the signed activation receipt; authenticated choice remains `/store-portal/plans`.
- The page must show one truthful store journey from Browse → Details → Add to Trip → planned stop → external navigation; operator identity/service area; eligibility; source/freshness meaning; owner control; moderation; support/security/privacy/terms/status paths; what happens next; and explicit boundaries that payment buys photos only. Screens and testimonials must be real and consented or conspicuously labeled synthetic; no fabricated metrics, logos, endorsements, popularity badge, countdown, scarcity, ROI, foot-traffic, or sales claim.
- Owner-card copy baseline: `Put your store where antique shoppers plan their day.` Supporting facts may say `Free plan available · No sales commission · Keep key store details current` only while each statement remains true. The page explains that hours, phone, website, description, and temporary closure are directly managed while sensitive facts and photos are reviewed. Page hero baseline: `Help antique shoppers find your store—and make it part of the trip.` Primary CTA: `Add or claim my store`; secondary: `See what shoppers experience`.
- Optional `src` is an allowlisted aggregate campaign code only. The card includes a plain HTTPS fallback. Withdrawal/reprint controls apply separately to shopper flyers, owner cards, partner social posts, and logo/co-brand use.

## Stage-specific owner acceptance

**Free launch (Package 10A):** use the separate owner-acquisition usability cohort in Package 10A: exactly eight eligible Topeka owners/managers, all 55+, including at least three age 70+ and at least two low-vision, motor, or assistive-technology adaptations. On the private Synthetic Free-only page, at least 90% must unaided identify the offer/area/eligibility, shopper value, Free/no commission, directly managed versus reviewed facts, payment-not-required, no paid ranking/data, claim-versus-add next step, approval wait, and support/privacy path, then start/resume the correct flow at 320px/200%/applicable assistive tech. Zero safety/privacy/authorization failure; repeated critical failures require fix/retest before 10B distribution.

**Paid value and activation:** after the signed commercial-research authorization prepares exact inactive prices/terms, follow its pre-signed neutral protocol with at least eight eligible owners/managers, representation from Topeka and each of the three activated communities, at least four non-Representatives, at least four age 55+, at least two age 70+, at least two low-vision/motor/assistive-technology adaptations, no duplicate household/business respondent, and compensation independent of answer. The private no-provider-call prototype shows the exact Free/Gallery/Full Gallery offer and consent. Record every inclusion/exclusion and participant choice/reason; at least 90% must unaided understand photo-only differentiation, exact price/tax/renewal, payment-not-publication/ranking/data, Full Gallery limits, cancel/refund, proration/downgrade, 14-day failed-payment grace, and 30-day hidden-photo deletion. Zero safety/privacy/authorization failure. Scheduling identity deletes within 30 days after decision; pseudonymous minimized responses and consent/decision receipt retain three years. Product Owner signs `go | reject | inconclusive` with the full evidence/cost rationale, then the final monetization Product Decision ratifies or rejects the exact config; no comprehension score forces a commercial `go`, and one favorable anecdote cannot substitute for the packet. Reject/inconclusive leaves paid tiers off.

## Consistency notes

- The current unpaid Pilot Consent model stays untouched for every existing pilot; this spec defines only what happens at the separately gated paid transition.
- Moderation rulings reuse pipeline facts already shipped (`media_uploads` states, required `approved_by`/`approval_reason`, alt-text guarantees), so no schema change is required by #92; enforcement work lands with the photo-tiers package at intake.
