# Issue #140 verification

- Base: `1ff9a63566159325537a94248c15acc769aac966`.
- Rebased implementation plus senior-review repairs: `fa3ed10` and `30bcf26` on `codex/issue-140-moderation-single-cta`.
- Scope: neutral consequence-labeled choices, exact-case consequence preview, one explicit confirmation CTA, preserved reason on change/failure, and case-scoped resolved outcome. The repair adds server-enforced expected-version and idempotency semantics; no protected-plan file changed.

## Passed locally on 2026-09-02

- Focused review client/component tests: 2 files, 23 tests.
- `npm run verify:baseline`: 88 files/613 tests, 69 release tests, TypeScript, ESLint, Prettier, production/PWA build.
- Clean local Supabase reset applied migrations `20260903010000` and `20260903020000`; focused pgTAP 0079 passed 17/17, including runtime ownership, execute privilege, stale-version, idempotent replay, held-dismiss visibility preservation, and ineligible-restore denial.
- Required UI-09 Playwright matrix: 36 passed; three opt-in capture cases skipped.
- `npm run security:contract`: passed.
- Plan-governance contract: 7 passed.
- `git diff --check`: passed.

## Remaining closure work

Independent exact-head review, hosted web/database/plan-governance checks, merge, and post-merge verification remain required. Browser evidence is deterministic review-harness evidence; the clean-reset pgTAP result is the local database proof.
