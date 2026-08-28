# Gates: Issue #134 partner-draft UI authorization gate

Scope: fail closed in `PartnerDraftPage` until the authoritative partner status proves a bound identity, and prove the denial behavior with focused tests.

- [x] G1: The draft form is absent until `getStatus()` resolves to a bound identity; errors fail closed with the generic unavailable UI.
  CHECK: npm test -- --run src/features/partners/components.test.tsx
  EXPECT: /Test Files  1 passed/
  EVIDENCE: Focused Vitest passed 1 file / 12 tests, including deferred-status and denied/rejected-status cases.

- [x] G2: Focused tests prove no editable field is exposed during loading or after an authorization/status failure, and preserve the authorized save/submit path.
  CHECK: npm test -- --run src/features/partners/components.test.tsx
  EXPECT: /Tests  [0-9]+ passed/
  EVIDENCE: Focused Vitest passed 12 tests; desktop UI-08 passed 7 tests, including anonymous direct `/partner/draft` denial with no Store name control.

- [x] G3: Type checking and formatting pass for the changed source and tests.
  CHECK: npm run typecheck; if ($?) { npm run format }
  EXPECT: /All matched files use Prettier code style!/
  EVIDENCE: `npm run typecheck` exited 0; `npm run format` reported all matched files use Prettier code style.

- [x] G4: The final change is limited to #134 and retains existing partner/client authorization boundaries.
  CHECK: git diff --check
  EXPECT: /$^/
  EVIDENCE: `git diff --check` exited 0 before commit; product changes are PartnerDraftPage, focused unit tests, and UI-08 denied-route coverage. Server session-bound authorization is unchanged. Committed and pushed as `7d087bc`.
