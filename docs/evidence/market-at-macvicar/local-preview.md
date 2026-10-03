# The Market at Macvicar local preview evidence

## Reviewed scope

The user accepted the rendered local page and requested publication in test/dev. Parent CUA review completed on 2026-10-03. The user defers public launch and any hosting-plan upgrade until they choose to go live. This PR preserves the prepared draft while hosted gates remain blocked.

## Candidate and preservation commits

- Reviewed application and selected-media candidate: `99221830705ca13d54d9297f2cf1984b65b92844`.
- Test-discovery and handoff delta: `31325054e7749f3c993aba8115a9930372cca5cd`. It changes Playwright discovery and documentation only; app source and selected media are unchanged.

Previously completed local validation on the reviewed candidate:

- `npx tsc -b --pretty false`: passed.
- `npx --no-install playwright test --config playwright.market-at-macvicar.config.ts`: 2 passed. Covered real detail and gallery routes, desktop/mobile 1440px and 390px layouts, all 51 exact WebP requests and response metadata, keyboard close and focus return, and a simulated 503 image fallback.
- `npm run build`: passed, 241 modules transformed. The production output scan found no store name, slug, draft sentinel, selected photo ID, or localhost derivative origin.

Discovery after the delta:

- Ordinary `npx --no-install playwright test --list`: 760 tests in 48 files; no Macvicar preview tests listed. Before the delta, discovery listed 764 tests in 49 files, including four project instances of the two-test preview suite.
- `npx --no-install playwright test --config playwright.market-at-macvicar.config.ts --list`: 2 tests in 1 file.

## Media evidence boundary

The checked-in `gallery-wall.json` records one cover and 50 selected gallery photos. The candidate's Playwright run verified the preview's 51 exact WebP requests and their response metadata. An earlier private local derivative-processing receipt remains in local custody; its contents and identifiers are not reproduced here. This evidence does not assert that receipt identifiers match the checked-in wall entries. Neither the private receipt nor the local preview test satisfies M-01 hosted acceptance.

## Hosted and release limits

No hosted catalog insertion, provider operation, benefit activation, deployment, or public release is established by this evidence. The 2026-10-03 read-only hosted check found `media_provider_config` blocked, `accepted_at` and `gate_receipt_id` null, provider command/worker functions absent, no Macvicar row, and the test catalog bound to 12 existing fictional stores. M-01 remains UNACCEPTED / NO-GO. The separate release owner reports #511 OPEN/BLOCKED pending preserved-beta recovery and custom-secret custody proof.

The read-only Vercel team check on 2026-10-03 reported Hobby with no trial. [Vercel commercial-use guidance](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) restricts Hobby to personal, noncommercial use and treats advertising products or services as commercial. A public commercial store showcase needs an eligible plan; the user defers that decision until public launch.
