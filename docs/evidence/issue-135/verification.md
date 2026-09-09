# Issue 135 verification

Date: 2026-09-05. Fixed base: `3ddff7b87497d292d507ad8394f297768af25068`.

The earlier investigation is historical; #123 and #131 have merged and released the shared route seam.
The shared Portal route guard checks the existing server-backed getHome command before mounting any Portal page, and rechecks when the client, Auth session, or route changes. A denied check unmounts private content and forms. Server authorization remains required on each RPC.

## Acceptance mapping

1. Direct-route browser matrix: 42/42 Chromium and mobile cases pass for anonymous, two shoppers, wrong-role Administrator, Representative denial, partner status/draft and claim sign-in. The normal public claim routes remain staged off. The SQL matrix tests real sessions, revoked grants, stale signed AMR, expiry, sibling/guessed/bulk IDs, direct-table denial and stage mismatch.
2. The SQL matrix passes 26/26, including a real MFA Administrator with an active role reading only its assigned claim, wrong-role rejection, sibling/guessed denial and revocation on the same session. No authorization function is stubbed. App tests pass 26/26 including removal of previously displayed private scope on a denied next-route check.
3. Portal/partner client error tests pass 10/10; existing public-claim and partner-admin Edge tests pass. Six new tests execute the actual media lifecycle Edge handler: application bearer never authorizes it; database job/stage denial makes zero Storage calls and returns a generic failure. Existing media authorization contracts on main cover current-tier and revoked/expired reads; private media has no browser signed-URL issuance endpoint in the covered implementation. No real provider or Storage service calls were made.
4. Actual freshly built normal dist passes assertProductionArtifact. The owner-research isolation verifier is run with the previously disclosed synthetic-only research build inputs from issue 168; this is artifact isolation, not deployment evidence.
5. Deliberate SQL mutation replaced portal_list_updates with a cross-store unfiltered result inside a rollback-only test transaction. It produced failures for exact-store count, revoked list access, and expired access; the unmodified matrix passes. The original browser matrix failed before the route guard and passes after it. Hosted CI supplies a clean-reset database contract run for the candidate.

## Local checks

- npm run check: 99 test files, 710 tests; 82 release tests; typecheck, lint, format and production build pass. Subsequent added worker tests: 6/6; updated App tests: 26/26.
- npm run security:contract: pass.
- Adjacent Chromium UI08/UI10: 11 passed, 3 existing opt-in evidence captures skipped.
- git diff --check: pass.
- Local SQL used the isolated issue170 database at its latest migration, not a reset of the shared database; required hosted clean-reset proof remains distinct.

Independent exact-SHA review and hosted candidate checks must pass before closure. No live activation, publication, paid service or human gate is claimed.
