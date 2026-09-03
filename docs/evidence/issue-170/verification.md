# Issue #170 verification record

## Scope and revision

- Base: `1ff9a63566159325537a94248c15acc769aac966`.
- Rebased implementation candidate: `2d96519`, pushed to `codex/issue-170-public-free-claim`. This verification ledger is a subsequent ticket-only commit; neither it nor the implementation commit is merge evidence without the remaining gates.
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

- `npm run security:contract && npm run check && git diff --check` passed after aligning the review-harness fixture with the exact `storeId` and idempotency contract: 88 test files/602 tests, 69 release tests, and production/PWA build.
- `npm test -- --run src/features/partners --reporter=dot` passed: 8 files and 38 tests. React Router v7 future-flag warnings were emitted but no test failed.
- An isolated Supabase project (`antique-trail-issue-170`, ports 55320-55324) completed `db reset --local` through migration `20260902010000`. Focused `supabase test db supabase/tests/0078_issue_170_public_free_claim.sql` passed 18/18 after that reset.

## Browser attempt

- `npx playwright test e2e/ui08-partner-portal.spec.ts --project=chromium --project=mobile --workers=1` wrote a failed run ledger with two failures. Chromium did not find the pre-existing `Store Portal unavailable` heading in the role-boundary case. Mobile reached the new exact-listing claim flow and exposed strict-mode ambiguity from `getByRole('status')` after the ticket introduced a second status message.
- The two ticket-owned claim-flow assertions now use exact `getByText('Claim status: …')` locators. `npx playwright test --config e2e/issue-170-playwright.config.ts --workers=1` then passed 2/2 (Chromium and Pixel 5) on an isolated ticket-only 4177 review server. The checked flow covers material consent before exact listing controls, one exact listing, submitted then verification-pending state, minimized authority signal, no raw evidence reference, and no other claimant identity. It is deterministic review-harness evidence, not live Supabase activation proof.

## Verification limitation

The isolated full 78-file pgTAP run is not globally green: legacy tests fail because a clean-reset `postgres` test user lacks their historical service-role memberships. The new 0078 file passes both alone and inside that run, so the ticket migration is proven on clean state; the unrelated reset-role baseline remains unavailable evidence rather than a pass.

## Required before merge/closure

1. Complete #169 and the Package 10B activation gate; this ticket explicitly forbids public activation and closure before them.
2. Run hosted `web`, `database`, and `plan-governance` on the exact pushed head and obtain independent exact-diff approval.
3. Merge only after those gates pass, then record merged-SHA verification and close the issue.
