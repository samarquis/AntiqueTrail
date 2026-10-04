# The Market at Macvicar local preview evidence

## Reviewed scope

The user accepted the rendered local page and requested publication in test/dev. Parent CUA review completed on 2026-10-03. The user defers public launch and any hosting-plan upgrade until they choose to go live. This branch preserves the prepared draft while hosted gates remain blocked. No Macvicar issue exists; no issue was created or closed.

## Source revisions

- Initial reviewed app and selected-media candidate: `99221830705ca13d54d9297f2cf1984b65b92844`.
- Test-discovery and handoff commit: `31325054e7749f3c993aba8115a9930372cca5cd`.
- Final local-preview code candidate: `03241ef63cecef0e87a28e854f5118e45589fd5a`. It adds the full postal address to the store description, native lazy loading to shared photo-wall feature and tile images, and bounded browser checks. Lazy loading changes image request timing across all store galleries; Macvicar identity and selected media remain excluded from production. Selected media files and `gallery-wall.json` are unchanged. A later Prettier-only commit from reviewed candidate `f104c61287951334acb9591ab0fec56339067e7c` changed formatting in `App.tsx` and the preview spec. Prettier passed; full TypeScript AST comparison (normalizing JSX line endings and redundant parentheses) passed on both files, and an in-memory hostname-change negative control was detected.

Initial local validation on the first reviewed candidate:

- `npx tsc -b --pretty false`: passed.
- `npx --no-install playwright test --config playwright.market-at-macvicar.config.ts`: 2 passed. Covered real detail and gallery routes, desktop/mobile 1440px and 390px layouts, all 51 exact WebP requests and response metadata, keyboard close and focus return, and a simulated 503 image fallback.
- `npm run build`: passed, 241 modules transformed. The production output scan found no store name, slug, draft sentinel, selected photo ID, or localhost derivative origin.

No failing lazy-delivery baseline was recorded before adding the native loading attributes. The initial asset test set every image to eager and did not establish normal lazy behavior; the final candidate check below is direct post-change evidence, not a TDD red/green claim.

## Final-candidate verification

On `03241ef63cecef0e87a28e854f5118e45589fd5a`:

- `npx --no-install playwright test --config playwright.market-at-macvicar.config.ts`: 4 passed. Address assertion checks the complete postal address in About. A fresh page opens `/photos`, confirms native lazy loading and fewer than 51 complete images at the top, decodes the visible cover, then scrolls photo 50 into view and confirms its successful decode and response. The separate desktop/mobile asset pass still forces and verifies all 51 exact derivatives; the simulated 503 fallback remains covered.
- The host/slug denial test checks wrong slug on `127.0.0.1` and exact slug on `localhost`, across details and photos routes. Both use the normal `Store not found` fallback. Neither shows the Macvicar heading or photos; both record zero media responses and zero blocked provider/database or other external requests.
- `npm run build`: passed, 241 modules transformed; PWA service worker generated.
- Production `dist` scan: 59 draft markers absent, including store name, slug, sentinel, address, phone, email, Facebook URL, derivative origin, and all 51 photo IDs.

- Ordinary `npx --no-install playwright test --list`: 760 tests in 48 files; no Macvicar preview tests listed. Before test exclusion, discovery listed 764 tests in 49 files, including four project instances of the preview suite.
- `npx --no-install playwright test --config playwright.market-at-macvicar.config.ts --list`: 4 tests in 1 file.

A focused existing-gallery regression through normal CI remains a merge gate; this draft PR has not been merged.

## Media evidence boundary

The checked-in `gallery-wall.json` records one cover and 50 selected gallery photos. The candidate's Playwright run verified the preview's 51 exact WebP requests and their response metadata. An earlier private local derivative-processing receipt remains in local custody; its contents and identifiers are not reproduced here. This evidence does not assert that receipt identifiers match the checked-in wall entries. Neither the private receipt nor the local preview test satisfies M-01 hosted acceptance.

## Hosted and release limits

User approval for test/dev publication of the rendered page is already received. It does not establish hosted catalog insertion, provider operation, benefit activation, deployment, or public release. The 2026-10-03 read-only hosted check found `media_provider_config` blocked, `accepted_at` and `gate_receipt_id` null, provider command/worker functions absent, no Macvicar row, and the test catalog bound to 12 existing fictional stores. M-01 remains UNACCEPTED / NO-GO. Named Product, Security, and Operations provider acceptance plus exact release/recovery receipts remain outstanding. The separate release owner reports #511 OPEN/BLOCKED pending preserved-beta recovery and custom-secret custody proof.

The read-only Vercel team check on 2026-10-03 reported Hobby with no trial. [Vercel commercial-use guidance](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) restricts Hobby to personal, noncommercial use and treats advertising products or services as commercial. A public commercial store showcase needs an eligible plan; the user defers that decision until public launch.
