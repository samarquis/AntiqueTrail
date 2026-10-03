# The Market at Macvicar local page handoff

## Decision and scope

User approved one store-scoped complimentary benefit at the highest released store tier, free for **at least five calendar years from actual activation**. Current equivalent is Full Gallery, which has no gallery-count cap. Draft starts with one separate storefront cover and 50 selected gallery photos; 50 is an opening wall, not a plan maximum. No fee, payment method, trial, subscription, renewal, or continuing-review condition. Paid cancellation, failure, downgrade, and webhook state cannot reduce the guarantee. No automatic charge or silent downgrade at its anniversary; any later change requires a separate explicit decision, retaining access while none exists. This is approved product policy, not a provisioned entitlement.

This work owns the local listing draft and a shared photo-wall behavior change. The user accepted the rendered local page and requested publication in test/dev. This GitHub DRAFT PR preserves the prepared draft while hosted gates remain blocked. The parent completed local CUA review on 2026-10-03. The user confirms public launch is deferred until they decide to upgrade the hosting plan. No Macvicar issue exists, and no issue was created or closed. This approval does not admit a hosted store, activate its benefit, or approve a plan change.

Risk: standard visible UI; high-risk media admission remains blocked by M-01. Page uses existing CatalogDetailsPage, StoreGallery, and StorePhotosPage contracts through a read-only adapter enabled only in development on 127.0.0.1 for the exact slug. The adapter lazily imports the static draft; production keeps its configured catalog and cannot load the draft. Media origins use the parent-owned private derivative server at http://127.0.0.1:5981/photos/<photoId>.webp; originals stay private and the derivative route does not satisfy M-01. Run Vite at 127.0.0.1:5982. Provider calls, catalog writes, and paid operations stay outside the app.

## Owned files and interfaces

- docs/plans/market-at-macvicar/store-record.json: sourced business draft, exact hours, and approved but inactive benefit.
- docs/plans/market-at-macvicar/source-rights-manifest.json: source IDs, rights basis, hashes, and acquisition/selection state.
- docs/plans/market-at-macvicar/gallery-wall.json: one cover plus 50 ordered, fact-only gallery captions and alt text; excluded or unavailable images stay out.
- docs/plans/market-at-macvicar/implementation-handoff.md: this boundary and the release handoff.
- src/features/catalog/marketAtMacvicarPreview.ts: static CatalogStore draft built only from the safe gallery-wall.json selection.
- src/features/catalog/StorePhotosPage.tsx: native lazy loading for photo-wall feature and tile images; changes image request timing across all store galleries without changing layout or catalog data.
- src/app/App.tsx: stable read-only adapter with a development+loopback+exact-slug gate for the existing details and photos routes. Production continues through its configured catalog and fails closed when the record is absent.
- e2e/market-at-macvicar.preview.spec.ts and playwright.market-at-macvicar.config.ts: actual-route desktop/mobile proof on isolated Vite port 5982. Browser allows app GETs and GETs for only the 51 exact derivative names from parent server port 5981; every other request aborts. No database, Auth, provider, or other local test service.
- No media files, fixture UUIDs, membership schema, production catalog rows, provider configuration, or public-store allowlist changes enter the implementation.

The public data seam is existing CatalogStore.media: CatalogMedia[] (kind cover/gallery, src, alt, optional caption and rightsLabel). CatalogDetailsPage and StorePhotosPage load through CatalogClient.details(slug). Draft ID is a non-UUID local sentinel; save, claim, and other private writes remain unavailable. Live catalog_list/details explicitly filter synthetic stores, and bindings_store_ids_check has cardinality 12; adding a real store requires a narrow projection/RLS/binding amendment, not an extra fixture.

## Local proof

Use Vite on 127.0.0.1:5982 with strict port, no server reuse, one Playwright worker, and the parent-owned derivative server on 127.0.0.1:5981:

- npx --no-install playwright test --config playwright.market-at-macvicar.config.ts
- npm run build

Initial local source and selected-media proof completed on candidate SHA `99221830705ca13d54d9297f2cf1984b65b92844`. Final preview code candidate `f104c61287951334acb9591ab0fec56339067e7c` adds the full postal address and native lazy loading to shared photo-wall images, changing request timing across all store galleries. Selected media and the development-only host/slug gate remain unchanged. Full evidence is recorded in [local preview evidence](../../evidence/market-at-macvicar/local-preview.md).

Final focused local verification on the code candidate:

- `npx --no-install playwright test --config playwright.market-at-macvicar.config.ts`: PASS, 4 tests. Complete address in About; fresh-page cover decode and lazy lower-tile load; wrong-slug and localhost-host fallbacks with no media or blocked external requests; and 503 fallback.
- The separate desktop/mobile asset pass forces and verifies all 51 exact WebP requests, response statuses and content types, layout at 1440px/390px, Escape close, and opener focus return.
- `npm run build`: PASS, 241 modules transformed. Production `dist` scan found 59 identity, contact, origin, and selected-media markers absent.
- Ordinary Playwright discovery: 760 tests in 48 files, with this preview suite excluded. Dedicated preview discovery: 4 tests in 1 file.
- Reticle MCP is unavailable in this environment and was not installed. The parent completed local CUA review, and the user accepted the rendered local page and requested publication in test/dev.

The first development-only import can be cold; its measured local module response exceeded the old five-second heading wait. The detail readiness wait is 45 seconds and the complete viewport test has a 120-second budget. These waits do not change application bootstrap behavior.

## Admission and publication path

Business information is sufficient to prepare the listing. Remaining blockers are technical and authority gates, not missing store facts:

1. Site Admin uses normal store admission and owner/claim verification; assigns the real stable store UUID and binds the exact record in the intended backend.
2. Implement and review the narrow store-keyed complimentary grant at the existing effective photo-tier boundary. It must outrank paid lifecycle downgrades for this store during the minimum guarantee and must not touch Stripe. Persist actual activation and its five-calendar-year guarantee; never synthesize a date.
3. Complete M-01 provider identity, scanning/re-encoding/metadata-removal, private review, Admin approval, immutable derivative publication, cleanup, recovery, and human PASS receipts. Current runbook is UNACCEPTED / NO-GO. Parent's 2026-10-03 read-only hosted check found `media_provider_config` blocked, `accepted_at` and `gate_receipt_id` null, provider command/worker functions absent, no Macvicar store row, and the public-test catalog bound to exactly 12 existing fictional store UUIDs. Keep that allowlist intact.
4. Admit only the exact store UUID through the separately governed real-store publication path; upload the 51 reviewed assets through M-01; bind only approved published derivatives and reviewed catalog fields.
5. User approval for this rendered page's test/dev publication is already received; do not request it again. Separate hosted-release acceptance remains outstanding: named Product, Security, and Operations provider acceptance, plus review of exact source/artifact, hosted backend, canonical deployment, rendered desktop/mobile behavior, capability-specific allow/deny evidence, and exact release/recovery receipts.

No hosted publication claim follows from this local route or build.

## Public-launch blockers

The user confirms this work remains in test/dev; public launch and any hosting-plan upgrade are deferred until the user chooses to go live. The read-only Vercel team check on 2026-10-03 reported Hobby with no trial. Vercel's [commercial-use guidance](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) limits Hobby to personal, noncommercial use and classifies advertising products or services as commercial, so a public commercial store showcase needs an eligible plan before launch. No upgrade is authorized by this draft PR. The separate release owner reports #511 OPEN/BLOCKED pending preserved-beta recovery and custom-secret custody proof.
