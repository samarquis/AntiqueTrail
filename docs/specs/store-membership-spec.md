# Store Photo-Tier Membership Spec

Current target: approved 2026-10-06 scope. [PRD](../../PRD.md) owns product outcomes. This file alone owns photo capacity and the future paid offer. No price, subscription or live payment is activated by this amendment.

## Tier model

- Free listing includes owner-managed facts, hours, simple updates, social links and a small gallery. Retain existing cover + 5 gallery capacity pending implementation; this is concurrent capacity, not five monthly uploads.
- Optional paid plans buy additional photo capacity only. The owner's $15/$30 ideas and 20-photo/top-tier capacities remain provisional; paid plan count, names, exact capacities and sustainable limits must be settled together before billing implementation.
- Photos remain until owner replacement/removal or an explicitly disclosed downgrade/account lifecycle; no routine monthly deletion or replenishment cycle.
- No advertising, paid ranking, shopper-data access or payment-based approval. A top-tier “unlimited” storage/AI promise is not approved. Consumer subscriptions and AI subsidies are deferred.
- Existing Gallery cover+15 and Full Gallery no-count-cap implementation is compatibility evidence, not approval of a new offer. Existing exact-store curated media/grants retain their own boundaries.

## Storage rules

Preserve the current safe upload pipeline: JPEG/PNG/WebP input, 5 MB source limit, 4000px maximum dimension, re-encode to WebP, strip metadata, rights confirmation, alt text and private Administrator review. Replacements do not remove current approved media before approval. Enforce the applicable confirmed entitlement server-side; a failed/repeated upload must not bypass capacity or consume it twice. No arbitrary undisclosed limits on a paid offer.

## Paid activation decisions

Before a paid implementation leaf is READY, specify exact prices/currency, plan count, photo/storage capacity (including cover and update-image accounting), ongoing costs, tax, renewal, cancellation, failure and downgrade behavior. Explain what remains visible/stored and when deletion may occur. Do not infer these choices from this scope approval. Record real owner value feedback and a Product Owner go/no-go; no fixed regional/cohort program gates the first unpaid evaluation.

## Payment flow summary

Approval creates Free first. An optional later paid upgrade uses Stripe-hosted Checkout, verified events and supported customer portal behavior; no card storage in the application. Exact offer/consent and account/store authorization precede payment. Failed or abandoned Checkout leaves Free intact. Payment never publishes content or grants privilege. Webhook authenticity, idempotency and safe reconciliation remain necessary when billing is activated.

Custom paid-to-paid schedules, proration/compensation machinery and a custom Owner cancellation UI are not new-milestone prerequisites. Cancellation for an actually offered plan must remain usable; do not promise a portal path that cannot service the verified subscription state.

## Existing servicing obligations

Preserve existing subscription mirrors, schedules, refunds, cancellation intent, receipts and photo/data lifetimes until live state and any migration are explicitly assessed. [Prior membership mechanics](https://github.com/samarquis/AntiqueTrail/blob/d075998137c501c6ff7252880ad59500e59bec16/docs/specs/store-membership-spec.md) and [bounded local cancellation contract](store-owner-paid-servicing.md) remain compatibility references. Existing 14-day failed-payment and 30-day hidden-photo downgrade grace are not a monthly photo reset and are not silently changed here. No existing subscriber is presumed absent.

## Public acquisition and QR contract

Public store links/QR convey public listing identity only. Owner intake uses verified account/MFA, documented authority and Site Admin approval; invitation tokens never grant a role by themselves. Public intake and paid offers require separate exposure approval. Owner copy explains Free, optional capacity, approval and support without invented ROI or endorsements.

## Stage-specific owner acceptance

First evaluate an admitted owner's ability to establish authority, confirm listing facts/hours, manage permitted photos and post a simple update on actual computer/phone. Record accessibility, interruption, error and approval-wait observations. No fixed eight-person cohort, team suite, paid plan or three-community expansion is required for this unpaid evaluation. Broader exposure retains applicable security, accessibility, consent and operating proof.

## Photo moderation criteria

Rules the Administrator applies when reviewing store-submitted photos. They align with the shipped M-01 pipeline: uploads arrive in `media_uploads` with lifecycle states through `awaiting_review`; approval records required `approved_by`/`approved_at`/`approval_reason`; publication into `app_public.store_media` happens only from `approved_pending_publish` to `published` via the `media_publication_shape` constraint, so pending, rejected, quarantined, and withdrawn uploads can never reach shopper-visible payloads regardless of tier.

- **Accepted types:** storefront exterior, interior displays, exterior/interior signage, and representative inventory items. Simple Store News may also show a store's pet or another directly relevant store detail (for example Carl the cat); the same rights, processing and review controls apply. Event publishing and people-centric submissions remain deferred. The store-news clarification follows the 2026-10-06 approved scope.
- **Rejection list:** screenshots (website/social), watermarked images, AI-generated images, identifiable people without documented consent, third-party logos or brand-heavy imagery, blurry/low-quality images, off-topic content, and text-heavy promotional banners. Rejection requires the reason already mandated by the pipeline's `approval_reason` field. Approved 2026-08-23.
- **Reviewer model:** a single Administrator reviews in the Administrator Review Workspace. Automated pre-screening remains malware/safety-only (M-01 `scan_state`); no content judgment is automated, and nothing auto-approves. Approved 2026-08-23.
- **Review speed:** target review within two business days of submission. Internal target only while the pilot is unpaid; it becomes a contractual SLA only when paid tiers activate, and then only by a new decision. Approved 2026-08-23.
- **Rejection visibility and resubmit:** the store sees the rejection reason and may resubmit corrected images. Fits the existing audit trail and purge/replacement paths. Approved 2026-08-23.
- **Queue vs go-live:** a listing may go live without photos (neutral placeholder per the Store Browser decision); approved photos appear as they clear review. Photo approval never blocks a listing going live, so moderation does not extend onboarding timelines. Approved 2026-08-23.
