# Gates: issue #137 Administrator navigation

Scope: Implement the exact `Review | Access | More` administrator route-parent registry and prove its route, authorization, accessibility, and evidence contract.

- [x] G1: One typed route-parent registry classifies every mounted authorized Administrator route and produces exactly one active parent.
  CHECK: npm test -- --run src/app/App.test.tsx src/features/admin src/features/partners src/features/reviews
  EXPECT: Test Files
  EVIDENCE: 2026-09-01: App shell 23/23 and registry 10/10 passed; full adjusted-timeout unit suite passed 89 files and 612 tests.

- [x] G2: Desktop and mobile navigation evidence proves exactly Review | Access | More, correct direct-link/back behavior, and no unauthorized disclosure.
  CHECK: npx playwright test --config playwright.review.config.ts e2e/ui09-admin-moderation.spec.ts e2e/ui10-full-spec.spec.ts
  EXPECT: passed
  EVIDENCE: 2026-09-02 exact required UI-09/UI-10 command passed 48 tests across desktop/tablet/mobile; six opt-in capture cases skipped. Existing #137 desktop/tablet/mobile captures remain under docs/evidence/issue-137.

- [x] G3: Ticket security and repository floor pass on the candidate.
  CHECK: npm run security:contract && npm run check && git diff --check
  EXPECT: PASS
  EVIDENCE: 2026-09-02 exact `npm run check` passed under declared Node 20.19.0 through the shared release-test runner: 89 files/612 tests, 69 release tests, and production/PWA build. Lint had zero errors and two Fast Refresh warnings; security and `git diff --check` passed.

- [ ] G4: Every #137 acceptance criterion has exact-SHA evidence and a fresh independent review approves the pushed PR head.
  EVIDENCE: implementation and local evidence are ready; independent review, hosted checks, merge, and post-merge verification are intentionally pending for the user-requested next session.
