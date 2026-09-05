## 2026-09-05 integration and closure contract

The current issue and merged PLAN_GOVERNANCE.md supersede the historical activation-dependent closure wording below: #170 closes on staged-off repository implementation, acceptance, independent review, and required hosted checks. #169 and #56 continue to own external evidence and public activation.

Integrated base: 8228cb123156c14409a68fdec00a47aec07dc5bc. The three unmerged #170 migrations were resequenced after current main because two versions collided with migrations merged by #168/#175. No already-landed migration was renamed.

Independent review found and prompted repairs for PostgreSQL bytea encoding at the real Edge boundary, invitation-independent withdrawal, and changes-requested resubmission. Fresh tests and exact-head review are required; the older test counts below are historical evidence only.
# Gates: issue #170 staged public existing-listing Free claim

Scope: Implement the server-authoritative, staged-off existing-listing claim path without public activation or changes to #137-owned navigation seams.

- [x] G1: Claim commands preserve the shared applicant root, stage-off denials, authority-signal independence, atomic Free grant/tier/receipt behavior, and deletion-safe audit lifecycle.
      CHECK: npx supabase@2.115.0 db reset --local; npx supabase@2.115.0 test db supabase/tests/0078_issue_170_public_free_claim.sql
      EXPECT: 46 tests successful
      EVIDENCE: 2026-09-03 clean reset applied through migration `20260903040000`; focused pgTAP 0078 passed 46/46, including ordinary public consent, signal retry binding, active runtime lifecycle, exact Representative/Free grant, portable receipt export, and applicant/Administrator de-identification plus provider deletion. The unrelated full 78-file suite remains unavailable as a green gate because legacy tests lack reset-time role memberships.

- [x] G2: Focused client and owner/Administrator journey tests cover allowed and denied claim states without client-side authority.
      CHECK: npm test -- --run src/features/partners
      EXPECT: Test Files
      EVIDENCE: `npm test -- --run src/features/partners --reporter=dot` passed: 8 files, 39 tests. React Router v7 future-flag warnings only.

- [x] G3: The staged route fixture and responsive/accessibility states are exercised without activating Package 10B public claim mode.
      CHECK: npx playwright test --config e2e/issue-170-playwright.config.ts --workers=1
      EXPECT: passed
      EVIDENCE: `npx playwright test --config e2e/issue-170-playwright.config.ts --workers=1` passed 9/9 across desktop Chromium, 820px touch tablet, and 320 CSS-pixel mobile. It verifies consent, exact listing, minimized signals, seven UI states, keyboard focus, semantic live-status roles, forced colors, narrow reflow, and no raw evidence or other claimant identity; three inspected captures are committed. It is not literal screen-reader or browser-zoom evidence.

- [x] G4: Security contract and repository floor pass on the candidate.
      CHECK: npm run security:contract && npm run check && git diff --check
      EXPECT: PASS
      EVIDENCE: 2026-09-03 — client, edge, database, review-harness, and account-lifecycle contracts align. `npm run verify:baseline` and `git diff --check` passed on the complete candidate: 88 test files / 603 tests, 69 release tests, production build, and PWA generation.

- [ ] G5: Every #170 criterion has exact-SHA evidence, including the stated external activation limitation, and a fresh independent review request is ready.
      EVIDENCE: local implementation evidence is ready; #169/Package 10B activation, independent review, hosted checks, merge, and post-merge verification remain required.

