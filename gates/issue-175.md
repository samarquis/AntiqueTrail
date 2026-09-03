# Gates: Issue #175 inactive commercial configuration and research controls

Scope: Immutable, approved-inactive Photo tier commercial configurations and a private exact-config research workflow. No price selection, sales activation, provider object creation, or public paid-plan presentation is in scope.

Base SHA: `56584b6229445424240c07adab1b817867e59868`

- [x] G1: Inactive approval rejects incomplete or ambiguous commercial disclosures and records canonical bytes, SHA-256 digest, authorization identity, approver, and approval time.
  CHECK: `npx supabase@2.115.0 db reset --local`; `npx supabase@2.115.0 test db`
  EXPECT: `0081_issue_175_inactive_commercial_config.sql` passes on a clean reset.
  EVIDENCE: Clean reset passed. Focused 0081 passed 32/32 assertions, including incomplete approval rejection, canonical digest agreement, and frozen approval identity/time.

- [x] G2: Approved commercial fields are immutable; only named lifecycle transitions are accepted; superseding preserves the frozen packet; activation eligibility requires the exact version and digest.
  CHECK: `npx supabase@2.115.0 test db`
  EXPECT: lifecycle, mutation, stale-digest, and activation-candidate assertions pass.
  EVIDENCE: Focused 0081 passed 32/32, including field/limits mutation rejection, exact/mismatched activation digest, named transition, and prior-packet preservation assertions.

- [x] G3: Only the signed, eligible, unexpired participant can read the exact approved-inactive configuration; anonymous, ordinary owner, and admin roles cannot enumerate configuration tables or invoke the private projection.
  CHECK: `npx supabase@2.115.0 test db`
  EXPECT: RLS, table-grant, function-grant, session, authorization, participant, and stale-version assertions pass.
  EVIDENCE: Focused 0081 passed 32/32: all four private tables force RLS, browser/generic-service table grants are absent, anonymous execute is absent, authenticated exact-session read passes, and stale version/digest is denied.

- [x] G4: Research receipts bind the participant, consent, configuration version/digest, artifact digest, question version, refusal/abandonment, minimized reason code, and idempotency key without accepting free text.
  CHECK: `npx supabase@2.115.0 test db`; `npx vitest run src/features/billing src/app/App.test.tsx`
  EXPECT: database binding/replay tests and strict client parsing tests pass.
  EVIDENCE: Client suite passed locally: 4 files, 38 tests. Focused 0081 passed its exact binding, append-only, replay, stale-input, minimized-shape, and zero-outbox assertions.

- [x] G5: The private authenticated route is absent unless exact research artifact and question versions are configured, sets `noindex, nofollow`, displays the complete approved packet, and has no purchase control.
  CHECK: `npx vitest run src/features/billing src/app/App.test.tsx`; `npx playwright test --config playwright.review.config.ts e2e/issue-175-commercial-research.spec.ts`
  EXPECT: pass across desktop, tablet, and mobile review projects.
  EVIDENCE: Vitest passed 4 files/38 tests in 22.67s. Playwright passed 9/9 tests in 40.7s, including 320px, forced-colors, reduced-motion, keyboard, overflow, refusal, and public-route absence checks.

- [x] G6: The inactive research boundary performs zero Stripe or other provider calls and cannot enqueue a billing-provider request.
  CHECK: `npx vitest run src/features/billing/billingProviderBoundary.test.ts`; browser network assertion in the Issue #175 Playwright spec.
  EXPECT: no provider fetch or matching browser request.
  EVIDENCE: Provider-boundary test passed within the 38-test focused suite; all three Playwright projects observed zero Stripe/Checkout/provider requests.

- [x] G7: Exact inactive fixture values are absent from the production artifact; no public route, sitemap, structured data, or cache response publishes them.
  CHECK: `npm run build`; exact fixed-string scan of `dist` for the synthetic tax, limits, policy, question, artifact, and configuration values.
  EXPECT: production build passes and scan returns no match.
  EVIDENCE: Production build passed (179 modules, 8.25s). Corrected exact-value scan passed. The first exploratory scan using bare `1200|1900` was invalid because those digit sequences occur in minified dependencies and is not relied upon.

- [x] G8: Static type, lint, security, and patch hygiene checks pass.
  CHECK: `npm run typecheck`; `npm run lint`; `npm run security:contract`; `git diff --check`
  EXPECT: pass.
  EVIDENCE: typecheck, lint, security contract, and diff check pass locally.

- [ ] G9: The complete repository check, independent exact-diff/security review, and hosted `database`, `web`, and `plan-governance` checks pass on the candidate SHA.
  CHECK: `npm run check`; independent review receipt; `gh pr checks <PR_NUMBER> --watch`
  EXPECT: pass with exact base/head/merge SHAs recorded.
  EVIDENCE: Clean reset and focused 0081 pass. The full pgTAP run is blocked by clean-reset privilege/provisioning failures in 17 historical files (79 files, 2037 assertions reached); 0081 passes within that run. An isolated `npm run check` passes (90 Vitest files/639 tests, 69 release tests, production build). Candidate commit, independent review, PR, hosted checks, merge, and post-merge proof remain pending.
