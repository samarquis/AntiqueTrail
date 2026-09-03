# Issue #170 criterion-level acceptance evidence

Candidate code repair is on `codex/issue-170-public-free-claim`. Final approval must bind the complete pushed head containing this ledger.

| Criterion | Implementation and test evidence | Result / limitation |
| --- | --- | --- |
| Staged exact-store entry | `src/app/App.tsx`; `e2e/issue-170-public-claim.spec.ts`; pgTAP 0078 stage-off assertion | Local pass; activation remains off. |
| Generic denial with no authority | `public_listing_claim_command`; focused client tests; pgTAP stage-off rollback assertion | Local pass for the server stage boundary; production session/provider proof is blocked by Package 10B. |
| Shared applicant root | `store_owner_intake_roots`; root lock/CAS assertions in pgTAP 0078 | Local pass. |
| Two independent minimized signals | `public_listing_claim_signal_command`; mismatched-retry and two-channel runtime assertions in pgTAP 0078 | Local pass; raw evidence is absent from UI and storage contract. |
| Minimized applicant/admin reads | `public_listing_claim_status`; `partner_admin_claim_case`; focused client and pgTAP privilege assertions | Local pass. |
| Atomic exact Free approval | `approve_exact_claim`; active runtime lifecycle in pgTAP 0078 | Local pass for one transaction, exact store grant, Free tier, receipt, event, and root clear. |
| Race/retry safety | advisory locks, expected versions, durable command receipts, exact input digests; pgTAP start and signal replay checks | Local deterministic pass; hosted database remains required on the final head. |
| Terminal lifecycle | exact-root cleanup trigger plus existing claim rejection/revocation/transfer commands | Repository implementation present; public activation and human reverification evidence remain blocked. |
| Account export/deletion | portable export projection; deletion-worker de-identification; retained append-only consent/activation receipts; pgTAP 0078 runtime purge and provider-user deletion | Local pass. Receipt audit facts survive without account identifiers and no longer block provider deletion. |
| Responsive and accessible UI states | Playwright 9/9; three inspected PNG captures in this directory | Local review-harness pass for desktop, tablet, 320 CSS-pixel reflow, keyboard focus, semantic live-status roles, forced colors, loading, empty, error, changes, conflict, and success. This is not literal assistive-technology or browser-zoom evidence. |

## Commands and limitations

- Clean `npx supabase@2.115.0 db reset --local`: passed.
- Focused pgTAP `0078_issue_170_public_free_claim.sql`: 41/41 passed after a clean reset through migration `20260903040000`.
- Ticket Playwright config: 9/9 passed.
- `npm run verify:baseline`: passed on the complete candidate: 88 test files/603 tests, 69 release tests, TypeScript, ESLint, Prettier, and production/PWA build.
- This evidence does not activate public claims and does not satisfy #169, Package 10B human/provider activation, hosted checks, independent review, merge, or post-merge closure proof.
