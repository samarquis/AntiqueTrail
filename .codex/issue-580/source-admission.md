# #580 source-bound admission packet

Date: 2026-10-07. Role: acceptance-source preparation. Added source tests, fixture, and local runner; no tests, provider, database, browser, or service were run.

## State and provenance

- Live issue [#580](https://github.com/samarquis/AntiqueTrail/issues/580) is open, unassigned, and has no linked branch or PR. Its current body is `SPECIFICATION`.
- Local checkout is clean at `9bc4c4fc72c4039f6afe3f6b530ae8c60acc0a8b`; `git ls-remote origin refs/heads/main` returned the same SHA. Planning SHA `76177ad501b164483506921eb064c12c6d94ca09` is an ancestor. No changes to the relevant `src/features/{owner,portal,admin,catalog}`, `supabase/{migrations,tests}`, or `scripts` paths exist between those SHAs.
- Consume [#578's final closure receipt](https://github.com/samarquis/AntiqueTrail/issues/578#issuecomment-6049202226): source `76177ad501b164483506921eb064c12c6d94ca09`; reviewed map SHA-256 `12868EA894B51264E2CA06C47C114A4169C89CA71D16886BA1C49FA8E0E11DD0`; successor-notes SHA-256 `6E87E3E2FE449199450E44963BDEF10488A623757D084D447AF5D95760515747`. Live #580 body currently embeds these final values.
- `supabase/tests/0132_store_owner_access.sql` and `node scripts/test-owner-cancellation.mjs` provide an existing synthetic Owner DB/RLS baseline. They do not prove #580's replacement, Admin-decision, or rendered public-projection flow. Do not repeat the old blanket “no Owner RLS baseline” claim.
- `graft map` returned the current graph (529 files, 2,881 symbols, 7,271 edges; ~870,609 tokens saved). `graft ask` did not return within a minute and was interrupted; the exact source trace below was verified with targeted symbol searches.

## Current behavior and actual gap

- `media_private.media_uploads` has per-upload `version`, actor-scoped idempotency, `display_order`, and `catalog_media_id`; it has no exact approved-slot target. See `supabase/migrations/20260821700000_m01_media_pipeline.sql:54-105`.
- `app_public.store_media` is the actual public slot row with `id`, `store_id`, `kind`, `alt_text`, and `display_order`, but no version. Its one-cover and unique-order indexes are in `supabase/migrations/20260803000000_catalog_foundation.sql:136-148`. Package contracts require mutable aggregates to carry a positive version and reject stale last-write-wins.
- `media_reserve_resubmission` explicitly locks and accepts only a rejected upload, creates a separate row, and applies the ordinary gallery capacity check. It cannot replace approved media. See `supabase/migrations/20260831020000_media_reserve_resubmission.sql:30-74,111-149`; `PortalMediaResubmitInput` is likewise described as a rejected-upload correction in `src/features/portal/types.ts:147`.
- `media_complete_publish_job` already keeps an existing cover until publication succeeds, then deletes the currently published cover by `kind` and inserts the new row. Gallery publication only inserts. The cover branch does not bind the upload to the exact cover observed when Owner submitted it, so a stale concurrent request can replace a newer cover. See `supabase/migrations/20260821700000_m01_media_pipeline.sql:342-359`.
- Existing Admin approval/rejection is a separate authorized transition from `awaiting_review`; approval advances to `approved_pending_publish`, rejection leaves the candidate rejected. Reuse that moderation boundary. See `supabase/migrations/20260825110000_admin_media_moderation.sql:68-181`.
- Existing portal transport supports initial upload and rejected resubmission, not approved gallery-slot replacement. Existing public catalog projection consumes `store_media`; no Catalog renderer change is justified unless the new local rendered flow demonstrates a projection mismatch.

## Contract to publish before READY

One Store Owner replaces one exact approved cover/gallery row. Add a positive `version` to `app_public.store_media` (existing rows begin at `1`). Extend the existing Owner-scoped `portal_preview_public_listing()` response with the current approved media rows `{id, kind, altText, displayOrder, version}`; it already resolves the exact store through `portal_private.require_portal_scope()`. The typed Owner input carries both `targetMediaId` and `expectedVersion`; the target ID identifies the slot, while its version is the compare-and-swap token. Successful replacement updates that exact row's asset/alt text and increments its version, preserving kind and display order. Keep this request distinct from rejected-upload `originalUploadId` resubmission.

The Owner request carries `targetMediaId`, `expectedVersion`, file, required alt text, fresh rights confirmation, and an actor-scoped idempotency key. It carries no authoritative `storeId`, `kind`, or display order: the service derives those from the target after the existing exact-store Owner gate. The server rejects missing, stale, foreign-store, wrong-role, non-current, or wrong-kind targets without revealing foreign row existence or creating an upload/provider operation. Initial cover upload remains available only when no cover exists; when one exists, require explicit target/version replacement rather than retaining the current “replace whichever cover exists at publication” behavior. Bind replay to the file's SHA-256 digest as well as target/version/rights/alt text.

Keep pending media private and the approved row public through cancel-before-submit, upload/processing failure, rejection, or stale-target failure. Only after separate Admin approval **and successful publication** does one transaction compare `targetMediaId` plus `expectedVersion`, replace that row's asset/alt text, increment its version, and record replacement history. A competing/stale publication returns conflict, leaves the slot unchanged, and cleans its private candidate through the existing lifecycle. The new shopper session sees one changed row and matching alt text; pending/rejected candidates never enter public `store_media`. A replacement at full gallery capacity is eligible only after its exact current target is validated; adding a new gallery row at the same cap remains denied. Preserve normal upload, rights, scan, quarantine, retry/idempotency, audit, retention, and cleanup safeguards. Free remains cover + 5 gallery, Gallery cover + 15, and Full Gallery has no count cap; these are persistent capacities, not monthly uploads. No new provider, hosted upload, or modification to #527/#542 serving/manifest ownership.

## Bounded seams and acceptance packet

Implementation files owned by #580, subject to root's shared-file coordination:

- `src/features/portal/types.ts`, `portalClient.ts`, `components.tsx`, and their existing tests for an explicit approved-slot replacement action; keep rejected resubmission separate.
- The same migration extends `portal_preview_public_listing()` with approved slot IDs/versions and `media_list_awaiting_review()` with safe target context, so Owner and Admin see the same slot/version without exposing quarantine keys.
- `supabase/functions/media-provider-command/index.ts` for the replacement target field and server-owned scope resolution.
- One generated migration from `supabase migration new issue_580_media_replacement`, covering `store_media.version`, exact-target reservation, capacity exception, publication-time compare-and-swap, safe old-upload cleanup, and grants/audit as required.
- `supabase/tests/0140_issue_580_media_replacement.sql` plus `supabase/tests/fixtures/media_replacement.inc` for synthetic Owner/Admin/Shopper, Store A/Store B, current cover/gallery, and full-capacity cases. Confirm the test filename remains free when implementation starts.
- `src/features/admin/adminClient.ts`, `components.tsx`, and tests only for showing the reviewer which approved slot the candidate replaces. Reuse existing approve/reject commands.
- `scripts/configured-owner-media-replacement.mjs` and `e2e/issue-580-media-replacement.spec.ts` for one configured local synthetic service/browser journey through Owner submit, Admin decision, then a fresh Shopper public view. Use local fixtures/provider stub; no hosted upload. No `package.json`/shared harness edit unless the owned runner proves it necessary.
- Do not change Catalog implementation by default; assert its existing `store_media` public projection in the local rendered flow.

Independent expected results:

1. Owner with one active exact-store grant submits cover/gallery replacement at `expectedVersion`: one `awaiting_review` candidate, old approved row remains the sole public slot, same idempotency replay returns the same candidate. A direct add-cover request while a cover exists is denied rather than replacing by kind.
2. Different identity or Store B target is denied generically for Store A Owner; no foreign mutation, candidate row, or provider operation.
3. At gallery cap, exact-slot replacement is accepted while add remains denied. Missing rights/alt text is denied.
4. Separate Admin rejection leaves the exact old row and shopper rendering unchanged. Approval alone also leaves it unchanged until publication succeeds.
5. Successful publication updates only the expected current row, preserves ID/kind/order, increments row version once, and a fresh Shopper session renders the new image/alt text once.
6. A second request with the old expectedVersion is stale and cannot overwrite the new row. Cancel-before-submit and failed upload/publication preserve old approved media.

Pinned commands:

- Focused existing/component proof plus selected-store composition: `npx vitest run src/app/configuredComposition.test.ts src/features/portal/portalClient.test.ts src/features/portal/components.test.tsx src/features/admin/adminClient.test.ts src/features/admin/components.test.tsx src/features/catalog/catalogApi.test.ts`.
- New local DB/RLS proof: `supabase test db --local supabase/tests/0140_issue_580_media_replacement.sql` (after the leased local project has applied the migration).
- New configured local rendered flow: `node scripts/configured-owner-media-replacement.mjs`.
- Candidate check: `npm run check`.
- Exact-candidate independent Standards and Spec reviews; high-risk security diff review; rendered desktop/mobile and accessibility states if UI changes. Record evidence under `docs/evidence/TEMPLATE.md`; keep local fixture, local service, hosted/provider, and production claims separate.

## Ownership and gates

- #580 itself has no duplicate GitHub assignee/branch/PR. Root's updated ownership map keeps #579 harness-only, #581 portal/catalog update-only, and #582 Owner-access-only with the Admin client/component file lease. #580's Portal changes wait for #581's committed file handoff; Admin media changes wait for #582's committed file handoff. Do not expand into those tickets' bounded areas.
- #564 owns the heavy test lane. No DB/browser/provider/installer run until root grants a resource lease. This gates that proof run only; it does not block the source contract or unaffected work.
- No hosted account/provider/data, upload, deployment, paid feature, publication, or production gate is needed for this local leaf. #527/#542 and the #507 release hold stay with their owners.
- Freeze exact-slot replacement around `targetMediaId + expectedVersion` CAS: derive store/kind/order server-side; bind idempotent replay to identical target, version, rights, alt text, and file SHA-256; stale/foreign target denial is generic and side-effect-free; replacement is eligible at full capacity while add is denied; Admin rejection leaves the current public row untouched; approval remains private/pending until worker publication updates that exact row once. Proposed DTO is `PortalMediaReplacementInput { targetMediaId, expectedVersion, altText, rightsConfirmed: true, file, idempotencyKey }`. Reservation RPC is `media_reserve_replacement(uuid,bigint,text,uuid,boolean,text,bigint,integer,integer,bytea)` with result carrying `uploadId`, `state`, `replayed`, `targetMediaId`, and private staging keys. No `storeId`, kind, or display order is client-authoritative. Use existing `admin_decide_review_case` for separate Admin decision. New acceptance sources are authorized; no database/browser/service/provider execution before root's resource lease. Owner portal/catalog source changes wait for #581's committed file handoff; Admin client/component changes wait for #582's committed file handoff. Root will publish READY and assign media-only implementation after reviewing these sources.

## Reflection retrieval

The project-reflection learning loop was read. No `PROJECT_REFLECTION_VAULT` or project `Project Memory.md` was configured in this task. The available 2026-09-19 gallery reflection says the prior sparse-photo issue was in source rows, not Catalog rendering; use it as a reminder to inspect the public row after replacement before changing Catalog UI, not as current proof. Acceptance sources were drafted; no test run or reflection event occurred for this prep phase.
