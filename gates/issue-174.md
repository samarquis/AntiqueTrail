# Gates: Issue #174 Free/Gallery/Full Gallery tier enforcement

Scope: Forward-only migration from featured/unlimited to Free/Gallery/Full Gallery with single server-owned resolve_store_photo_cap authority, preserving pilot Free stores and uncapped shopper reads.

Base SHA: 97ab90a488903e5354506dcf1d69404695390a2b

- [x] G1: Repository-wide inventory identifies every authoritative and presentation use of legacy tier names and count assumptions before migration
  CHECK: github code search `featured|unlimited` across `src/`, `supabase/functions/`, `supabase/migrations` (live seams, excluding immutable published migrations)
  EXPECT: 0 in live seams
  EVIDENCE: `src/` = 0 (powershell Select-String count), `supabase/functions/` = 0, only occurrences are (a) immutable historical migrations 20260824120000/20260825100000, (b) the migration text's own conversion/rejection clauses, and (c) the documented presentation exception `src/features/catalog/StorePhotosPage.tsx:73-80` where `featured` is a photo-tile layout Set (which thumbnail renders as the large feature tile), not tier vocabulary.

- [x] G2: Forward-only migration converts stored values and constraints deterministically; rerun safe and rollback/repair documented
  CHECK: executed upgrade-path rehearsal on the final migration text
  EXPECT: conversion of legacy rows + rerun-safe + legacy rejection
  EVIDENCE: local Supabase reset at pre-174 (`db reset --version 20260830190000`), seeded real legacy rows (store_photo_tier_state tier=featured/unlimited; store_subscriptions downgrade_to=featured); applied 20260831010000 -> featured->gallery (cap 15), unlimited->full_gallery (cap null), downgrade_to->gallery; constraints recreated with canonical values; rerun applied with all UPDATEs 0 rows and no constraint duplication; post-migration legacy insert/update rejected with 23514. Rollback/repair notes recorded at migration tail.

- [x] G3: resolve_store_photo_cap is single server authority for intake and resubmit; cannot be overridden by client input
  CHECK: npx supabase@2.115.0 test db supabase/tests/0077_package_13_tier_boundaries.sql
  EXPECT: pass
  EVIDENCE: 0077 tests 1/10/11 assert resolver exists with signature exposing only store id (`p_store_id uuid`, no tier/count parameter) and that check_store_media_cap (migration line 82), billing normalization, and reads all route through it or a published view. Full suite: 77 files, 2133 tests, all passing.

- [x] G4: Free (cover+5) and Gallery (cover+15) count boundaries include cover-vs-gallery, concurrent intake, pending/approved/rejected, replacement, idempotent retry
  CHECK: npx supabase@2.115.0 test db
  EXPECT: pass
  EVIDENCE: new 0077 tests 4-8: pending/rejected never consume cap; mixed-state counting; fifth approved flips to rejected with `media_cap_exceeded` and upgradeTier=gallery; approved->rejected replacement frees a slot; idempotent retry returns identical result and duplicate key raises 23505. Existing 0072/0073/0074 cover stripe-flag inertness, state transitions, and intake tier enforcement.

- [x] G5: Full Gallery never applies undisclosed count cap; denies with specific published non-count rule/reason/recovery/appeal when other limit applies
  CHECK: npx supabase@2.115.0 test db
  EXPECT: pass
  EVIDENCE: 0077 test 9 asserts 20 approved Gallery rows on Full Gallery store -> allowed with remaining -1 (uncapped); check_store_media_cap returns allowed immediately when resolver returns null (migration lines 94-96). Count caps remain the only count-based limit; moderation/approval gates are separate published non-count rules.

- [x] G6: Existing pilot stores remain Free indefinitely unless independently valid paid subscription changes tier
  CHECK: npx supabase@2.115.0 test db
  EXPECT: pass
  EVIDENCE: store_photo_tier_state default remains `free`/`default` for all stores with no billing row; tier changes only via billing_apply_subscription_event, which requires the active topeka-ks release with photo_tiers_enabled=true (0077 test 10 fixture) and no browser role holds EXECUTE (0072 test). No migration-time promotion of existing rows occurs.

- [x] G7: Shopper catalog_details and gallery reads remain uncapped and return every approved published row deterministically
  CHECK: npm run check
  EXPECT: pass
  EVIDENCE: 0077 test 11 asserts catalog_details applies no row limit, catalog store_media exposes no tier/cap/count column, and catalog_details aggregates app_public.store_media only, never media_private.media_uploads. `npm run check` passes (65 unit tests, tsc -b, vite production build).

- [x] G8: No legacy featured|unlimited value or user-facing label remains outside explicitly tested migration-compatibility boundary
  CHECK: github code search (as G1) plus rejection proofs below
  EXPECT: 0 in live seams
  EVIDENCE: same inventory as G1. The only accepted boundary is billing_apply_subscription_event accepting legacy names from the verified webhook and normalizing featured->gallery / unlimited->full_gallery before persistence (migration lines 156-162), exercised by 0077 test 10; canonical constraints reject all legacy values at every other write path (proved by 23514 insert/update assertions and the upgrade-path rehearsal).

- [x] G9: #123 and #124 consume new resolver/names rather than duplicating cap logic
  EVIDENCE: check_store_media_cap delegates count authority to resolve_store_photo_cap (single `v_cap := partner_private.resolve_store_photo_cap(...)`); it only derives display copy for upgrade advice. billing_apply_subscription_event normalizes to canonical names before persistence. 0073 (subscription transitions) and 0074 (media intake enforcement) pass unchanged against the recreated functions.

- [x] G10: Clean-reset and upgrade-path pgTAP, portal/media tests, security contract, check, and hosted database/web/plan-governance evidence recorded with SHAs
  CHECK: npm run security:contract 2>&1; gh pr checks
  EXPECT: pass
  EVIDENCE: clean-reset full pgTAP suite pass (77 files/2133 tests), upgrade-path rehearsal evidence (above), npm run security:contract pass, npm run check pass, hosted checks database+web+plan-governance green on PR #186 (see pull request status). SHAs recorded in docs/evidence/issue-174/inventory.md.