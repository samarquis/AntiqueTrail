# Issue 178 implementation evidence

## Contract

Package 13 in `PACKAGE_CONTRACTS.md`, including Existing-subscription upgrades, Scheduled downgrades and cancellation, and Jobs/tests/rollback, governs this implementation.
Plan amendments #218 and #219 are merged; the fixed review base is `666985d6ca137ff3d00be3ad9e7b5d121a5cc801`.
The Product Owner authorized work through closure. This implementation makes no further plan change.

## Acceptance mapping

- Exact-subscription upgrade consent, source/config/generation fences, immediate provider schedule attachment, future-phase preservation, cancellation fallback, and 48-hour full-charge refunds: `billingSchedule.test.ts`, `billingServicing.test.ts`, `servicing.test.tsx`, and `0087_issue_178_paid_servicing.sql`.
- Failure at 14 days, Free retention, 30-day hidden grace, restore, and both-object deletion receipts: controlled SQL clocks and existing media worker calls in `0087_issue_178_paid_servicing.sql`.
- Current tier enforcement, moderation publication beyond legacy 5/20 ordinals, recovery with an occupied ordinal, private hidden states, and unchanged uncapped catalog projection: focused SQL plus the full existing media/portal suite.
- Same-key concurrent requests and pause-before-dispatch locking: `scripts/test-paid-servicing-concurrency.mjs` uses separate actual database transactions and observes lock waits; each run creates and removes its own disposable database clone.
- Desktop/mobile cancellation dismissal, servicing-only upgrade denial, unchecked consent with future-intent disclosure, and off-state content: `e2e/issue-178-servicing.spec.ts`.

## Local evidence

Clean migration reset succeeded in isolated `supabase_db_issue178-servicing`.
Full pgTAP passed on source `98d61ec29e7eb1b91ee5e4f5bb341bf73a2a8818`: 90 files, 2686 assertions, including 59 focused servicing assertions and actual billing worker roles.
The concurrent same-key and pause/dispatch transactions passed.
Application verification passed: 105 Vitest files / 745 tests, 85 release checks, lint/format and production build; the subsequent repair passed all 14 focused provider tests, type checking, formatting, security-contract, and diff checks.
All six targeted Playwright cases passed in Chromium and mobile. The redundant local full-browser run was stopped without claiming a full-suite pass; required hosted web CI runs the complete browser suite.
Independent review and final hosted check results are recorded on PR #220 before landing.

## Evidence boundaries

Provider tests use mocked pinned-version Stripe responses; they are not real provider, activation, or production receipts.
The authenticated servicing component and client are staged for injection; only the local review composition installs a fixture client. Production billing remains off, and activation belongs to #180.
No shared database reset, hosted deployment, live Stripe mutation, or paid activation was performed.
Unknown provider or compensation outcomes remain durable unresolved obligations and cannot grant entitlement or assert financial completion.
