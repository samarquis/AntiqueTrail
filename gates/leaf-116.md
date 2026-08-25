# Gates: leaf-116 (#116 browser verification sweep Packages 6A/6B/7)

Scope: top-to-bottom browser verification of Packages 6A (invitation/claims), 6B (portal publishing/media/social/support), 7 (admin workspace, Access & Safety, duplicate merge) using the review harness. You OWN review port 4174 this phase.

Method: `npm run test:e2e:review` (config playwright.review.config.ts, port 4174, identities via ?reviewAs=<id>&reviewState=success; see src/review-harness/ and REVIEW_VERDICTS.md header for the pattern). Existing verdicts for #20/#21/#22 dated 2026-08-16 already exist in REVIEW_VERDICTS.md — your job is a FRESH dated sweep: re-run, verify still true, hunt gaps/deviations, file defect tickets for every failure found.

Rules: do NOT edit REVIEW_VERDICTS.md (driver integrates). Write findings to docs/testing/draft-verdicts-116.md with dated evidence lines. File one gh issue per Gap/Deviation (`gh issue create`, label bug/testing as appropriate) and record ticket numbers in the draft. Do not run git write commands.

- [ ] G1: full review e2e suite run recorded with pass/fail counts
  CHECK: npx playwright test --config playwright.review.config.ts
  EXPECT: /passed/
  EVIDENCE: pending — requires review harness on port 4174; fresh sweep after leaf-116 finishes

- [ ] G2: each of 6A, 6B, 7 has a fresh dated verdict section in docs/testing/draft-verdicts-116.md (pass/fail per sub-flow)
  EVIDENCE: pending — draft verdicts will be written after live sweep

- [ ] G3: zero unfiled findings — every Gap/Deviation has a created issue number listed
  EVIDENCE: pending — defect tickets filed after live sweep

- [ ] G4: any harness divergence found is described precisely (file:line) like the #111 precedent in REVIEW_VERDICTS.md
  EVIDENCE: pending — harness comparison after live sweep
