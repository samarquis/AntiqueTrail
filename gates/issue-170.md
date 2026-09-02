# Gates: issue #170 staged public existing-listing Free claim

Scope: Implement the server-authoritative, staged-off existing-listing claim path without public activation or changes to #137-owned navigation seams.

- [x] G1: Claim commands preserve the shared applicant root, stage-off denials, authority-signal independence, and atomic Free grant/tier/receipt behavior.
      CHECK: npx supabase@2.115.0 db reset --local && npx supabase@2.115.0 test db
      EXPECT: PASS
      EVIDENCE: 2026-09-02 isolated project `antique-trail-issue-170` on ports 55320-55324 completed a clean reset through migration `20260902010000`; focused pgTAP 0078 then passed 18/18. The full 78-file suite remains red only in legacy tests whose reset-time `postgres` role lacks their historical service-role memberships; 0078 passes inside that same full run.

- [x] G2: Focused client and owner/Administrator journey tests cover allowed and denied claim states without client-side authority.
      CHECK: npm test -- --run src/features/partners
      EXPECT: Test Files
      EVIDENCE: `npm test -- --run src/features/partners --reporter=dot` passed: 8 files, 38 tests. React Router v7 future-flag warnings only.

- [x] G3: The staged route fixture and responsive/accessibility states are exercised without activating Package 10B public claim mode.
      CHECK: npx playwright test --config e2e/issue-170-playwright.config.ts --workers=1
      EXPECT: passed
      EVIDENCE: `npx playwright test --config e2e/issue-170-playwright.config.ts --workers=1` passed 2/2 (Chromium and Pixel 5). It uses a ticket-only 4177 review server and verifies exact listing selection, consent, minimized authority signal, reason-neutral state, and absence of raw evidence or other claimant identity.

- [x] G4: Security contract and repository floor pass on the candidate.
      CHECK: npm run security:contract && npm run check && git diff --check
      EXPECT: PASS
      EVIDENCE: 2026-09-02 — review-harness fixture aligned to exact `storeId` plus idempotency key. `npm run security:contract && npm run check && git diff --check` passed: 88 test files / 602 tests, 69 release tests, production build, and PWA generation.

- [ ] G5: Every #170 criterion has exact-SHA evidence, including the stated external activation limitation, and a fresh independent review request is ready.
      EVIDENCE: local implementation evidence is ready; #169/Package 10B activation, independent review, hosted checks, merge, and post-merge verification remain required.
