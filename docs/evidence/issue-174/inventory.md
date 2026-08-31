# Issue #174 inventory — 2026-08-30

Base SHA: 97ab90a488903e5354506dcf1d69404695390a2b
Merged as: `d125048` on `codex/issue-174-free-gallery-full-gallery` -> PR #186 (implementation `3ea7332`, ownership fix `0682e32`, final boundary fix `d125048`; full change set via `git log --oneline 5854971..d125048`)

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
- Upgrade-path rehearsal (final migration text, 2026-08-30): `db reset --version 20260830190000` (pre-174 schema), seeded legacy rows `featured`/`unlimited` + `downgrade_to='featured'`; applied 20260831010000 -> `gallery`(cap 15)/`full_gallery`(cap null)/`gallery`; rerun all UPDATEs 0 rows, no constraint duplication; legacy insert/update rejected 23514.

## Rollback / forward repair

- Rerun safe: UPDATEs where-clause, conditional ADD CONSTRAINT, CREATE OR REPLACE FUNCTION
- Rollback: `UPDATE gallery->featured, full_gallery->unlimited`, recreate legacy CHECK, restore function bodies from git 20260824120000/25100000. Do not delete audit/provenance.

## Resolver authority

- `resolve_store_photo_cap(uuid)` single authority; `check_store_media_cap` (migration line 82) and `billing_apply` call/normalize through it; client cannot override count.

## Verification evidence (2026-08-30)

- `npx supabase@2.115.0 test db` full suite: 77 files, 2133 tests, all passing (includes new 0077 plan-29 tier-boundary tests).
- `supabase/tests/0077_package_13_tier_boundaries.sql`: resolver signature, migration rehearsal, canonical constraint rejection, pending/rejected counting, boundary at 5, replacement, idempotent retry/dup key, uncapped Full Gallery, webhook legacy-name normalization, uncapped-read guards.
- `npm run check`: 65 unit tests pass, `tsc -b` clean, vite production build succeeds.
- `npm run security:contract`: pass.
- Billing webhook defect found and fixed by 0077: first `active`/`past_due` event on a store inserted `current_period_end=NULL`, violating `subscription_state_shape` before `on conflict`; the migration's recreated function now carries `current_period_end` in the insert.
