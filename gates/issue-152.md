# Gates: Issue #152 — scalable administrator review queue

Scope: `ReviewQueuePage`, its direct styles and focused unit/e2e evidence. No decision contract, RPC, permission, or GitHub issue-state change.

- [x] G1: Queue loading, ready (one and multiple cases), empty, and error/retry render inside a named bounded workspace; no state is a bare full-width list/button.
      CHECK: `npx vitest run src/features/admin/components.test.tsx`
      EXPECT: focused admin component tests pass with explicit state assertions.
      EVIDENCE: 2026-08-29 — `src/features/admin/components.test.tsx` passed 11/11, including explicit one/multiple, loading, empty, and error/retry workspace assertions.

- [x] G2: The summary derives only from returned assigned cases and exposes category context without changing filtering or decision semantics; every case exposes exactly one Review path.
      CHECK: `npx vitest run src/features/admin/components.test.tsx`
      EXPECT: focused admin component tests pass with one/multiple category/count and Review-path assertions.
      EVIDENCE: 2026-08-29 — focused tests assert returned assigned categories/counts, category filters, and one named Review button per visible case; `adminClient.ts`, types, and RPC calls are unchanged.

- [x] G3: Success removes only the resolved assigned case, shows the existing authoritative outcome, and returns focus to the queue heading/status; failure continues through the existing generic Admin boundary.
      CHECK: `npx vitest run src/features/admin/components.test.tsx`
      EXPECT: focused admin component tests pass with resolve and focus-return assertions.
      EVIDENCE: 2026-08-29 — focused test verifies a two-case category decrements from 2 to 1 after success; existing decision test and browser success flow verify the preserved outcome and h1 focus return.

- [x] G4: Desktop plus 390px and 320px layouts preserve reading order, focus visibility, 48px actions, wrapped labels, and no horizontal overflow.
      CHECK: `npx playwright test --config playwright.review.config.ts e2e/ui09-admin-moderation.spec.ts`
      EXPECT: focused review-harness browser tests pass, including queue keyboard/mobile assertions.
      EVIDENCE: 2026-08-29 — `npx playwright test --config playwright.review.config.ts e2e/ui09-admin-moderation.spec.ts --reporter=line` recorded 36 passed / 0 failed / 3 skipped across desktop, tablet, and mobile; direct queue assertions cover workspace, focus return, 320px targets, and overflow.

- [x] G5: Type safety and source formatting pass for the changed production/test surfaces.
      CHECK: `npm run typecheck && npx prettier --check src/features/admin/components.tsx src/features/admin/components.test.tsx src/app/styles.css e2e/ui09-admin-moderation.spec.ts`
      EXPECT: both commands exit 0.
      EVIDENCE: 2026-08-29 — `npm run typecheck`, `npm run lint`, source Prettier check, and `git diff --check` each exited 0.

- [x] G6: Four completion passes are recorded: implementation, domain reread, defect hunt, and polish; no decision/RPC safety surface changes.
      EVIDENCE: 2026-08-29 — (1) built bounded header/workspace/cards/states; (2) reread against the authoritative category-count contract and left AdminClient/types/RPC untouched; (3) browser pass exposed a loading-status regression, corrected before the final 36 passed / 3 skipped run; (4) normalized source/markdown formatting, checked mobile grid/overflow plus `git diff --check`, and recorded the synthetic-harness boundary in `docs/evidence/issue-152/review-queue-composition-2026-08-29.md` and `REVIEW_VERDICTS.md`.
