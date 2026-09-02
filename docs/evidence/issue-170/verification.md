# Issue #170 verification record

## Scope and revision

- Base: `36b66c9530eaf28ac5cd3749523a1b012ab3704e` (`main` at claim time).
- Implementation candidate: `d11cc55e3aaa66a29e865fbdbeab0cbb9027792c`, pushed to `codex/issue-170-public-free-claim`. This verification ledger is a subsequent ticket-only commit; neither it nor the implementation commit is merge evidence without the remaining gates.
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

- `npm run typecheck`, `npm run lint`, and `npm run security:contract` completed without diagnostics/findings after the ticket changes.
- `npm test -- --run src/features/partners --reporter=dot` passed: 8 files and 38 tests. React Router v7 future-flag warnings were emitted but no test failed.
- The direct `npm run check` attempt returned after its initial `typecheck` line with no continuing command process or final result. It is incomplete, not a pass.
- Direct local pgTAP run of `supabase/tests/0078_issue_170_public_free_claim.sql` passed `18/18` before the final public-signal addition. Re-run it after a clean reset.

## Browser attempt

- `npx playwright test e2e/ui08-partner-portal.spec.ts --project=chromium --project=mobile --workers=1` wrote a failed run ledger with two failures. Chromium did not find the pre-existing `Store Portal unavailable` heading in the role-boundary case. Mobile reached the new exact-listing claim flow and exposed strict-mode ambiguity from `getByRole('status')` after the ticket introduced a second status message.
- The two ticket-owned claim-flow assertions now use exact `getByText('Claim status: …')` locators. A narrowed rerun did not produce a clean result before the ticket-owned Playwright runner and its 4173 review server were stopped after no clean run ledger appeared; this is unavailable/incomplete browser evidence, not a pass.

## Verification limitation

The Supabase CLI local project is global to concurrent worktrees (`supabase_db_antique-trail`). A concurrent reset supplied migration `20260901130000`, which does not exist in this branch, and this branch's `20260902010000` did not apply. Therefore `npx supabase@2.115.0 db reset --local && npx supabase@2.115.0 test db` has no clean candidate result in this worktree. This is unavailable evidence, not a passing gate.

## Required before merge/closure

1. Obtain an isolated #170 local Supabase project, then run the complete reset and database suite (G1 is abandoned only for this shared-container limitation).
2. Re-run the review Playwright configuration to a clean result and run `npm run check` to a complete final result, then run `git diff --check` on the committed candidate.
3. Record candidate, exact pushed head, hosted `web`, `database`, and `plan-governance` results, then request an independent exact-diff review. Do not activate Package 10B or merge from this ticket.
