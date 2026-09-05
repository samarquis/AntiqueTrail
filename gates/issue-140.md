# Gates: issue #140 moderation single primary CTA + consequence preview

Scope: Rework the admin moderation decision UI in `src/features/reviews/` so each case offers four neutral, fully-described dispositions (none filled-primary before a decision is chosen), a selected action shows an accessible case-scoped consequence preview, `Confirm [selected action]` is the single filled/high-emphasis control, and change/cancel, failure recovery, exact-outcome announcement, case-scoped update, and no auto-advance are preserved. Owner color-accessibility addendum satisfied with semantic state tokens and 4.5:1 / 3:1 contrast. No protected plan/design file is modified.

- [x] G1: Filled-primary is applied to exactly one confirmation control per resolved case; before a decision + reason is present, all four disposition buttons are neutral and consequence-labeled.
      CHECK: npm test -- --run src/features/reviews/components.test.tsx
      EXPECT: Test Files 1 passed
      EVIDENCE: `docs/evidence/issue-140/verification.md` fenced unit/counts; static contract rejects undocumented reusable literals.

- [x] G2: Each disposition button exposes a full accessible name that pairs the action with its consequence (icon + text cues, color never the sole signal), and disabled-until-reason behavior is applied.
      CHECK: npm test -- --run src/features/reviews/components.test.tsx
      EXPECT: Test Files 1 passed
      EVIDENCE: unit assertions on accessible-name consequence text; name includes consequence per issue.

- [x] G3: Selecting an action shows case-scoped preview rows: case transition (current → resulting state), public aggregate effect, author-notice behavior, reason + audit retention, and reversibility, with `Confirm [selected action]` as the only filled control.
      CHECK: npm test -- --run src/features/reviews/reviewClient.test.ts
      EXPECT: Test Files 1 passed
      EVIDENCE: `docs/evidence/issue-140/verification.md` segment for the preview helper.

- [x] G4: Confirm Remove uses a documented danger treatment distinct from the other labeled dispositions; Hold/Restore/Dismiss Report use distinct, labeled, non-implied-risk treatments; both themes + forced-colors satisfy 4.5:1 / 3:1 contrast.
      CHECK: npm test -- --run src/app/styles.test.ts
      EXPECT: Test Files 1 passed
      EVIDENCE: `docs/evidence/issue-140/verification.md` (static contract, contrast arithmetic, forced-colors note). Browser deuteranopia/protanopia review is delegated to the browser lane.

- [x] G5: Change decision / cancel preserves the entered reason; failure keeps the case, panel, and reason, focuses an error summary, and never auto-advances; success updates only that case, announces the exact outcome, offers Back to Queue / Review Next.
      CHECK: npm test -- --run src/features/reviews
      EXPECT: Test Files 2 passed
      EVIDENCE: `docs/evidence/issue-140/verification.md`; e2e selectors updated in `e2e/ui09-admin-moderation.spec.ts` (browser lane runs them).

- [x] G6: The full repository floor and plan-governance contract pass, and the candidate alters no protected plan/design files.
      CHECK: npm run check; if ($LASTEXITCODE -eq 0) { npm run security:contract; if ($LASTEXITCODE -eq 0) { node --test scripts/plan-governance-contract.test.mjs; if ($LASTEXITCODE -eq 0) { git diff --check; git diff --name-only 36b66c9530eaf28ac5cd3749523a1b012ab3704e } } } }
      EXPECT: pass
      EVIDENCE: 2026-09-03 `npm run verify:baseline` passed 88 files/613 tests, 69 release tests, and build; security and seven plan-governance tests passed; `git diff --check` passed. UI-09 passed 36 with three opt-in captures skipped. Clean reset plus focused pgTAP 0079 passed 17/17. No protected-plan file changed.

- [ ] G7: A separate agent approves the final base-to-head diff against standards and ticket specification, with results in `docs/evidence/issue-140/independent-review.md`.
      EVIDENCE: intentionally pending for the user-requested independent review session.

- [ ] G8: Coordinator-owned post-merge/closure evidence exists.
      EVIDENCE: pending

- [ ] G9: Coordinator-owned final receipt.
      EVIDENCE: pending
