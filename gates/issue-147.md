# Gates: issue 147 implementation

Scope: Raise meaningful public-catalog metadata to the #144 semantic type floor and prove every #147 local acceptance criterion without changing production behavior.

- [x] G1: Catalog area, category, freshness, hours, description, and title use #144 semantic roles and meet the issue floors.
  CHECK: npm run test:e2e:review -- e2e/issue-147-catalog-metadata.spec.ts --project=desktop
  EXPECT: /passed/
  EVIDENCE: Final focused Playwright run passed 43/43; all 12 cards measured title 23px, area/category/freshness/hours 16px, description/location 15px, and failed-cover placeholder 15px with semantic tokens.

- [x] G2: Twelve repeated cards and loading, empty, and error states reflow without clipping, overlap, or page overflow at 320, 393, 768, and 1280 CSS px in light and dark themes.
  CHECK: npm run test:e2e:review -- e2e/issue-147-catalog-metadata.spec.ts --project=desktop
  EXPECT: /passed/
  EVIDENCE: Final 43-case matrix passed every populated/state width/theme lane plus failed cover; text ranges, overflow ancestors, pairwise transitions, hit targets, and document width were measured.

- [x] G3: 200%-equivalent reflow and WCAG text-spacing overrides preserve metadata, actions, 48px controls, and document width.
  CHECK: npm run test:e2e:review -- e2e/issue-147-catalog-metadata.spec.ts --project=desktop
  EXPECT: /passed/
  EVIDENCE: Both 640px-at-200%-standards-equivalent lanes and all 8 text-spacing width/theme lanes passed; every mobile card control cleared fixed navigation by geometry and center-point hit-testing.

- [x] G4: Dated rendered screenshots and measured evidence are recorded for the required states, widths, themes, zoom, and text spacing.
  EVIDENCE: docs/evidence/issue-147 contains 16 dated JPEGs plus a 12-card measurement JSON (7,106,025 bytes); aggregate SHA-256 6971b1de24bb916b31c2478fb30aaa19e3dac5b6d081452e6fffeb5e6eb2b960.

- [x] G5: Required repository checks pass.
  CHECK: npm run typecheck
  EXPECT: tsc -b
  EVIDENCE: npm run typecheck exited 0; npm run build transformed 172 modules and completed in 8.12s.

- [x] G6: Lint passes.
  CHECK: npm run lint
  EXPECT: eslint .
  EVIDENCE: npm run lint exited 0 after removing the superseded demoCatalogClient import.

- [x] G7: Formatting passes.
  CHECK: npm run format
  EXPECT: All matched files use Prettier code style!
  EVIDENCE: npm run format reported "All matched files use Prettier code style!" after applying the required styles.css formatter output.

- [x] G8: Focused catalog unit and existing browser contracts pass.
  EVIDENCE: Focused Vitest passed 2 files/42 tests; existing e2e/catalog.spec.ts passed 14/14; production build excludes the review-only error fixture.

- [x] G9: Four unlazy passes complete and a final adversarial review finds no remaining in-scope defect.
  EVIDENCE: Four passes covered domain roles/order, production scope, raw-size/overflow defects, and final diff/evidence polish; no additional in-scope defect remained.

- [ ] G10: True 200% browser-UI zoom with layout reflow is verified in a real Windows browser for light and dark catalog cards.
  EVIDENCE: pending

- [ ] G11: The ticket branch integrates current origin/main without unresolved conflicts or loss of either #143 or #147 behavior.
  CHECK: git merge-base --is-ancestor origin/main HEAD && echo main-integrated
  EXPECT: main-integrated
  EVIDENCE: pending

- [ ] G12: The integrated candidate passes the complete repository check and the focused #147 browser matrix.
  CHECK: npm run check && npm run test:e2e:review -- e2e/issue-147-catalog-metadata.spec.ts --project=desktop
  EXPECT: /43 passed/
  EVIDENCE: pending

- [ ] G13: PR #157 is ready, mergeable, free of unresolved review feedback, and has successful hosted web and database checks.
  EVIDENCE: pending

- [ ] G14: PR #157 is merged to the repository default branch, post-merge verification is successful, and issue #147 is closed with an evidence comment.
  EVIDENCE: pending
