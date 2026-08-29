# Issue #151 catalog-card action area evidence — 2026-08-28

## Scope retained

Each `CatalogCard` now contains one named `Visit options for {store name}` action region. The existing `Add to Trip` anchor remains first and retains its exact encoded `addStoreId` transport; the supplied private actions remain immediately after it, inside the same region. No persistence, authorization, ranking, map behavior, image behavior, or Saved-stores continuation changed.

The existing catalog-card layout already keeps metadata complete before the action area and gives supplied private actions a bordered navigation/action block. This narrow change deliberately does not alter global shared styles.

## Checks

- `npm test -- --run src/features/catalog/components.test.tsx`: 1 file / 24 tests passed. The action-region test verifies its exact accessible name, order, private-action containment, and encoded trip route.
- `npx playwright test e2e/catalog.spec.ts --config=playwright.review.config.ts --grep "catalog action area"`: 3 projects passed (desktop, tablet, mobile). Each project repeats anonymous and signed-in shopper states at 1440, 768, 390, and 320 CSS-px widths, checking action order, anonymous sign-in availability, signed-in Save control, keyboard progression, and no horizontal overflow.
- `npm run typecheck`, focused Prettier check, and `git diff --check`: passed.

## Verdict

The public catalog now presents its store-specific continuations as one keyboard-operable decision area while preserving the existing safe visit route and all private-action boundaries.
