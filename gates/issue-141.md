# Gates: Issue #141 shared form-control contrast

Scope: establish semantic native form-control color tokens in both themes, preserve native behavior, and prove the contrast and representative keyboard/forced-colors outcomes needed to close GitHub issue #141.

- [x] G1: Shared text inputs, selects, textareas, placeholders, disabled, hover, invalid, and focus states reference semantic control tokens with light and dark values that meet the stated text and non-text contrast thresholds.
  CHECK: npm test -- --run src/app/styles.test.ts
  EXPECT: /Test Files  1 passed/
  EVIDENCE: Start at  22:07:20 | Duration  1.86s (transform 62ms, setup 276ms, import 33ms, tests 7ms, environment 1.19s)

- [x] G2: Browse filters expose the shared native-control treatment in light and dark themes, retain a keyboard-visible focus indicator, and retain system colors in forced-colors mode.
  CHECK: npx playwright test e2e/theme.spec.ts --grep "shared form controls"
  EXPECT: /passed/
  EVIDENCE: (node:6832) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set. | (Use `node --trace-warnings ...` to show where the warning was created)

- [x] G3: The shared CSS remains the only common-control styling seam and invalid form controls still have semantic invalid/error relationships in a representative form.
  CHECK: npm test -- --run src/features/auth/components.test.tsx
  EXPECT: /Test Files  1 passed/
  EVIDENCE: Start at  22:07:45 | Duration  8.85s (transform 341ms, setup 496ms, import 833ms, tests 4.54s, environment 2.35s)

- [ ] G4: Typecheck, lint, formatting, build, and dated accessibility/color evidence pass before closure.
  EVIDENCE: pending
