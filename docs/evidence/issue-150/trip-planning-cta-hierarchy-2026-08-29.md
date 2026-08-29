# Issue #150: Trip-planning CTA hierarchy and safe stop removal

Date: 2026-08-29

## Delivered scope

`PlanPage` now exposes its existing planning work as named sections: trip identity, schedule, starting place, offline planning, stops, add a stop, store hours, and navigator device. Each form keeps one explicit filled completion action; utilities, offline/device actions, and reorder controls use the shared secondary treatment. The stop-specific `Remove` control uses the shared destructive treatment and opens a case-scoped confirmation that names the stop, offers `Keep <stop>`, changes nothing until `Yes, remove <stop>` is chosen, restores focus after cancellation, and announces confirmation.

No trip-client, transport, persistence, authentication, catalog, navigator authorization, or offline-queue contract was changed.

## Rerunnable checks

- `npm test -- --run src/features/trips/components.test.tsx` — 1 file, 22 passed.
- `npm run typecheck` — passed.
- `npx eslint src/features/trips/components.tsx src/features/trips/components.test.tsx e2e/ui07-trip-flows.spec.ts` — passed with no output.
- `npx prettier --check src/features/trips/components.tsx src/features/trips/components.test.tsx src/app/styles.css e2e/ui07-trip-flows.spec.ts gates/issue-150.md docs/evidence/issue-150/trip-planning-cta-hierarchy-2026-08-29.md` — all matched files formatted.
- `git diff --check -- src/features/trips/components.tsx src/features/trips/components.test.tsx src/app/styles.css e2e/ui07-trip-flows.spec.ts gates/issue-150.md` — clean.
- `npx playwright test e2e/ui07-trip-flows.spec.ts --grep "plan interactions update|trip-planning hierarchy stays distinct" --reporter=list` — 4 passed: complete edit/safe removal plus presentation hierarchy in Chromium and mobile. `test-results/.last-run.json` records `status: passed` and no failed tests.

The presentation test exercises 1440px desktop, 768px tablet, and 320px reflow; it verifies no horizontal overflow, checks the confirmation is above fixed mobile navigation after its scroll-margin clearance, compares primary/secondary dark-theme fills, and verifies destructive class/visible label under forced colors. This is deterministic review-fixture browser evidence, not production persistence, RPC/RLS, authentication, device authority, or hosted-CI evidence.

## Repair and review trail

The first dark/forced-colors test attempt failed in both browser projects because `getComputedStyle` ran immediately after navigation and queried a not-yet-rendered element. The test now waits for named role locators before reading computed styles; the repaired focused run passed 2/2 and the final combined run passed 4/4. Review also preserved visible ordered-list numbering after task-section styling rather than hiding the stop sequence.
