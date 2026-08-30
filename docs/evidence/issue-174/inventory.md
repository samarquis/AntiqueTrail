# Issue #174 inventory — 2026-08-30

Base SHA: 97ab90a488903e5354506dcf1d69404695390a2b
Candidate SHA: c829ecdbe6fc546d9428b3f42f5652f169d093cd

## Authoritative tier seams (before migration)

- `supabase/migrations/20260824120000_store_membership_capabilities.sql:168` tier check `('free','featured','unlimited')`
- `supabase/migrations/20260824120000_store_membership_capabilities.sql:182` downgrade_to `('free','featured','unlimited')`
- `supabase/migrations/20260824120000_store_membership_capabilities.sql:280` `resolve_store_photo_cap` case `featured 15, unlimited null`
- `supabase/migrations/20260824120000_store_membership_capabilities.sql:362` `billing_apply_subscription_event` p_tier check `featured|unlimited`
- `supabase/migrations/20260825100000_media_intake_tier_enforcement.sql:58-70` `check_store_media_cap` case `free/featured/unlimited` and upgrade copy
- `src/features/billing/types.ts:9` `tier: 'featured' | 'unlimited'`
- `supabase/functions/store-billing-webhook/index.ts:33-34` `tierForPrice` featured/unlimited
- `supabase/functions/store-billing-checkout/index.ts:74,90-92` tier validation and price mapping
- `supabase/tests/0073`, `0074`, `0072` dozen hits for featured/unlimited

Historical migrations 20260824120000/25100000 retained as immutable history; new migration 20260831010000 supersedes them forward-only.

## Presentation seams

- No user-facing copy contained Featured/Unlimited pricing (prices unset); edge-function upgrade messages updated to Gallery/Full Gallery in new migration.

## After migration (candidate)

- `20260831010000` UPDATEs migrate stored `featured->gallery`, `unlimited->full_gallery` idempotently
- Constraints: `store_photo_tier_state_tier_check` -> `('free','gallery','full_gallery')` (conditional ADD, rerun safe)
- `resolve_store_photo_cap` -> `gallery 15, full_gallery null`
- `check_store_media_cap` -> new tier messages, still via resolver
- `billing_apply_subscription_event` accepts legacy then normalizes (sunset 2026-09-30)
- TS types, edge functions, pgTAP tests updated; `rg featured|unlimited src` 0 hits outside `StorePhotosPage.tsx` unrelated layout var

## Row counts / digests

- Before: `select count(*) from partner_private.store_photo_tier_state where tier in ('featured','unlimited')` — run on clean reset with seed 0 (pilot absent rows = Free)
- After: same query 0; `gallery/full_gallery` 0 on clean reset (expected, pilot remains Free absent)
- Migration rerun: `UPDATE ... WHERE tier='featured'` 0 rows second run, constraint ADD guarded

## Rollback / forward repair

- Rerun safe: UPDATEs where-clause, conditional ADD CONSTRAINT, CREATE OR REPLACE FUNCTION
- Rollback: `UPDATE gallery->featured, full_gallery->unlimited`, recreate legacy CHECK, restore function bodies from git 20260824120000/25100000. Do not delete audit/provenance.

## Resolver authority

- `resolve_store_photo_cap(uuid)` single authority; `check_store_media_cap` and `billing_apply` call/normalize through it; client cannot override count.
