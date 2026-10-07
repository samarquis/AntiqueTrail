# Capability Engineering Contracts

Engineering mechanics for the current build scope. Product behavior lives in `PRD.md`, interactions in `DESIGN.md`, visual/accessibility rules in `DESIGN_SYSTEM.md`, and security controls in `SECURITY_AND_TRUST.md`.

Scope: [approved shopper-first PRD](PRD.md), 2026-10-06. Schema/command names below describe reusable existing contracts, not proof that the new journey is complete. Pin missing field/API and migration decisions in small implementation contracts before READY; do not silently rewrite runtime permissions.

## Shared execution rules

Every package uses the single React/TypeScript/Vite PWA and Supabase/PostgreSQL boundary retained in ADR 0009.

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

Favorites (existing saves), private ratings/notes and existing correction intake. Public store sharing needs only a canonical public URL, not a recipient database or inbox.

**Schema:** `saved_stores(user_id, store_id)`; `private_store_memories(user_id, store_id, rating 1-5 nullable, note, last_visit_month, version)`; `store_correction_reports` (own-status only).

**Commands:** `toggle_save`, `upsert_private_memory`, `delete_private_memory`, `submit_store_correction`, `update_correction_case`.

**Rules:** JIT auth completes the preserved action and returns to context; cancel/failure writes nothing; own rows only; Undo delays destructive purge, then a 24-hour worker removes rows.

## Package 4 — Trip planning

One-organizer day trips, catalog/private stops, travel-aware suggested order and private visit memory. Manual source-link entry is included; automated extraction and recipient Candidate Share are deferred.

**Schema:** `trips` (owner, name, area, date, state, version); `trip_stops` (trip, store, position, expected duration, state, version); `trip_memory` per user.

**Commands:** trip create/update/delete, stop add/remove/reorder, review-hours check, start/end trip, mark arrived/done/skipped, observed-closed.

**Rules:** one-to-eight active stops; default duration 60 minutes with 30/45/60/90/Custom presets; accessible manual reorder. Suggested order uses driving time, browsing duration and known hours and requires explicit user acceptance. A travel-unavailable hours fallback says `Travel time is not included` and does not satisfy suggestion acceptance. Private unlisted stops need address/source/hours mapping and validated navigation destination in a pinned contract; labels alone are insufficient. Preserve selected store across sign-in/chooser and idempotent retries. No public listing from private input.

## Package 5 — Go mode

Explicit Maps/Waze handoff for each stop, arrived/done/skip/end actions and private memory. Online-first target with recoverable failures and no silent data loss. No automatic location tracking.

Existing encrypted offline snapshots, signed device grants and replay are compatibility dependencies, not new milestone requirements. Any decoupling must preserve access denial, retained private data and recoverability; changing a UI flag alone cannot remove those dependencies safely.

## Package 6 — Store Representative portal

Hours, updates, images, social links, support.

**Schema:** `store_hours` (weekly + dated exceptions), `store_updates` (type, headline, text, image, end date, archive state), `store_media` (approved profile photos with alt text, rights, processing state), `store_social_links`, `support_tickets`.

**Rules:** direct-publish fields vs Administrator-reviewed changes labeled before submission; hours editor with copy-to-days and 14-day preview; text updates publish immediately, image updates wait for image approval; sale requires end date and auto-archives; photo capacity from the [membership contract](docs/specs/store-membership-spec.md), with existing entitlements preserved until reviewed migration; one social link per platform with validated domains; support states Submitted/In Review/Waiting on You/Resolved/Reopened.

## Package 7 — Administrator

Queued review and Access & Safety.

**Rules:** typed worklist (onboarding, store changes, images, support); Request Changes / Reject require a plain reason; approval shows exact effect; no bulk operations; every mutation audited with actor, time, before/after, reason, result; revoke requires MFA, recent auth, plain reason; regrant never restores broader access.

## Package 8 — Public reviews (staged off until release)

Deferred from the first release, including public ratings, responses, moderation and appeals. Existing review data and reachable services retain their authorization, privacy and lifecycle rules. No new public review work is a dependency of private visit memory.

## Package 9 — Store membership and Stripe

The [membership spec](docs/specs/store-membership-spec.md) alone owns capacity and commercial decisions. Free listing first; paid prices/capacities unresolved. Persistent capacity, not monthly upload/deletion quotas. `photo_tiers_enabled` stays disabled until separately authorized paid activation.

Stripe-hosted Checkout, verified webhooks and supported customer portal; never collect cards. Preserve exact-store entitlement, idempotency and provider reconciliation. New custom schedules/paid-to-paid transitions are deferred. Existing subscriber obligations must be inventoried and preserved before any migration.

## Store Owner authority and test workspace

Use [Store Owner authority](docs/specs/store-owner-authority.md) for one responsible owner per store, Site Admin approval, exact-store server enforcement and safe revocation. Existing Representative/team grants remain intact. Local acceptance needs listing setup/management and direct/controlled publication, not a complete synthetic team/analytics/promotion/review-reply suite. Runtime role mapping remains a scoped implementation decision.

## Public test execution contract

The authorized free public test (ADR 0010) uses a pinned prebuilt artifact from an isolated clean checkout. The stable entry is `https://antique-trail.vercel.app/`. Anonymous visitors browse the synthetic catalog; admitted accounts save stores within the inventoried catalog. [ADR 0011](docs/adr/0011-market-at-macvicar-public-listing.md) governs the single admitted Market at Macvicar projection and first eligible result; its exact real UUID, approved media/capacity, and lawful hosting remain separately receipted. Existing fictional binding cardinality and synthetic catalog predicates must not be weakened into arbitrary real-store exposure. All RLS, auth, and RPC gates remain enforced. The substitute hosting/recovery acceptance receipt replaces H-01 for this test only and is not an H-01 pass. Registration stays closed until account/provider acceptance is complete. See [public test admission](docs/operations/PUBLIC_TEST_ADMISSION.md).

For that exact curated real UUID only, the protected operator may record `administrator_curated_source` verification of identity/location, contact, hours, and categories/attributes with actual review time and source/decision references. Reuse existing four-group completeness and freshness age rules; preserve other verifier classifications and ordinary store rules. Profile or verification changes invalidate the pinned admission. This channel grants no general catalog exposure outside the exact active admission and creates no account or privileged role.

ADR0011 also delegates the opening manifest `f1a7bd7608abbe3f758314587505da4feccb4e944ee8c5e1c5f66c3add3f6a0d` to the named protected release operator for actual per-derivative curated admission decisions under the existing human selection/publication approval. Protected receipts must retain the authentic permission reference, exact hash and PostgreSQL canonical metadata digest, truthful delegated approver, actual approval time, and immutable measured security/independent review references. This fixed-selection delegation creates no application role, MFA or M-01 receipt, general upload capability, or approval of replacements. All existing media, expiry, withdrawal and activation prerequisites remain required.

## Store-first pilot activation contract

A controlled invited pilot binds the exact candidate, permitted data, accounts/stores, explicit capability allowlist, authentic current approvals/evidence, expiry/stop and rollback. Approval creates Free; billing stays staged off until the exact future offer and applicable commercial/provider activation evidence pass. Public discovery, public registration/intake, promotion, and live billing never follow automatically from a showcase or a controlled pilot.

## Store Owner cancellation decision — 2026-10-01

Retained compatibility reference: [local fake-provider cancellation contract](docs/specs/store-owner-paid-servicing.md). It creates no first-outing dependency or live provider permission. Existing legitimate cancellation/servicing obligations remain protected; do not erase schedules or consent records during scope cleanup.
