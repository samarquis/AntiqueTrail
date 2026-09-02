# Issue #170 verification record

## Scope and revision

- Base: `36b66c9530eaf28ac5cd3749523a1b012ab3704e` (`main` at claim time).
- Candidate: recorded after the ticket-only commit; do not treat this working-tree note as merge evidence.
- Public activation: intentionally unavailable. `public_listing_claim_command` derives authority from the server-owned `claims` capability and does not enable it. Package 10B and #169 remain external activation/closure dependencies.

## Role and stage matrix

| Actor or stage | Start/status/signal result | Authority effect |
| --- | --- | --- |
| Anonymous, unverified, missing MFA, stale/revoked session | Generic unavailable denial | None |
| Claim capability off | No root or claim write; own status is empty | None |
| Active Representative | Generic unavailable denial | No second intake |
| Eligible verified/MFA applicant with Package 10B capability | Locks one applicant root and creates/resumes one exact claim | No grant before Administrator approval |
| Administrator | Verifies content-free, independent signals and approves with root CAS | One exact Representative scope, Free tier, event, receipt, or rollback |

## Local evidence

- `npm run typecheck` completed without TypeScript diagnostics after the ticket changes.
- Focused transport tests passed (5 tests) before the UI assertion correction; the corrected claim-page assertion was rerun as part of the final focused command but the desktop runner detached before it emitted a final aggregate line. Re-run before review.
- Direct local pgTAP run of `supabase/tests/0078_issue_170_public_free_claim.sql` passed `18/18` before the final public-signal addition. Re-run it after a clean reset.

## Verification limitation

The Supabase CLI local project is global to concurrent worktrees (`supabase_db_antique-trail`). A concurrent reset supplied migration `20260901130000`, which does not exist in this branch, and this branch's `20260902010000` did not apply. Therefore `npx supabase@2.115.0 db reset --local && npx supabase@2.115.0 test db` has no clean candidate result in this worktree. This is unavailable evidence, not a passing gate.

## Required before merge/closure

1. Run the complete reset and database suite against an isolated #170 local project.
2. Run `npm test -- --run src/features/partners`, the review Playwright configuration, `npm run security:contract`, `npm run check`, and `git diff --check` on the committed candidate.
3. Record candidate, exact pushed head, hosted `web`, `database`, and `plan-governance` results, then request an independent exact-diff review. Do not activate Package 10B or merge from this ticket.
