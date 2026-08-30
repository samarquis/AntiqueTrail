# Gates: issue #142 semantic color-token conformance

Scope: Bring `src/app/styles.css` and its focused regression/evidence seams into conformance with the approved Daylight Archive/Midnight Archive semantic-color contract, without modifying protected plan or design files.

- [ ] G1: Every CSS literal, gradient, alpha, and system-color exception is classified with purpose and an approved source or exception rationale.
  CHECK: Test-Path docs/evidence/issue-142/color-inventory.md; if ($?) { Get-Content -Raw docs/evidence/issue-142/color-inventory.md }
  EXPECT: Approved source
  EVIDENCE: pending

- [ ] G2: Shared shell, buttons, links, navigation, cards, forms, errors, statuses, and media overlays use aliases at the light/dark theme boundary; approved art and forced-color exceptions remain explicit.
  CHECK: npm test -- --run src/app/styles.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: pending

- [ ] G3: Static regression tests reject undocumented reusable semantic literals, incomplete theme pairs, and unapproved exceptions.
  CHECK: npm test -- --run src/app/styles.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: pending

- [ ] G4: Automated contrast, non-color status companions, focus, and forced-colors behavior pass for both themes.
  CHECK: npx playwright test --config playwright.review.config.ts e2e/theme.spec.ts e2e/issue-143-media-overlay.spec.ts e2e/issue-144-typography.spec.ts
  EXPECT: passed
  EVIDENCE: pending

- [ ] G5: Cross-role review-harness evidence records unchanged approved meanings across public, shopper, Portal, partner, Administrator, and error surfaces.
  CHECK: Test-Path docs/evidence/issue-142/rendered-role-evidence.md; if ($?) { Get-Content -Raw docs/evidence/issue-142/rendered-role-evidence.md }
  EXPECT: Administrator
  EVIDENCE: pending

- [ ] G6: The full repository floor and plan-governance contract pass, and the candidate alters no protected plan/design files.
  CHECK: npm run check; if ($LASTEXITCODE -eq 0) { npm run security:contract; if ($LASTEXITCODE -eq 0) { npm run test:release; if ($LASTEXITCODE -eq 0) { node --test scripts/plan-governance-contract.test.mjs; if ($LASTEXITCODE -eq 0) { git diff --check; git diff --name-only e1899659fbfdcd0647b4fdced50c901fa71f2cf4 } } } }
  EXPECT: pass
  EVIDENCE: pending

- [ ] G7: A separate agent approves the final base-to-head diff against standards and ticket specification, with results in `docs/evidence/issue-142/independent-review.md`.
  EVIDENCE: pending

- [ ] G8: The draft PR, final independent receipt, required hosted checks, post-merge verification, issue closure evidence, and checked default-branch TODO row all exist.
  EVIDENCE: pending
