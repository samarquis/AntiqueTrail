# Issue #170 verification record

## Scope and revision

- Base: `1ff9a63566159325537a94248c15acc769aac966`.
- Rebased implementation plus senior-review repairs are on `codex/issue-170-public-free-claim`. The final pushed head is the only merge-review target.
- Public activation: intentionally unavailable. `public_listing_claim_command` derives authority from the server-owned `claims` capability and does not enable it. Package 10B and #169 remain external activation/closure dependencies.

## Role and stage matrix

| Actor or stage                                              | Start/status/signal result                                            | Authority effect                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Anonymous, unverified, missing MFA, stale/revoked session   | Generic unavailable denial                                            | None                                                                   |
| Claim capability off                                        | No root or claim write; own status is empty                           | None                                                                   |
| Active Representative                                       | Generic unavailable denial                                            | No second intake                                                       |
| Eligible verified/MFA applicant with Package 10B capability | Locks one applicant root and creates/resumes one exact claim          | No grant before Administrator approval                                 |
| Administrator                                               | Verifies content-free, independent signals and approves with root CAS | One exact Representative scope, Free tier, event, receipt, or rollback |

## Local evidence

- `npm run verify:baseline && git diff --check` passed after aligning the end-to-end client, edge, and database contracts: 88 test files/603 tests, 69 release tests, and production/PWA build.
- `npm test -- --run src/features/partners --reporter=dot` passed: 8 files and 38 tests. React Router v7 future-flag warnings were emitted but no test failed.
- An isolated Supabase project completed `db reset --local` through migration `20260903040000`. Focused pgTAP 0078 passed 41/41 after that reset, including invitation-independent public consent, signal retry binding, runtime start/retry/signals/verification/approval, exact Free-tier authority, portable receipt export, account purge de-identification, and provider-user deletion.

## Browser evidence

- `npx playwright test --config e2e/issue-170-playwright.config.ts --workers=1` passed 9/9 across desktop Chromium, an 820px touch tablet, and 320 CSS-pixel mobile. It covers the ordinary-account consent and exact-listing flow; loading, empty, error, changes-requested, conflict, submitted, and verification-pending states; keyboard focus, semantic live-status roles, forced colors, narrow reflow, and no raw evidence or other claimant identity. These automated checks are not literal screen-reader or browser-zoom evidence.
- Inspected captures: `chromium-verification-pending.png`, `tablet-verification-pending.png`, and `mobile-320-verification-pending.png`. These are deterministic review-harness evidence, not live Supabase activation proof.

## Verification limitation

The isolated full 78-file pgTAP run is not globally green: legacy tests fail because a clean-reset `postgres` test user lacks their historical service-role memberships. The new 0078 file passes both alone and inside that run, so the ticket migration is proven on clean state; the unrelated reset-role baseline remains unavailable evidence rather than a pass.

## Required before merge/closure

1. Complete #169 and the Package 10B activation gate; this ticket explicitly forbids public activation and closure before them.
2. Run hosted `web`, `database`, and `plan-governance` on the exact pushed head and obtain independent exact-diff approval.
3. Merge only after those gates pass, then record merged-SHA verification and close the issue.
