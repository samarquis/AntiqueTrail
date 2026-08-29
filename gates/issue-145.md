# Gates: Issue #145 compact review context

Scope: replace the review-only banner's generic card treatment with a compact, accessible context strip and verify that review/production boundaries and major review routes remain correct.

- [x] G1: Review context preserves scenario, fixture state, session state, and Switch or reset in the existing reading order without `page-card` styling.
  CHECK: npm test -- --run src/review-harness/components.test.tsx src/review-harness/harness.test.ts
  EXPECT: /Test Files  2 passed/
  EVIDENCE: Focused harness run passed 2 files / 12 tests; `ReviewHarnessBanner` coverage asserts content order, reset destination, and absence of `page-card`.

- [x] G2: Dedicated responsive strip styles avoid card-scale spacing while retaining a 48px keyboard-visible link target and safe narrow-width wrapping.
  CHECK: npm run format
  EXPECT: /All matched files use Prettier code style!/
  EVIDENCE: Dedicated `.review-harness-banner` uses narrow strip spacing and 390px wrapping; formatter passed. Browser geometry checks require link height >= 48px and no horizontal overflow, including 320px.

- [x] G3: Review routes retain the compact context at required role surfaces and production retains no review harness UI.
  CHECK: npx playwright test e2e/review-harness.spec.ts --config=playwright.review.config.ts
  EXPECT: /passed/
  EVIDENCE: The compact-context Playwright test passed in all 3 configured projects; route loop covers public, shopper, representative, administrator, and explicit 320px. `harness.test.ts` retains production-mode null-harness coverage.

- [x] G4: Typecheck, lint, format, diff check, and dated evidence/reconciliation records pass before closure.
  EVIDENCE: Local typecheck, lint, format, and diff check passed. Dated route evidence is in `docs/evidence/issue-145/review-context-2026-08-28.md`; verdict reconciliation is recorded in `REVIEW_VERDICTS.md`.
