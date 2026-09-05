# Issue 135 authorization investigation

Date: 2026-09-05 UTC. Base: `ca863eae06e3749e839940f0df847b7ccb89a314`.
Initial reviewed candidate: `20a22e6c55783610d893a409e60c5e8e1b701e19`.
Status: incomplete; not closure evidence.

## Confirmed route discrepancy

`DESIGN_SYSTEM.md`, **Production navigation and routes**, requires wrong-role or revoked access to return a generic access-denied screen without revealing hidden resource existence.
In the deterministic review browser, anonymous direct navigation to `/store-portal/changes` renders the Controlled changes form without an access-denied response.
The Representative `permission-denied` fixture does the same.
The `/store-portal/updates` anonymous fixture displays the generic error but retains four editable inputs.
These observations establish inconsistent route denial, not successful unauthorized database mutation or private-data disclosure.

Reproduce with `npx playwright test e2e/issue-135-route-isolation.spec.ts --project=chromium --workers=1 --retries=0`.
The browser matrix intentionally remains red; do not skip it to obtain approval.
It exercises synthetic UI states, not live revocation, token expiry, or cached private-content removal.

## Ownership dependency

The smallest common route repair integrates an authorization guard in `src/app/App.tsx`.
At investigation time, issue 131's active checkout has uncommitted changes to that file, and open PR 190 for issue 123 also modifies it and `src/features/portal/components.tsx`.
The current **Ticket Workflow / Pick work** requires disjoint active files and serialization of shared source seams.
No changes were made to either shared implementation file.
Resume after the owners land/release the needed seam, fetch current main, and reassess whether their changes already resolve the discrepancy.

## Verification and review

- `npx vitest run src/features/portal/issue135Isolation.test.ts`: 10 passed; proves generic client error normalization only.
- Focused Prettier check: passed. Focused ESLint completed before typecheck started.
- Browser run reproduced the discrepancies above; stopped after failures because the common repair cannot yet be integrated.
- New pgTAP file uses real RPCs, sessions, grants, and transactional synthetic fixtures. It is unverified until clean-reset database execution passes.
- Local Docker API was unavailable; `docker desktop start --timeout 45` timed out. No shared database was reset.
- Hosted checks are authoritative for their candidate; pending or failed checks are not passing evidence.
- Independent reviewer `/root/review_135`, read-only exact-candidate review: **Standards unverified; Spec FAIL/incomplete; REWORK**.
- Reviewer identified missing runtime Administrator and partner cross-case coverage, covered Storage/signed-URL/job agreement, actual normal-artifact exclusion, live lifecycle proof, clean-reset results, and deliberate-break detection. Existing source-string contracts cannot substitute for behavioral evidence.
- The subsequent SQL stale-auth fixture correction changes signed AMR timestamps instead of the nonauthoritative session timestamp; it requires fresh execution and review.

The issue remains open and its pull request remains draft. Neither production acceptance nor provider activation is claimed.
