# Gates: Issue #132 Store Information hydration

Scope: Safely read, hydrate, and preserve representative-managed Store Information, with discoverable Store Information and Pending Changes destinations.

- [x] G1: The scoped portal home contract returns the existing phone, website, and description values for hydration.
  CHECK: npm test -- --run src/features/portal/portalClient.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: 2026-08-28: 1 file / 5 tests passed; the client preserves a scoped managedFields payload.

- [x] G2: Store Information waits for scoped values, exposes a generic failure state, and a one-field edit submits every hydrated managed value unchanged except that edit.
  CHECK: npm test -- --run src/features/portal/components.test.tsx
  EXPECT: Test Files  1 passed
  EVIDENCE: 2026-08-28: 1 file / 12 tests passed; loading, generic-read failure, and full hydrated save are covered.

- [x] G3: The review harness preserves managed values after a partial edit and both Portal destinations are discoverable.
  CHECK: npm test -- --run src/review-harness/clients.test.ts src/features/portal/components.test.tsx
  EXPECT: Test Files  2 passed
  EVIDENCE: 2026-08-28: 2 files / 28 tests passed; partial phone change retained website and description.

- [ ] G4: The portal RPC contract tests assert the home payload contains managed values without broadening access beyond the existing scoped function.
  CHECK: docker run --rm --network container:supabase_db_antique-trail --volume "${PWD}/supabase/tests:/tmp/tests:ro" --env PGHOST=127.0.0.1 --env PGPORT=5432 --env PGUSER=antique_trail_test_runner --env PGPASSWORD=local-pgtap-only --env PGDATABASE=postgres --env "PGOPTIONS=-c search_path=public,extensions" public.ecr.aws/supabase/pg_prove:3.36 pg_prove --host 127.0.0.1 --port 5432 --username antique_trail_test_runner --dbname postgres /tmp/tests/0057_package_6b_portal_contract.sql
  EXPECT: ok
  EVIDENCE: pending hosted or local pgTAP execution

- [x] G5: The implementation, focused verification commands, and residual limitations are recorded before closure review.
  EVIDENCE: docs/evidence/issue-132/store-information-hydration-2026-08-28.md records the source, focused checks, and the required pgTAP follow-up.
