# Gates: issue #150 trip-planning CTA hierarchy and safe stop removal

Scope: make `PlanPage` task-oriented without changing trip client contracts, and replace immediate stop removal with an accessible, case-scoped confirmation.

- [x] G1: Every Plan page task section has one primary completion action at most; utilities and trip navigation use secondary treatment while preserving existing labels and behavior.
      CHECK: npm test -- --run src/features/trips/components.test.tsx
      EXPECT: components.test.tsx
      EVIDENCE: 2026-08-29: 22 component tests passed; `PlanPage` labels identity, schedule, starting place, offline planning, stops, add-stop, hours, and navigator sections. Unit and UI07 tests assert form-primary versus utility-secondary classes.

- [x] G2: Reorder controls retain their accessible names and boundary-disabled semantics, and use shared secondary styling.
      CHECK: npm test -- --run src/features/trips/components.test.tsx
      EXPECT: components.test.tsx
      EVIDENCE: 2026-08-29: focused component test passed with existing `Move <stop> up/down` labels; UI07 asserts the boundary-disabled controls and the `button--secondary` class.

- [x] G3: Removing a stop requires a confirmation that names the selected stop; cancelling leaves the plan unchanged, confirming removes only that stop and announces the outcome.
      CHECK: npm test -- --run src/features/trips/components.test.tsx
      EXPECT: components.test.tsx
      EVIDENCE: 2026-08-29: component test proves no `removeStop` call before confirmation, cancel restores focus to the exact trigger, confirm calls only `stop-a`, and status announces removal. UI07 repeats cancel/confirm against Blue Finch Curios.

- [x] G4: The complete trip edit and safe-removal path is covered in Playwright without changing persistence, authentication, catalog, or device/offline contracts.
      CHECK: npx playwright test e2e/ui07-trip-flows.spec.ts --grep "plan interactions update|trip-planning hierarchy stays distinct" --reporter=list
      EXPECT: passed
      EVIDENCE: 2026-08-29: 4 passed: plan edit/safe removal and viewport/theme hierarchy in Chromium and mobile projects; persisted `test-results/.last-run.json` is `status: passed`, `failedTests: []`.

- [x] G5: Type safety passes for the touched implementation and tests.
      CHECK: npm run typecheck
      EXPECT: tsc -b --pretty false
      EVIDENCE: 2026-08-29: `npm run typecheck` passed.

- [x] G6: Scoped lint, formatting, and diff hygiene pass for touched files.
      CHECK: npx prettier --check src/features/trips/components.tsx src/features/trips/components.test.tsx src/app/styles.css e2e/ui07-trip-flows.spec.ts gates/issue-150.md docs/evidence/issue-150/trip-planning-cta-hierarchy-2026-08-29.md
      EXPECT: All matched files use Prettier code style!
      EVIDENCE: 2026-08-29: scoped ESLint passed silently; Prettier reported all changed source, test, gate, and dated evidence files formatted; `git diff --check` was clean. The only Git notice was existing LF-to-CRLF normalization on the touched test file.

- [x] G7: Dated browser/evidence records cover requested desktop, tablet, 320px, dark, and forced-colors hierarchy checks; synthetic harness limits are stated and REVIEW_VERDICTS is reconciled.
      EVIDENCE: 2026-08-29: `docs/evidence/issue-150/trip-planning-cta-hierarchy-2026-08-29.md` and `REVIEW_VERDICTS.md` record coverage and fixture limits.

- [x] G8: Four implementation passes are completed: implementation, domain review, defect hunt, and polish; no scope-expanding changes remain.
      EVIDENCE: 2026-08-29: implemented task sections and confirmation; domain review retained explicit task labels and ordered-stop numbering; defect hunt repaired an unawaited browser style read and re-ran all focused checks; polish retained native list numbering and fixed-nav scroll clearance. No client, transport, auth, catalog, or persistence contract changed.
