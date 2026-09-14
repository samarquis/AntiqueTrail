# Capability Engineering Contracts

Engineering mechanics for the current build scope. Product behavior lives in `PRD.md`, interactions in `DESIGN.md`, visual/accessibility rules in `DESIGN_SYSTEM.md`, and security controls in `SECURITY_AND_TRUST.md`.

## Shared execution rules

Every package uses the single React/TypeScript/Vite PWA and Supabase/PostgreSQL boundary in ADR 0004.

- **Identifiers and records:** UUID primary keys generated server-side; UTC `timestamptz`; immutable `created_at`; server-maintained `updated_at`; mutable aggregates carry positive `version`.
- **Authorization:** base tables have RLS and no `anon` direct grants unless a package explicitly allows an RPC. Clients cannot choose owner, role, scope, or stage fields. Server commands recheck authenticated identity, active grants, resource scope, and current version.
- **Commands:** mutations run through fixed-search-path database RPCs or Edge Functions. Each accepts an idempotency key where retry is possible. Errors use `validation_failed`, `authentication_required`, `recent_auth_required`, `mfa_required`, `not_found`, `not_allowed`, `conflict`, `rate_limited`, `stage_disabled`, `provider_unavailable`, or `internal_error`.
- **Concurrency:** commands lock the state root, compare expected version, apply business rows plus required audit rows in one transaction, and return the prior success for a repeated idempotency key. Stale writes return `conflict` with the current version. Silent last-write-wins is forbidden.
- **Jobs:** scheduled workers take an advisory singleton lock, claim bounded batches with `FOR UPDATE SKIP LOCKED`, record attempt/result, and are idempotent by `(job_type, resource_id, due_at)`.
- **Time:** database `statement_timestamp()` is authoritative. Store calendar rules use the stored IANA time zone.
- **Data lifecycle:** deletion jobs remove dependent Storage objects, write content-free receipts, and are replayed after restore before access resumes.
- **Migrations:** additive schema and disabled server capability first; backfill with counts; enable only after tests. Rollback disables the capability before reverting code.
- **Quality budget:** zero known authorization/privacy/data-loss defects; WCAG 2.2 AA; no unhandled console error. Non-provider commands target p95 under 1 second and p99 under 2 seconds.
- **Evidence:** each ticket proves only its acceptance criteria with the applicable source, database, browser, accessibility, or rollback checks.

## Package 1 — Store directory

Browse and Store Details over the public catalog.

**Schema:** `stores` (name, address, coordinates, phone, website, hours, category tags, description, freshness date, claim state, cover/gallery). Public store rows are readable by `anon` through a bounded catalog RPC.

**Commands:** catalog list/search with name, town, category filters, server-side.

**Rules:** list-first; images responsive with placeholders; neutral fallback for missing images; browse works anonymously without location.

## Package 2 — Identity, sessions, roles, account lifecycle

Supabase Auth with email/password and approved social providers.

**Schema:** `profiles` (user_id, display name, verified email snapshot, age-18 attestation, status); `role_grants` (subject, role, store_id nullable, state, granted/revoked by/at) with exactly one store for Representative; `feature_restrictions`.

**Command set:** `profile_update`, `session_list`, `session_revoke`, `session_revoke_all`, `require_recent_auth`, `grant_synthetic_test_role`, `revoke_synthetic_test_role`, `request_account_export`, `issue_export_download`, `request_account_deletion`, `cancel_account_deletion`.

**Rules:** passwords 12-128 characters, no arbitrary composition rule; verification/recovery email targets `/auth/callback#token_hash=<hash>&type=<verify|recovery>`; links single-use with 30-minute expiry; access tokens 15 minutes; rotating refresh 30 days; refresh-token reuse revokes that session family; Administrator/Representative require TOTP MFA with 10 recovery codes; recent-auth means password plus MFA within 10 minutes; account export ZIP excludes other-user, secret, moderation, and verification data; deletion is scheduled with a 7-day cancel window and day-8 primary purge.

## Package 3 — Shopper-private actions

Saves, personal ratings, notes, correction intake.

**Schema:** `saved_stores(user_id, store_id)`; `private_store_memories(user_id, store_id, rating 1-5 nullable, note, last_visit_month, version)`; `store_correction_reports` (own-status only).

**Commands:** `toggle_save`, `upsert_private_memory`, `delete_private_memory`, `submit_store_correction`, `update_correction_case`.

**Rules:** JIT auth completes the preserved action and returns to context; cancel/failure writes nothing; own rows only; Undo delays destructive purge, then a 24-hour worker removes rows.

## Package 4 — Trip planning

Trips, stops, planning, and private visit memory. (Candidate link capture is deferred.)

**Schema:** `trips` (owner, name, area, date, state, version); `trip_stops` (trip, store, position, expected duration, state, version); `trip_memory` per user.

**Commands:** trip create/update/delete, stop add/remove/reorder, review-hours check, start/end trip, mark arrived/done/skipped, observed-closed.

**Rules:** one-to-eight active stops; default duration 60 minutes with 30/45/60/90/Custom presets; manual order with accessible Up/Down; hours check states `Travel time is not included`; explicit confirmation before starting with unresolved warnings.

## Package 5 — Go mode

**Schema:** active-trip snapshot per Navigator; pending offline mutations with idempotency keys.

**Rules:** offline snapshot in encrypted IndexedDB bound to authenticated account and local install; non-extractable device-local Web Crypto key; replay authorized actions exactly once in recorded order; server authorization and trip state authoritative; purge on completed sync, account switch, logout, authorization loss.

## Package 6 — Store Representative portal

Hours, updates, images, social links, support.

**Schema:** `store_hours` (weekly + dated exceptions), `store_updates` (type, headline, text, image, end date, archive state), `store_media` (approved profile photos with alt text, rights, processing state), `store_social_links`, `support_tickets`.

**Rules:** direct-publish fields vs Administrator-reviewed changes labeled before submission; hours editor with copy-to-days and 14-day preview; text updates publish immediately, image updates wait for image approval; sale requires end date and auto-archives; photo capacity by tier (Free cover+5, Gallery cover+15, Full Gallery unlimited under non-count limits); one social link per platform with validated domains; support states Submitted/In Review/Waiting on You/Resolved/Reopened.

## Package 7 — Administrator

Queued review and Access & Safety.

**Rules:** typed worklist (onboarding, store changes, images, support); Request Changes / Reject require a plain reason; approval shows exact effect; no bulk operations; every mutation audited with actor, time, before/after, reason, result; revoke requires MFA, recent auth, plain reason; regrant never restores broader access.

## Package 8 — Public reviews (staged off until release)

**Schema:** `reviews` (author, store, rating 1-5, text, display name, visit month/year, conflict disclosure, state, version); version history retained internally; aggregate on `stores`.

**Rules:** eligibility after `Done Here` or eligible manual attestation; one active review per user/store; published fields limited to rating, text, display name, visit month/year, edit marker, conflict label; mean and count recomputed transactionally; Store Representative cannot review own store; author delete removes aggregate immediately with 60-second Undo; purge text within 24 hours; moderation transitions Hold/Remove/Restore/Dismiss with reason-coded evidence; one appeal within 30 days to a different reviewer.

## Package 9 — Store membership and Stripe

**Tiers:** Free (claim listing, manage info, 5 photos/month, text updates, social links); Paid $30/month unlimited photos under published non-count limits.

**Integration:** Stripe-hosted Checkout, verified webhooks, Stripe customer portal; never collect or persist card details. Payment does not publish a listing or grant Administrator authority.

**Capability flag:** `photo_tiers_enabled` remains false with prices unset until activation is authorized.

**Schema:** subscription mirror rows keyed to the store's membership; entitlement applied on verified webhook events only.