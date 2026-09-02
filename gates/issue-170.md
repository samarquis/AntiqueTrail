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

- [x] G3: The staged route fixture and responsive/accessibility states are exercised without activating Package 10B public claim mode.
      CHECK: npx playwright test --config e2e/issue-170-playwright.config.ts --workers=1
      EXPECT: passed
      EVIDENCE: `npx playwright test --config e2e/issue-170-playwright.config.ts --workers=1` passed 2/2 (Chromium and Pixel 5). It uses a ticket-only 4177 review server and verifies exact listing selection, consent, minimized authority signal, reason-neutral state, and absence of raw evidence or other claimant identity.

- [ ] G4: Security contract and repository floor pass on the candidate.
      CHECK: npm run security:contract && npm run check && git diff --check
      EXPECT: PASS
      EVIDENCE: FAIL/SCOPE CONFLICT — `npm run typecheck` exits 2 in prohibited `src/review-harness/clients.ts` and `src/review-harness/clients.test.ts`, which still use obsolete `PartnerClaimDraft.storeReference`; the #170 contract now requires exact `storeId`. This also prevents `npm run check`. `npm run security:contract` passed; do not mark G4 checked until the owner updates that out-of-scope harness.

- [ ] G5: Every #170 criterion has exact-SHA evidence, including the stated external activation limitation, and a fresh independent review request is ready.
      EVIDENCE: incomplete — implementation commit `d11cc55e3aaa66a29e865fbdbeab0cbb9027792c` is pushed, but the final evidence-ledger head, independent review request, and hosted checks are still required.
