# Gates: leaf-116 (#116 browser verification sweep Packages 6A/6B/7)

Scope: top-to-bottom browser verification of Packages 6A (invitation/claims), 6B (portal publishing/media/social/support), 7 (admin workspace, Access & Safety, duplicate merge) using the review harness. You OWN review port 4174 this phase.

Method: `npm run test:e2e:review` (config playwright.review.config.ts, port 4174, identities via ?reviewAs=<id>&reviewState=success; see src/review-harness/ and REVIEW_VERDICTS.md header for the pattern). Existing verdicts for #20/#21/#22 dated 2026-08-16 already exist in REVIEW_VERDICTS.md — your job is a FRESH dated sweep: re-run, verify still true, hunt gaps/deviations, file defect tickets for every failure found.

Rules: do NOT edit REVIEW_VERDICTS.md (driver integrates). Write findings to docs/testing/draft-verdicts-116.md with dated evidence lines. File one gh issue per Gap/Deviation (`gh issue create`, label bug/testing as appropriate) and record ticket numbers in the draft. Do not run git write commands.

- [x] G1: full review e2e suite run recorded with pass/fail counts
  CHECK: npx playwright test --config playwright.review.config.ts
  EXPECT: /passed/
  EVIDENCE: 2026-08-27 driver run: 51 passed, 6 skipped, 0 failed with one worker across UI-08/UI-09 desktop/tablet/mobile.

- [x] G2: each of 6A, 6B, 7 has a fresh dated verdict section in docs/testing/issue-116-verification.md (pass/fail per sub-flow)
  EVIDENCE: Fresh dated reconciliation and eight lane reports are in docs/testing/issue-116-verification.md and docs/testing/issue-116-agent-01.md through issue-116-agent-08.md.

- [x] G3: zero unfiled findings — every Gap/Deviation has a created issue number listed
  EVIDENCE: Tickets #130, #131, #132, #133, #134, and #135 are listed in the reconciliation; no lane finding is unfiled.

- [x] G4: any harness divergence found is described precisely (file:line) like the #111 precedent in REVIEW_VERDICTS.md
  EVIDENCE: Lane reports identify the permissive Access & Safety review client versus production RPC at components.tsx:283-301 and migration 20260822100000:309-320, and the stale tokenless-join claim versus e2e/ui08-partner-portal.spec.ts:7,49-68.
