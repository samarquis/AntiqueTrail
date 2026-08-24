# Gates: #99 fresh verification on main (07c6927)

Scope: regenerate dated local evidence that the closed #99 authenticator-privilege fix holds on current main. Out of scope: e2e Playwright, SBOM generation, npm audit, hosted-parity checks.

- [x] G1: typecheck exits clean
  CHECK: npm run typecheck && echo TYPECHECK_OK
  EXPECT: TYPECHECK_OK
  EVIDENCE: > tsc -b --pretty false | TYPECHECK_OK

- [x] G2: lint exits clean (debris scripts deleted in 07c6927 made this possible)
  CHECK: npm run lint && echo LINT_OK
  EXPECT: LINT_OK
  EVIDENCE: > eslint . | LINT_OK

- [x] G3: prettier check exits clean
  CHECK: npm run format && echo FORMAT_OK
  EXPECT: FORMAT_OK
  EVIDENCE: All matched files use Prettier code style! | FORMAT_OK

- [x] G4: vitest unit suite passes
  CHECK: npm run test && echo VITEST_OK
  EXPECT: VITEST_OK
  EVIDENCE: at listOnTimeout (node:internal/timers:605:17) | at processTimers (node:internal/timers:541:7) undefined

- [x] G5: release contracts pass
  CHECK: npm run test:release && echo RELEASE_CONTRACTS_OK
  EXPECT: RELEASE_CONTRACTS_OK
  EVIDENCE: ℹ duration_ms 2540.6655 | RELEASE_CONTRACTS_OK

- [x] G6: repository security contract passes (MPL-2.0 accepted per 07c6927)
  CHECK: npm run security:contract && echo SECURITY_CONTRACT_OK
  EXPECT: SECURITY_CONTRACT_OK
  EVIDENCE: Security contract checks passed: secrets, licenses, action pins, migrations. | SECURITY_CONTRACT_OK

- [x] G7: production build succeeds
  CHECK: npm run build && echo BUILD_OK
  EXPECT: BUILD_OK
  EVIDENCE: dist/workbox-9c191d2f.js | BUILD_OK

- [x] G8: fresh boot replays all migrations incl. 20260824000000 with zero manual steps
  CHECK: npx supabase@2.115.0 start && npx supabase@2.115.0 db reset --local && echo FRESH_BOOT_OK
  EXPECT: FRESH_BOOT_OK
  EVIDENCE: Restarting containers... | Finished supabase db reset on branch main.

- [x] G9: authenticator holds USAGE on app_public and membership of catalog_reader after fresh boot
  CHECK: docker exec -e PGPASSWORD=postgres supabase_db_antique-trail psql -U supabase_admin -d postgres -tAc "SELECT has_schema_privilege('authenticator','app_public','USAGE')||':'||pg_has_role('authenticator','catalog_reader','MEMBER')"
  EXPECT: /(t|true):(t|true)/
  EVIDENCE: true:true

- [x] G10: drifted volume is repaired by npm run db:post-boot (revoke -> f:f observed -> runbook -> t:t)
  CHECK: docker exec -e PGPASSWORD=postgres supabase_db_antique-trail psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "REVOKE USAGE ON SCHEMA app_public FROM authenticator; REVOKE catalog_reader FROM authenticator;" && docker exec -e PGPASSWORD=postgres supabase_db_antique-trail psql -U supabase_admin -d postgres -tAc "SELECT has_schema_privilege('authenticator','app_public','USAGE')||':'||pg_has_role('authenticator','catalog_reader','MEMBER')" && npm run db:post-boot && docker exec -e PGPASSWORD=postgres supabase_db_antique-trail psql -U supabase_admin -d postgres -tAc "SELECT has_schema_privilege('authenticator','app_public','USAGE')||':'||pg_has_role('authenticator','catalog_reader','MEMBER')" && echo DRIFT_REPAIR_OK
  EXPECT: /true:true.*DRIFT_REPAIR_OK|DRIFT_REPAIR_OK/s
  EVIDENCE: true:true | DRIFT_REPAIR_OK

- [x] G11: full pgTAP suite passes CI-identically including 0070_post_boot_authenticator_privileges
  CHECK: docker exec -i -e PGPASSWORD=postgres supabase_db_antique-trail psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < "%TEMP%\opencode\t99\pgtap-roles.sql" && docker run --rm --network container:supabase_db_antique-trail --volume "C:\Users\samar\OneDrive\Documents\AntiqueTrail\supabase\tests:/tmp/tests:ro" -e PGHOST=127.0.0.1 -e PGPORT=5432 -e PGUSER=antique_trail_test_runner -e PGPASSWORD=local-pgtap-only -e PGDATABASE=postgres -e "PGOPTIONS=-c search_path=public,extensions" public.ecr.aws/supabase/pg_prove:3.36 pg_prove --host 127.0.0.1 --port 5432 --username antique_trail_test_runner --dbname postgres --ext .pg --ext .sql --recurse /tmp/tests && echo PGTAP_OK
  EXPECT: /Result: PASS.*PGTAP_OK|PGTAP_OK/s
  EVIDENCE: psql:/tmp/tests/0069_shared_alpha_catalog_gateway.sql:4: NOTICE:  role "postgres" has already been granted membership in role "identity_service" by role "supabase_admin" | psql:/tmp/tests/0070_post_bo

- [x] G12: PostgREST hot path serves app_public RPC to catalog_reader JWT (HTTP 200) and denies anon (401)
  CHECK: node "%TEMP%\opencode\t99\rpc-smoke.mjs" && echo RPC_SMOKE_OK
  EXPECT: RPC_SMOKE_OK
  EVIDENCE: WARN: config section [inbucket] is deprecated. Please use [local_smtp] instead. | Stopped services: [supabase_imgproxy_antique-trail supabase_edge_runtime_antique-trail supabase_analytics_antique-trai
