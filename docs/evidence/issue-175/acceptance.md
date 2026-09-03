# Issue #175 acceptance evidence

Date: 2026-09-03

Base SHA: `56584b6229445424240c07adab1b817867e59868`

Candidate SHA: assigned at the reviewable candidate commit and reported in the handoff. This file cannot truthfully contain its own final commit SHA; the independent-review and PR receipts must pin the resulting head.

## Scope and limitations

This candidate implements inactive configuration and private value-research mechanics only. It does not choose or approve real prices, activate sales, create payment-provider objects, change protected plan sources, or claim human, hosted, provider, merge, or production evidence. The exact values in the review harness and tests are synthetic fixtures, not Product Owner decisions.

The serialized database lane was granted after Issue #168 released it. The final clean reset and focused Issue #175 pgTAP file pass. The full suite remains failing because 17 historical files hit clean-reset service-role/function privilege errors; Issue #175's file passes both focused and within the full run, so the repository-wide failure is recorded as a blocker rather than misreported as success.

## Acceptance matrix

| Criterion | Implementation path | Verification and current result | Artifact or limitation |
| --- | --- | --- | --- |
| Complete, unambiguous draft validation before inactive approval | `supabase/migrations/20260903040000_issue_175_inactive_commercial_config.sql`: completeness predicate and approval function cover Gallery/Full Gallery amounts, ISO currency, tax, first charge, renewal, refund, support, terms, privacy, and versioned Full Gallery constraints | Clean reset passes; focused 0081 passes 32/32 | `supabase/tests/0081_issue_175_inactive_commercial_config.sql` |
| Signed authorization, canonical bytes/digest, and post-approval immutability | The migration binds approval to an active signed research authorization, stores canonical JSON bytes plus SHA-256, and freezes commercial fields after draft | Deterministic digest, approval identity/time, and mutation rejection assertions pass | Same migration/test |
| Exact approved-inactive private read only | FORCE-RLS private tables, revoked browser grants, session-aware RPC, exact authorization/participant/version/digest predicates; authenticated feature-gated route | Vitest route/client tests pass; Playwright public absence and exact private route pass; RLS/grant/session/stale-binding pgTAP passes | 4 files/38 Vitest tests; 9/9 Playwright tests; 32/32 focused pgTAP assertions |
| Zero provider calls, objects, jobs, webhooks, public copy, structured data, sitemap content, or cached price response | Commercial research calls only database RPCs. `billingProviderRequest(..., 'commercial_research')` rejects before `fetch`. Production composition requires exact artifact/question environment values; review fixtures are development-only | Provider spy passes; browser request spies observe zero provider calls; build and exact fixture scan pass | `src/features/billing/billingProviderBoundary.test.ts`, `e2e/issue-175-commercial-research.spec.ts`; provider/production receipts are not claimed because no provider operation is permitted |
| Complete Full Gallery disclosure without misleading count language | Research component renders accepted media, bytes/dimensions, velocity, outage, moderation/abuse, reason/recovery/appeal, remedy, and version | Component and browser assertions pass; security vocabulary contract passes | Focused Vitest, Playwright, `npm run security:contract` |
| Bound, minimized research outcome including refusal/abandonment | Strict client types/parser and append-only RPC bind eligibility/consent, exact config/digest, artifact, question version, controlled choice/reason, and idempotency; no free-text field exists | Client parsing, submission, refusal, browser workflow, database replay/stale binding, append-only, and minimized-row assertions pass | Focused Vitest/Playwright and 0081 pass |
| Superseding preserves frozen packet; activation requires exact ratified digest | Named database lifecycle transitions, immutable approved payload, and exact version/digest activation-candidate function | Focused lifecycle/immutability/exact-digest assertions pass | 0081 passes; sales activation remains out of scope |
| Production/network guards fail on leakage or provider reachability | Provider boundary has a pre-fetch research rejection; route is absent without explicit research metadata; production bundle scanned for exact synthetic fixture values | Build passed; exact fixture scan found no matches; all browser provider-request assertions passed | The initial exploratory bare-number scan was invalid/noisy and is deliberately excluded from acceptance evidence |

## Verification ledger

| Command | Result |
| --- | --- |
| `npx vitest run src/features/billing src/app/App.test.tsx --reporter=verbose` | PASS — 4 files, 38 tests, 22.67s |
| `npx playwright test --config playwright.review.config.ts e2e/issue-175-commercial-research.spec.ts` | PASS — 9 tests, 40.7s |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — 179 modules, 8.25s |
| exact fixed-string scan of `dist` for synthetic tax, limits, policy/question versions, and 64-byte digests | PASS — no matches |
| `npm run security:contract` | PASS — secrets, licenses, action pins, migrations, tier vocabulary |
| `git diff --check` | PASS; one existing line-ending normalization warning is informational |
| `npx supabase@2.115.0 db reset --local` | PASS — final clean reset applied the new forward-only migration and seed successfully |
| `npx supabase@2.115.0 test db supabase/tests/0081_issue_175_inactive_commercial_config.sql` | PASS — 1 file, 32 tests |
| `npx supabase@2.115.0 test db` | BLOCKED — 79 files/2037 tests reached; 17 historical files fail on clean-reset service-role/function privileges. Issue #175's 0081 file passes within this run. |
| `npm run check` | PASS in the coordinator-confirmed isolated CPU lane — 90 Vitest files/639 tests, 69 release tests, typecheck, lint, format, and production build |
| independent review and hosted checks | Pending candidate commit, push, draft PR, and separate reviewer |

## Canonicalization and permission design

The canonical payload is assembled server-side in a fixed key order and encoded as UTF-8 JSON; the stored digest is `sha256(canonical_bytes)`. The pgTAP fixture independently computes the expected canonical bytes/digest and must pass before the database gates can be checked.

All commercial configuration, authorization, participant, and attempt tables live in `private`, use forced RLS, and revoke direct access from anonymous/authenticated roles. Only `billing_automation` receives table-policy access. Browser access is limited to the two `app_public` security-definer RPCs, each of which derives the current user, requires an active session, validates exact authorization/participant bindings, and exposes no enumeration parameter.

## Required follow-up before closure

1. Repair or separately reconcile the repository's historical clean-reset privilege/provisioning failures, then rerun the complete pgTAP suite; do not attribute those failures to a passing Issue #175 file.
2. Commit a reviewable candidate.
3. Obtain an independent exact base-to-head security/diff review in `docs/evidence/issue-175/independent-review.md`.
4. Push/open the draft PR, pass hosted `database`, `web`, and `plan-governance`, merge through the verified default branch, and record post-merge commands plus the live issue/PR state.
