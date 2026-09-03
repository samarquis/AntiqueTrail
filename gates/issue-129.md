# Gates: issue #129 saved-store to trip-planning continuation

Scope: Complete the saved-store → trip-planning continuation so each saved-store card has one filled `Add to Trip` primary action, removal is demoted to a secondary destructive action, and the existing exact-store deep link (`/trips/new?addStoreId=`) always opens an explicit chooser between eligible existing draft/ready trips and a new trip, ending in a named success with `View Trip` and `Undo`. No trip or save authorization changes; no store-object serialization into URL/local storage/new cache.

- [x] G1: Every saved-store card offers exactly one filled `Add to Trip` primary action and keeps store removal as a visually distinct destructive (downgraded) action.
      CHECK: npm test -- --run src/features/shopper/components.test.tsx
      EXPECT: Test Files 1 passed
      EVIDENCE: 2026-09-02 focused shopper/trip/App suite passed 3 files, 69 tests; senior-review repair `bc27c49`.

- [x] G2: `?addStoreId=` always opens the explicit chooser (eligible existing trips + `Start a New Trip`), retains the exact store through selection, sign-in return, and cancel/back via the existing `returnTo` auth boundary, and never serializes the store object.
      CHECK: npm test -- --run src/features/trips/components.test.tsx
      EXPECT: Test Files 1 passed
      EVIDENCE: Unit coverage includes existing/new selection and same-origin return fallback; required UI-05/UI-07 matrix passed 93 with six opt-in captures skipped.

- [x] G3: Addition ends in named success offering `View Trip` and `Undo`; already-added, full, empty, unavailable-client, duplicate-click, and persistence-failure states are handled truthfully; undo returns to an accurate chooser.
      CHECK: npm test -- --run src/features/trips/components.test.tsx
      EXPECT: Test Files 1 passed
      EVIDENCE: Focused tests exercise named success, View Trip, Undo, eligibility filtering, empty/error/retry, duplicate-click, persisted-stop validation, and create-then-add retry without duplicate trip creation.

- [x] G4: The full repository floor, security contract, and plan-governance contract pass; no protected plan/design files are altered. DB/pgTAP and Playwright e2e are delegated evidence.
      CHECK: npm run check; if ($LASTEXITCODE -eq 0) { npm run security:contract; if ($LASTEXITCODE -eq 0) { node --test scripts/plan-governance-contract.test.mjs; if ($LASTEXITCODE -eq 0) { git diff --check; git diff --name-only 36b66c9530eaf28ac5cd3749523a1b012ab3704e } } }
      EXPECT: pass
      EVIDENCE: `npm run verify:baseline` passed 88 files/608 tests, 69 release tests, and build; security and seven plan-governance tests passed; `git diff --check` passed. No database or protected-plan file changed.

- [x] G5: Issue verification evidence and the leaf-129 gate ledger exist with the delegated DB and e2e runs recorded.
      CHECK: Test-Path docs/evidence/issue-129/verification.md; if ($?) { Get-Content -Raw docs/evidence/issue-129/verification.md }
      EXPECT: Passed
      EVIDENCE: `docs/evidence/issue-129/verification.md` records base, implementation SHA, commands, results, and limitations.

- [ ] G6: A separate session approves the exact pushed PR head; hosted web/database/plan-governance checks pass; merge and post-merge verification close the issue.
      EVIDENCE: intentionally pending for the user-requested independent review session.
