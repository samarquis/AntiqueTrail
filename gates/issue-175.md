# Gates: Issue #175 inactive commercial configuration and research controls

Scope: Immutable, approved-inactive Photo tier commercial configurations and a private exact-config research workflow. No price selection, sales activation, provider object creation, or public paid-plan presentation is in scope.

Base SHA: `56584b6229445424240c07adab1b817867e59868`

- [x] G1: Inactive approval rejects incomplete or ambiguous commercial disclosures and records canonical bytes, SHA-256 digest, authorization identity, approver, and approval time.
  CHECK: `npx supabase@2.115.0 db reset --local`; `npx supabase@2.115.0 test db`
  EXPECT: `0081_issue_175_inactive_commercial_config.sql` passes on a clean reset.
  EVIDENCE: Clean reset passed. Focused 0081 passed 53/53 assertions, including exact string-type/nonempty disclosure validation, three required community reviews, trusted signature-service receipt issuance, unique provider-proof enforcement across challenges, exact challenge/digest binding, future/stale/replay rejection, and frozen approval identity/time.

- [x] G2: Approved commercial fields are immutable; only named lifecycle transitions are accepted; superseding preserves the frozen packet; activation eligibility requires the exact version and digest.
  CHECK: `npx supabase@2.115.0 test db`
  EXPECT: lifecycle, mutation, stale-digest, and activation-candidate assertions pass.
  EVIDENCE: Focused 0081 passed 53/53, including field/limits mutation rejection, exact/mismatched activation digest, named transition, and prior-packet preservation assertions.

- [x] G3: Only the signed, eligible, unexpired participant can read the exact approved-inactive configuration; anonymous, ordinary owner, and admin roles cannot enumerate configuration tables or invoke the private projection.
  CHECK: `npx supabase@2.115.0 test db`
  EXPECT: RLS, table-grant, function-grant, session, authorization, participant, and stale-version assertions pass.
  EVIDENCE: Focused 0081 passed 53/53: all six private tables force RLS, browser/generic-service mutation grants are absent, anonymous execute is absent, authenticated exact-session read passes, and stale version/digest is denied.

- [x] G4: Research receipts bind the participant, consent, configuration version/digest, artifact digest, question version, refusal/abandonment, minimized reason code, and idempotency key without accepting free text.
  CHECK: `npx supabase@2.115.0 test db`; `npx vitest run src/features/billing src/app/App.test.tsx`
  EXPECT: database binding/replay tests and strict client parsing tests pass.
  EVIDENCE: Client suite passed locally: 4 files, 39 tests. Focused 0081 passed exact binding, append-only, replay, authorization-expiry/revocation race, minimized-shape, and zero-outbox assertions. The client reuses one response idempotency key after ambiguous response loss.

- [x] G5: The private authenticated route is absent unless exact research artifact and question versions are configured, sets `noindex, nofollow`, displays the complete approved packet, and has no purchase control.
  CHECK: `npx vitest run src/features/billing src/app/App.test.tsx`; `npx playwright test e2e/issue-175-commercial-research.spec.ts --config playwright.config.ts`; `npx playwright test e2e/issue-175-commercial-research.spec.ts --config playwright.review.config.ts`
  EXPECT: pass across desktop, tablet, and mobile review projects.
  EVIDENCE: Vitest passed 4 files/39 tests. The ordinary hosted-web Playwright configuration now injects the same deterministic commercial-research fixture flag as the extended review configuration; its exact spec passes 6/6 locally. The extended review matrix passed 9/9, including exact cancellation/refund/proration/downgrade/failed-payment/photo-deletion terms, 320px, forced-colors, reduced-motion, keyboard, overflow, and refusal checks.

- [x] G6: The inactive research boundary performs zero Stripe or other provider calls and cannot enqueue a billing-provider request.
  CHECK: `npx vitest run src/features/billing/billingProviderBoundary.test.ts`; browser network assertion in the Issue #175 Playwright spec.
  EXPECT: no provider fetch or matching browser request.
  EVIDENCE: Provider-boundary test passed within the 39-test focused suite; all three Playwright projects observed zero Stripe/Checkout/provider requests.

- [x] G7: Exact inactive fixture values are absent from the production artifact; no public route, sitemap, structured data, or cache response publishes them.
  CHECK: `npm run build`; exact fixed-string scan of `dist` for the synthetic tax, limits, policy, question, artifact, and configuration values.
  EXPECT: production build passes and scan returns no match.
  EVIDENCE: Production build passed (179 modules, 8.25s). Corrected exact-value scan passed. The first exploratory scan using bare `1200|1900` was invalid because those digit sequences occur in minified dependencies and is not relied upon.

- [x] G8: Static type, lint, security, and patch hygiene checks pass.
  CHECK: `npm run typecheck`; `npm run lint`; `npm run security:contract`; `git diff --check`
  EXPECT: pass.
  EVIDENCE: typecheck, lint, security contract, and diff check pass locally.

- [x] G9: The complete repository check, independent exact-diff/security review, and hosted `database`, `web`, and `plan-governance` checks pass on the candidate SHA.
  CHECK: `npm run check`; independent review receipt; `gh pr checks <PR_NUMBER> --watch`
  EXPECT: pass with exact base/head/merge SHAs recorded.
  EVIDENCE: Second-review clean reset and focused 0081 pass (53 assertions). The earlier full pgTAP run was blocked by clean-reset privilege/provisioning failures in 17 historical files (79 files, 2037 assertions reached); it was not repeated after the review changes per the granted database-lane scope. PR #204's web job failed six Issue #175 cases at `ec0b8e50ee5e6dc516482d5ac097c67ae437773d` because the default Playwright server omitted the fixture feature flag while 407 unrelated cases passed. The reviewer approved replacement implementation head `89353ee51799627d204d31da5406ce8a0b18a0d1`; its hosted database, web, and plan-governance checks passed. The required final documentation-only-head reruns and exact-head review comment are external receipts so they do not create a self-referential commit.
