# Gates: Issue #138 assigned onboarding approval

Scope: deliver one administrator-facing, server-authoritative Pilot Store Draft approval slice: a distinct onboarding queue category, allowlisted decision context, reason/confirmation, and an atomic approved outcome.

- [ ] G1: The authoritative review RPC returns an onboarding category/count, allowlisted consent and authority status, and an approval outcome naming only the created Pilot Store Record and exact representative scope.
      CHECK: docker run --rm --network container:supabase_db_antique-trail --volume "${PWD}/supabase/tests:/tmp/tests:ro" --env PGHOST=127.0.0.1 --env PGPORT=5432 --env PGUSER=antique_trail_test_runner --env PGPASSWORD=local-pgtap-only --env PGDATABASE=postgres --env "PGOPTIONS=-c search_path=public,extensions" public.ecr.aws/supabase/pg_prove:3.36 pg_prove --host 127.0.0.1 --port 5432 --username antique_trail_test_runner --dbname postgres /tmp/tests/0060_package_7_operational_admin.sql
      EXPECT: /Result: PASS/
      EVIDENCE: pending

- [x] G2: The typed admin client and local-review fixture carry the onboarding payload without a client-only approval state.
      CHECK: npm test -- --run src/features/admin/adminClient.test.ts src/review-harness/clients.test.ts
      EXPECT: /Test Files 2 passed/
      EVIDENCE: 2026-08-28 — `npm test -- --run src/features/admin/components.test.tsx src/features/admin/adminClient.test.ts src/review-harness/clients.test.ts` passed 3 files / 28 tests.

- [x] G3: An assigned Administrator can discover and complete the narrow onboarding case; it shows no raw evidence and safely distinguishes approve, return, and reject.
      CHECK: npm test -- --run src/features/admin/components.test.tsx
      EXPECT: /Test Files 1 passed/
      EVIDENCE: 2026-08-28 — focused 3-file / 28-test run passed; onboarding assertions check category, statuses, omitted preview hash, exact approval result, and non-public return/reject copy.

- [x] G4: Browser coverage verifies the onboarding route at desktop, tablet, mobile, and 320 CSS px, including keyboard and safe state variants.
      CHECK: npx playwright test e2e/ui09-admin-moderation.spec.ts --config=playwright.review.config.ts --grep "onboarding approval"
      EXPECT: /passed/
      EVIDENCE: 2026-08-28 — 3 passed: desktop, tablet, mobile; test keyboard-operates the category and case, then checks 320 CSS-px overflow.

- [ ] G5: Dated evidence and a review verdict explain the synthetic fixture boundary; typecheck, lint, formatting, build, and diff checks pass before closure.
      EVIDENCE: pending
