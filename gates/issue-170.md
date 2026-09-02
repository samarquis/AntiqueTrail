# Gates: issue #170 staged public existing-listing Free claim

Scope: Implement the server-authoritative, staged-off existing-listing claim path without public activation or changes to #137-owned navigation seams.

- [ ] G1: Claim commands preserve the shared applicant root, stage-off denials, authority-signal independence, and atomic Free grant/tier/receipt behavior.
  CHECK: npx supabase@2.115.0 db reset --local && npx supabase@2.115.0 test db
  EXPECT: PASS
  EVIDENCE: unavailable — shared `supabase_db_antique-trail` received concurrent-worktree migration `20260901130000` absent from this branch, so candidate migration `20260902010000` was not applied by the reset. Focused direct pgTAP 0078 passed 18/18 before the final public-signal addition; rerun on an isolated clean reset.

- [ ] G2: Focused client and owner/Administrator journey tests cover allowed and denied claim states without client-side authority.
  CHECK: npm test -- --run src/features/partners
  EXPECT: Test Files
  EVIDENCE: partial — `npm run typecheck` passed; transport focused tests passed 5/5. The final aggregate partner test must be rerun before this gate can be checked; see docs/evidence/issue-170/verification.md.

- [ ] G3: The staged route fixture and responsive/accessibility states are exercised without activating Package 10B public claim mode.
  CHECK: npx playwright test --config playwright.review.config.ts
  EXPECT: passed
  EVIDENCE: pending — not run; requires the final candidate after G2 passes.

- [ ] G4: Security contract and repository floor pass on the candidate.
  CHECK: npm run security:contract && npm run check && git diff --check
  EXPECT: PASS
  EVIDENCE: pending — not run; candidate is not ready while G1-G3 remain unchecked.

- [ ] G5: Every #170 criterion has exact-SHA evidence, including the stated external activation limitation, and a fresh independent review request is ready.
  EVIDENCE: pending — no candidate SHA, independent review, or hosted checks yet.
