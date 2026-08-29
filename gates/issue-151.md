# Gates: Issue #151 catalog-card action area

Scope: group existing public catalog visit and private continuations without changing persistence, authorization, or shared styles.

- [x] G1: Each catalog result card exposes one named action region for its exact store, ordered with Add to Trip before supplied private actions.
  CHECK: npm test -- --run src/features/catalog/components.test.tsx
  EXPECT: Test Files  1 passed
  EVIDENCE: 2026-08-28 focused Vitest passed 1 file / 24 tests; the action-region test asserts the exact store name and `Add to Trip` before the supplied Save action.

- [x] G2: Add to Trip keeps the existing encoded exact-store deep link, while private controls remain inside the same region.
  CHECK: npm test -- --run src/features/catalog/components.test.tsx
  EXPECT: Test Files  1 passed
  EVIDENCE: 2026-08-28 focused Vitest asserts `/trips/new?addStoreId=${encodeURIComponent(syntheticStores[0].id)}` inside the named region.

- [x] G3: Browser coverage confirms the action region, anonymous sign-in continuation, shopper private control, keyboard order, and narrow layout without overflow.
  CHECK: npx playwright test e2e/catalog.spec.ts --grep "catalog action area"
  EXPECT: passed
  EVIDENCE: 2026-08-28 targeted review Playwright passed all 3 projects and repeats anonymous and shopper-a fixtures at 1440, 768, 390, and 320 CSS px.

- [x] G4: The focused implementation is type-safe and formatted.
  CHECK: npm run typecheck
  EXPECT: exit 0
  EVIDENCE: 2026-08-28 `npm run typecheck`, targeted Prettier check, and `git diff --check` passed.
