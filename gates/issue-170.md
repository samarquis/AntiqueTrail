# Gates: issue #170 staged public existing-listing Free claim

Scope: Implement the server-authoritative, staged-off existing-listing claim path without public activation or changes to #137-owned navigation seams.

- [x] G1 (ABANDONED): Claim commands preserve the shared applicant root, stage-off denials, authority-signal independence, and atomic Free grant/tier/receipt behavior.
      CHECK: npx supabase@2.115.0 db reset --local && npx supabase@2.115.0 test db
      EXPECT: PASS
      EVIDENCE: ABANDONED as unavailable — the shared local `supabase_db_antique-trail` container received concurrent-worktree migration `20260901130000`, absent from this branch; the candidate's `20260902010000` was consequently not applied. No isolated local project is configured in ticket scope. A direct pgTAP 0078 run passed 18/18 before the final public-signal addition, but is not accepted as clean-reset proof.

- [x] G2: Focused client and owner/Administrator journey tests cover allowed and denied claim states without client-side authority.
      CHECK: npm test -- --run src/features/partners
      EXPECT: Test Files
      EVIDENCE: `npm test -- --run src/features/partners --reporter=dot` passed: 8 files, 38 tests. React Router v7 future-flag warnings only.

- [ ] G3: The staged route fixture and responsive/accessibility states are exercised without activating Package 10B public claim mode.
      CHECK: npx playwright test --config playwright.review.config.ts
      EXPECT: passed
      EVIDENCE: incomplete — `npx playwright test e2e/ui08-partner-portal.spec.ts --project=chromium --project=mobile --workers=1` produced two failures: Chromium's existing role-boundary Store Portal assertion did not find its heading, and the claim-flow mobile test exposed ambiguous `getByRole('status')` locators. The ticket-owned claim locators were corrected, but the narrowed rerun did not produce a clean result before its review-server runner stalled and was stopped; see verification record.

- [ ] G4: Security contract and repository floor pass on the candidate.
      CHECK: npm run security:contract && npm run check && git diff --check
      EXPECT: PASS
      EVIDENCE: incomplete — `npm run security:contract`, `npm run typecheck`, and `npm run lint` completed without findings. `npm run check` returned after the initial typecheck without a complete command result, so this gate is not checked. `git diff --check` is rerun with the evidence commit.

- [ ] G5: Every #170 criterion has exact-SHA evidence, including the stated external activation limitation, and a fresh independent review request is ready.
      EVIDENCE: incomplete — implementation commit `d11cc55e3aaa66a29e865fbdbeab0cbb9027792c` is pushed, but the final evidence-ledger head, independent review request, and hosted checks are still required.
