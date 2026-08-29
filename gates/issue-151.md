# Gates: Issue #151 catalog-card action area

Scope: one labelled CatalogCard visit-action region, its direct responsive styles, and focused evidence. No persistence, authorization, map, image, ranking, or #129 Saved-stores behavior changes.

- [x] G1: Each result card exposes one named, store-specific action region with Add to Trip before all supplied private actions.
      CHECK: npx vitest run src/features/catalog/components.test.tsx
      EXPECT: 1 passed
      EVIDENCE: 2026-08-29 — focused Vitest passed 1 file / 24 tests; the action-region test asserts the exact store-specific name and that Add to Trip precedes the supplied Save action.

- [x] G2: Add to Trip retains only the existing exact encoded `addStoreId` deep link; supplied private controls remain contained rather than gaining storage or authorization behavior.
      CHECK: npx vitest run src/features/catalog/components.test.tsx
      EXPECT: 1 passed
      EVIDENCE: 2026-08-29 — focused Vitest asserts the existing `/trips/new?addStoreId=${encodeURIComponent(syntheticStores[0].id)}` href inside the named region; the implementation change is styles/test evidence only, with no storage/session/RPC code touched.

- [x] G3: Direct CatalogCard styles create one clear metadata-to-actions boundary and preserve 48px targets, keyboard order, labels, and no overflow for anonymous and shopper fixtures at 1440, 768, 390, and 320 CSS px.
      CHECK: npx playwright test --config playwright.review.config.ts e2e/catalog.spec.ts --grep "catalog action area"
      EXPECT: 3 passed
      EVIDENCE: 2026-08-29 — review-harness Playwright passed 3/3 (desktop, tablet, mobile); each project exercised 1440, 768, 390, and 320 widths for anonymous and shopper fixtures, checking the new solid 1px action boundary, first visit link, keyboard progression, 48px targets, and no horizontal overflow.

- [x] G4: Focused source is type-safe, formatted, and whitespace-clean.
      CHECK: npm run typecheck && npx prettier --check src/features/catalog/components.tsx src/features/catalog/components.test.tsx src/app/styles.css e2e/catalog.spec.ts gates/issue-151.md
      EXPECT: All matched files use Prettier code style!
      EVIDENCE: 2026-08-29 — typecheck, ESLint, focused Prettier check, and `git diff --check` each exited 0.

- [x] G5: Dated evidence and REVIEW_VERDICTS distinguish synthetic review-harness presentation coverage from production RPC/RLS/hosted-CI evidence.
      EVIDENCE: 2026-08-29 — `docs/evidence/issue-151/catalog-action-area-2026-08-29.md` and `REVIEW_VERDICTS.md` record the focused results and synthetic-fixture boundary.

- [x] G6: Four completion passes are recorded: implementation, domain reread, defect hunt, and polish; no out-of-scope behavior changes occurred.
      EVIDENCE: 2026-08-29 — (1) added the scoped region boundary/gap treatment; (2) reread CatalogCard/private-action ownership and retained its existing encoded route plus shopper semantics; (3) found that the title's existing absolute link overlay could outrank a static region, then made the region its own stacking context and added a browser boundary/target check; (4) formatted the touched files, reran checks, and recorded the review-harness limitation. No #129 behavior, authorization, storage, RPC, map, image, or ranking code changed.
