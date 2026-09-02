# Gates: issue #137 Administrator navigation

Scope: Implement the exact `Review | Access | More` administrator route-parent registry and prove its route, authorization, accessibility, and evidence contract.

- [x] G1: One typed route-parent registry classifies every mounted authorized Administrator route and produces exactly one active parent.
  CHECK: npm test -- --run src/app/App.test.tsx src/features/admin src/features/partners src/features/reviews
  EXPECT: Test Files
  EVIDENCE: 2026-09-01: App shell 23/23 and registry 10/10 passed; full adjusted-timeout unit suite passed 89 files and 612 tests.

- [ ] G2: Desktop and mobile navigation evidence proves exactly Review | Access | More, correct direct-link/back behavior, and no unauthorized disclosure.
  CHECK: npx playwright test --config playwright.review.config.ts e2e/ui09-admin-moderation.spec.ts e2e/ui10-full-spec.spec.ts
  EXPECT: passed
  EVIDENCE: UI-09 passed 39 checks (3 opt-in capture skips); the #137 capture rerun passed 3/3 and wrote desktop/tablet/mobile evidence under docs/evidence/issue-137. UI-10's isolated mobile journey passed 1/1, but its full matrix cannot be claimed green.
ABANDON: G2 2026-09-01: `npx playwright test --config playwright.review.config.ts e2e/ui09-admin-moderation.spec.ts e2e/ui10-full-spec.spec.ts` is not green because UI-10 failed before #137 behavior at ui10-full-spec.ts:25: cold `/stores` never rendered Browse stores on desktop/tablet/mobile; a first run also had one mobile heading-focus failure. UI-09 directly covers the #137 navigation contract and passed.

- [ ] G3: Ticket security and repository floor pass on the candidate.
  CHECK: npm run security:contract && npm run check && git diff --check
  EXPECT: PASS
  EVIDENCE: security:contract passed; typecheck, lint (0 errors; 2 existing Fast Refresh warnings), format, release tests 69/69, build, and git diff --check passed. Full unit suite passed 89 files/612 tests with --testTimeout=30000.
ABANDON: G3 2026-09-01: `npm run check` remains red because its default 5-second Vitest timeout expires in four untouched partner/trip tests under observed Node 24.11.1; `.nvmrc` requires Node 20.19.0, which is not installed. The same three files pass 39/39 with `--testTimeout=30000`, but the exact required command cannot be claimed passed.

- [ ] G4: Every #137 acceptance criterion has exact-SHA evidence and a fresh independent review request is ready.
  EVIDENCE: Candidate is intentionally not offered for independent review while G2 and G3 are abandoned; no PR or exact-SHA review request is claimed.
ABANDON: G4 2026-09-01: blocked by G2's non-green UI-10 matrix and G3's exact `npm run check` failure. Commit/push remains a handoff candidate only, not a review-ready closure artifact.
