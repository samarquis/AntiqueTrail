# Gallery Photo Data Access

**Date**: 2026-08-23
**Ticket**: #95 · Parent #87
**Question**: When tier limits raise the photo cap, how does the app serve every approved public photo for one store instead of today's cover-plus-five?

## Verdict

**No read-path RPC or schema work must land before #92 enforces higher limits.** Exposure is already uncapped, and approval isolation is already structural in the M-01 pipeline. Cap changes land at intake/validation time (Store Portal, #92), not in the fetch path. Two non-blocking observations for later work are listed at the end.

## Cap location (Q1)

There is no server-side or client-side five-image cap anywhere. The cover-plus-five limit exists only as documented product scope (DESIGN.md, "Store photo gallery page") and data discipline:

- **Supabase path**: `app_public.catalog_details(p_slug)` aggregates every `store_media` row with no limit (`supabase/migrations/20260803000000_catalog_foundation.sql:311`). More than five rows would all be returned today.
- **Demo path**: `src/features/catalog/demoClient.ts:58-96` builds fixtures directly — one cover each, plus three gallery images on the first store. Fixture size, not logic, keeps it under the cap.
- **Can >5 approved rows already exist per store?** Yes. `app_public.store_media` (foundation migration :136-148) has no row-count constraint — only unique indexes on one cover per store and unique `(store_id, display_order)` ordering. Nothing prevents six gallery rows today.

## Minimal exposure change (Q2)

None needed in the read path. When tiers raise caps, stores simply gain more `store_media` rows and both clients serve them unchanged (`catalogApi.ts` maps the aggregation through `toStore`; the locked gallery page renders whatever `media` contains).

Approval isolation is already guaranteed structurally: `media_private.media_uploads` (`20260821700000_m01_media_pipeline.sql:54-102`) carries the lifecycle `reserved → staged → quarantined → awaiting_review → approved_pending_publish → published`, and its `media_publication_shape` constraint makes `state='published'` impossible without `catalog_media_id` pointing at an `app_public.store_media` row created at publish time. Pending, rejected, quarantined, and withdrawn uploads never become `store_media` rows, so they can never reach any shopper-visible payload — regardless of tier.

#92's enforcement therefore belongs at **intake**: upload/count validation against the store's tier in the partner-facing flow (and the M-01 daily-limit function at :202+ as the pattern), not in `catalog_details`.

## Second feature rule (Q3)

The gallery page's opening parallax feature is the cover (`media[0]`). The second feature is the **mid-page image in display order** — `media[Math.ceil(count / 2)]`, picked by `buildLayout` in `src/features/catalog/StorePhotosPage.tsx`, appearing only from five photos up, caption side alternating right→left. Both clients deliver display-order-sorted arrays (RPC orders by `m.display_order`; demo arrays are hand-ordered), so the rule is deterministic everywhere and needs no new metadata. If product later wants "next-most-recently-approved", that requires exposing `approved_at` publicly — deferred until asked for.

## Freshness interplay (Q4)

`freshness_state` is `current | overdue | stale | unavailable` (foundation migration :215), computed from the oldest verified fact group. `catalog_details` serves only `current` and `overdue` (:315): day 0–180 verified, day 181–365 overdue-but-visible, past day 365 hidden. A stale or unpublished store returns zero rows, `client.details()` resolves `null`, and `/stores/:slug/photos` shows the same "Store not found" screen as Store Details. Recommendation: keep this parity — a listing hidden from discovery should not keep a discoverable photo page. If product wants distinct copy ("this listing is temporarily unavailable") rather than not-found, that is a small shared-state change, not a data-access change.

## alt guarantee (Q5)

Yes, guaranteed at both layers. Schema: `store_media.alt_text` is `NOT NULL` with a 1–240 character trimmed check (foundation :141-144). Pipeline intake: `media_uploads.alt_text` repeats the check plus control-character rejection (:60), and the upload function re-validates (:216-217). Demo fixtures ship descriptive alt text on every image. Meaningful alt is therefore structural, not convention — #92 cannot raise limits in a way that produces empty-alt public media.

## Non-blocking observations

1. **List-path payload bloat**: `catalog_list` embeds every store's full media array in each browse row (:289). Harmless at today's counts; worth trimming to cover-only when real stores carry larger galleries. Scope it with #92's activation work.
2. **Caption/rights fields**: `catalog_details` shapes only `asset_path/kind/alt_text/display_order`; `CatalogMedia.caption`/`rightsLabel` are currently demo-fixture-only (pages degrade gracefully). Partner-supplied captions/rights labels would be a small view extension when M-01/6B portal work lands.
