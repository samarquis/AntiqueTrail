# Gates: #99 authenticator grants — post-boot runbook + migration

Scope: fresh boots and drifted volumes both leave PostgREST able to serve app_public RPCs as catalog_reader, by committed idempotent SQL rather than volume-local ad hoc grants. Repo precedent bar: scoped checks green → commit → close #99 with evidence.

- [x] G1: Fresh boot path self-heals — stack start + full `db reset` green with the new migration applied
  CHECK: npx --no-install supabase@2.115.0 db reset --local (tail) then docker exec psql count of applied migrations
  EXPECT: /20260824000000_post_boot_authenticator_privileges/ in reset output
  EVIDENCE: 2026-08-24 - reset exit 0, log tail shows "Applying migration 20260824000000_post_boot_authenticator_privileges.sql..." then "Finished supabase db reset on branch main"; supabase_migrations.schema_migrations counts 87 rows

- [x] G2: Privileges exist WITHOUT running post-boot.sql after reset (proves boot/reset path needs no manual step)
  CHECK: docker exec supabase_db_antique-trail psql -t -c "select has_schema_privilege('authenticator','app_public','USAGE'), pg_has_role('authenticator','catalog_reader','MEMBER')"
  EXPECT: /t\|t/
  EVIDENCE: 2026-08-24 - psql returns `t|t` immediately after reset with zero manual steps

- [x] G3: PGRST hot path restored — POST /rest/v1/rpc/catalog_list with minted role=catalog_reader JWT returns HTTP 200 and 12 synthetic stores
  CHECK: node one-liner mints HS256 JWT from local demo secret (secret never committed) + fetch; print status and array length
  EXPECT: /200.*12/
  EVIDENCE: 2026-08-24 - CATALOG_READER: STATUS=200 ROWS=12 (first row slug clockwork-cabinet); requires Content/Accept-Profile app_public headers like the browser client; ANON_CONTROL: STATUS=401 permission denied for function catalog_list (BY-DESIGN execute boundary intact)

- [x] G4: Drift repair works on a live volume without reset — the genuinely stale pre-reset volume served as the specimen: f/f before, `npm run db:post-boot` restores t/t and exits 0
  CHECK: verify f/f on drifted volume; npm run db:post-boot; verify t/t
  EXPECT: post-boot exit code 0 and /t\|t/ after repair
  EVIDENCE: 2026-08-24 - stale pre-reset volume measured f|f before; script prints before/after privilege tables, GRANT/GRANT ROLE/NOTIFY, DO block passed, EXIT=0, recheck t|t

- [x] G5: pgTAP suite green including new 0070 contract (CI-identical pg_prove invocation)
  CHECK: docker run public.ecr.aws/supabase/pg_prove:3.36 against supabase/tests (same flags as ci.yml lines 103-113)
  EXPECT: /0070.*ok|Result: PASS/i with 0070 in the run
  EVIDENCE: 2026-08-24 - after replicating ci.yml ephemeral-role step verbatim: "/tmp/tests/0070_post_boot_authenticator_privileges.sql ........ ok ... All tests successful. Files=70, Tests=1951 ... Result: PASS", PGTAP_EXIT=0

- [x] G6: Repository check bar green for the changed surface — typecheck, vitest, release contracts, build, prettier on touched files all green; full `npm run check` is blocked ONLY by pre-existing items outside this diff
  CHECK: npm run typecheck && npm run test && npm run test:release && npm run build; npx prettier --check package.json
  EXPECT: each exit 0
  EVIDENCE: 2026-08-24 - TC_EXIT=0; vitest "Test Files 85 passed (85), Tests 536 passed (536)"; release "pass 58 fail 0"; BUILD_EXIT=0; prettier clean. Pre-existing blockers (untouched by this diff): (a) 230 eslint errors entirely inside untracked prior-session debris scripts/backfill-demo-profiles.mjs, scripts/create-demo-users.mjs, scripts/gateway-entry.mjs and gitignored supabase/.temp CLI artifact — linting those paths alone reproduces exactly 230; (b) npm run security:contract fails on committed package-lock.json entries @axe-core/playwright + axe-core carrying MPL-2.0, which ALLOWED_LICENSES omits — main CI already red on commits 3435ffe/431136f for this repo state, predating this work

- [x] G7: Evidence recorded in repo docs and issue closed with citations
  EVIDENCE: 2026-08-24 - two rows appended to docs/stress/DECISIONS.tsv (FIX migration + TOOL runbook); issue #99 closed with evidence comment citing this ledger

Notes:
- ABANDON: none. Every gate met; no scope dropped.
- Hazard flagged, not fixed here: untracked scripts/gateway-entry.mjs line 4 embeds a hosted pooler connection string including a password. Recommend deleting the file and rotating that credential (same class as closed ticket #100).
- The requested 20-agent fan-out was impossible this session: every subagent spawn failed with ProviderModelNotFoundError (harness model misconfiguration), probe included. All gates were executed and evidenced solo instead.

