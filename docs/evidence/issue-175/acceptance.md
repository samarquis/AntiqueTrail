# Issue #175 acceptance evidence

Date: 2026-09-03

Base SHA: `56584b6229445424240c07adab1b817867e59868`

Candidate SHA: assigned at the reviewable candidate commit and reported in the handoff. This file cannot truthfully contain its own final commit SHA; the independent-review and PR receipts must pin the resulting head.

## Scope and limitations

This candidate implements inactive configuration and private value-research mechanics only. It does not choose or approve real prices, activate sales, create payment-provider objects, change protected plan sources, or claim human, hosted, provider, merge, or production evidence. The exact values in the review harness and tests are synthetic fixtures, not Product Owner decisions.

The serialized database lane was granted after Issue #168 released it. The post-review clean reset and focused Issue #175 pgTAP file pass with 47 assertions. The earlier full suite run failed because 17 historical files hit clean-reset service-role/function privilege errors; it was not repeated after review changes under the coordinator's bounded database-lane instruction, so no post-review full-suite pass is claimed.

## Acceptance matrix

| Criterion | Implementation path | Verification and current result | Artifact or limitation |
| --- | --- | --- | --- |
| Complete, unambiguous draft validation before inactive approval | `supabase/migrations/20260903040000_issue_175_inactive_commercial_config.sql`: exact JSON shape/type checks and bounded integer/string validation cover prices, USD, complete lifecycle terms, policy versions, and Full Gallery constraints | Clean reset passes; focused 0081 passes 47/47, including malformed fractional JSON rejection | `supabase/tests/0081_issue_175_inactive_commercial_config.sql` |
| Trusted signed authorization, canonical bytes/digest, and post-approval immutability | A short-lived challenge binds the exact canonical config/protocol and three eligible community-review receipts. A separately owned signature-service receipt must match its payload, signer, and time; approval rejects future/stale/replayed receipts and freezes the approved packet | Trusted-role boundary, review prerequisites, digest binding, time validation, replay denial, approval identity/time, and mutation rejection assertions pass | Same migration/test |
| Exact approved-inactive private read only | FORCE-RLS private tables, revoked browser grants, session-aware RPC, exact authorization/participant/version/digest predicates; authenticated feature-gated route | Vitest route/client tests pass; Playwright public absence and exact private route pass; RLS/grant/session/stale-binding pgTAP passes | 4 files/39 Vitest tests; 9/9 Playwright tests; 47/47 focused pgTAP assertions |
| Zero provider calls, objects, jobs, webhooks, public copy, structured data, sitemap content, or cached price response | Commercial research calls only database RPCs. `billingProviderRequest(..., 'commercial_research')` rejects before `fetch`. Production composition requires exact artifact/question environment values; review fixtures are development-only | Provider spy passes; browser request spies observe zero provider calls; build and exact fixture scan pass | `src/features/billing/billingProviderBoundary.test.ts`, `e2e/issue-175-commercial-research.spec.ts`; provider/production receipts are not claimed because no provider operation is permitted |
| Complete lifecycle and Full Gallery disclosure | Research component renders exact cancellation, 48-hour refund, immediate upgrade proration, renewal-time downgrade, 14-day failed-payment grace, 30-day hidden-photo deletion consequences, media limits, outage, moderation/abuse, appeal, and remedy terms | Component and all three browser projects assert the lifecycle copy; security vocabulary contract passes | Focused Vitest, Playwright, `npm run security:contract` |
| Bound, minimized research outcome including refusal/abandonment | Strict client types/parser and append-only RPC bind eligibility/consent, exact config/digest, artifact, question version, controlled choice/reason, and idempotency; submission locks and rechecks live authorization/config before insert; no free-text field exists | Client response-loss retry reuses one logical idempotency key; database expiry/revocation race, replay, stale binding, append-only, and minimized-row assertions pass | Focused Vitest/Playwright and 0081 pass |
| Superseding preserves frozen packet; activation requires exact ratified digest | Named database lifecycle transitions, immutable approved payload, and exact version/digest activation-candidate function | Focused lifecycle/immutability/exact-digest assertions pass | 0081 passes; sales activation remains out of scope |
| Production/network guards fail on leakage or provider reachability | Provider boundary has a pre-fetch research rejection; route is absent without explicit research metadata; production bundle scanned for exact synthetic fixture values | Build passed; exact fixture scan found no matches; all browser provider-request assertions passed | The initial exploratory bare-number scan was invalid/noisy and is deliberately excluded from acceptance evidence |

## Verification ledger

| Command | Result |
| --- | --- |
| `npx vitest run src/features/billing src/app/App.test.tsx --reporter=dot` | PASS — 4 files, 39 tests, 22.31s |
| `npx playwright test e2e/issue-175-commercial-research.spec.ts --config playwright.review.config.ts --reporter=line` | PASS — 9 tests, 34.0s |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — 179 modules, 8.25s |
| exact fixed-string scan of `dist` for synthetic tax, limits, policy/question versions, and 64-byte digests | PASS — no matches |
| `npm run security:contract` | PASS — secrets, licenses, action pins, migrations, tier vocabulary |
| `git diff --check` | PASS; one existing line-ending normalization warning is informational |
| `npx supabase@2.115.0 db reset --local` | PASS — final clean reset applied the new forward-only migration and seed successfully |
| `npx supabase@2.115.0 test db supabase/tests/0081_issue_175_inactive_commercial_config.sql` | PASS — 1 file, 47 tests |
| `npx supabase@2.115.0 test db` | NOT REPEATED POST-REVIEW — the earlier run reached 79 files/2037 tests and failed in 17 historical privilege fixtures; the coordinator authorized only reset plus focused 0081 for the review revision. |
| `npm run check` | PASS post-review — typecheck, lint, format, 90 Vitest files/640 tests, 69 release tests, and production build (179 modules) |
| independent review and hosted checks | First candidate `6febf317` received CHANGES REQUIRED. Replacement-candidate exact-diff review and hosted checks remain pending. |

## Canonicalization and permission design

The canonical payload is assembled server-side in a fixed key order and encoded as UTF-8 JSON; the stored digest is `sha256(canonical_bytes)`. The pgTAP fixture independently computes the expected canonical bytes/digest and must pass before the database gates can be checked.

All commercial configuration, challenge, signature-receipt, authorization, participant, and attempt tables live in `private`, use forced RLS, and revoke direct access from anonymous/authenticated roles. Signature receipts are separately owned and writable only through the trusted signature-service role; billing can verify but not mint them. Browser access is limited to the two research `app_public` security-definer RPCs, each of which derives the current user, requires an active session, validates exact authorization/participant bindings, and exposes no enumeration parameter.

## Required follow-up before closure

1. Repair or separately reconcile the repository's historical clean-reset privilege/provisioning failures, then rerun the complete pgTAP suite; do not attribute those failures to a passing Issue #175 file.
2. Commit a reviewable candidate.
3. Obtain an independent exact base-to-head security/diff review in `docs/evidence/issue-175/independent-review.md`.
4. Push/open the draft PR, pass hosted `database`, `web`, and `plan-governance`, merge through the verified default branch, and record post-merge commands plus the live issue/PR state.
