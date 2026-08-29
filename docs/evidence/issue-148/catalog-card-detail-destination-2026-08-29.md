# Issue #148 catalog-card detail destination — 2026-08-29

## Scope and root cause

`CatalogCard` exposed the store title as its only explicit detail destination, then enlarged that title link with a full-card pseudo-element. On touch and keyboard paths, the obvious card surface did not communicate the real destination and the overlay risked competing with nested controls.

The card now retains the linked store-name heading and adds the visible primary link `View {store name} details`. Both links use the same encoded `/stores/:slug` route and preserve `rememberBrowseReturn`. The title overlay is removed; the heading link and primary link each meet the shared 48 CSS-px target contract. The existing #151 `Visit options for {store}` region is unchanged: `Add to Trip` retains its encoded `addStoreId` deep link and secondary treatment, while private actions and correction links remain inside their existing authorization-owned content.

## Four-pass record

1. **Implementation:** added the explicit primary detail link and scoped catalog-card styles; did not change routing, catalog data, authentication, ranking, filtering, map selection, or #151 action-region markup.
2. **Domain review:** kept the name as a semantic linked heading, used the same route/return handler for both detail links, and made the title link a normal bounded interactive target instead of a misleading full-card overlay.
3. **Defect hunt:** corrected the browser assertion to match multi-class controls and made the dark check set the product's attribute-driven `data-theme=dark` state rather than only emulating a system color scheme.
4. **Polish/recheck:** verified 48px target geometry, focus progression from details to trip to sign-in, the failed-image placeholder path, no horizontal overflow, dark mode, and forced-colors focus at 320 CSS px.

## Fresh checks

- `npx vitest run src/features/catalog/components.test.tsx`: **1 file / 25 tests passed**. The focused assertion confirms the exact named detail action and its slug path while preserving the title link and `Add to Trip`'s encoded store-ID route.
- `npx playwright test --config playwright.review.config.ts e2e/catalog.spec.ts --grep "catalog detail destination"`: **3 passed** (desktop, tablet, mobile projects). Each run exercises 1440, 768, and 320 CSS-px card geometry, named route, keyboard activation, focus order/non-interference, `Add to Trip` hierarchy, and 320px dark/forced-colors no-overflow/minimum-target checks. The blocked-cover test also asserts the same named detail route beside `Store image unavailable / Photo coming soon`.
- `npm run typecheck`, `npm run lint`, scoped `npx prettier --check`, and `git diff --check`: passed.

## Evidence boundary

The browser proof uses deterministic review-harness fixtures. It demonstrates rendered hierarchy, client-side route wiring, keyboard focus, responsive geometry, dark/forced-colors presentation, and failed-image parity. It is not evidence of production authentication/session behavior, RPC/RLS enforcement, database persistence, catalog-provider behavior, or hosted CI; this ticket changes none of those surfaces.
