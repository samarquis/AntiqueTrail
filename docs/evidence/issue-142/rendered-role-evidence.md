# Issue #142 rendered role evidence

Base: `e1899659fbfdcd0647b4fdced50c901fa71f2cf4`
Candidate source SHA: `44d49c04589ca7d65b30a9aec260d862cb52ba4f`.

`e2e/theme.spec.ts` covers the public listing, shopper Saved, shopper Trip, Portal, Partner, Administrator, and an explicit error surface in both approved themes. It verifies approved semantic root values; separately exercises a stale listing with the visible honesty copy and a real alert-style error summary; and captures desktop screenshots when `CAPTURE_ISSUE_142_EVIDENCE=1`.

Captured 2026-08-30 by `CAPTURE_ISSUE_142_EVIDENCE=1 npx playwright test --config playwright.review.config.ts e2e/theme.spec.ts`: 78 passed. The manifest is `light-*` and `dark-*` PNGs for `public-listing`, `shopper-saved`, `shopper-trip`, `portal`, `partner`, `administrator`, and `error-state` (14 files total). The full result set is recorded in `verification.md`.
