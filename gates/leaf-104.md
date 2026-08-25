# Gates: leaf-104 (#104 /functions/v1/public-catalog gateway unserved locally, 503)

Scope: resolve the pending RUN-phase decision by IMPLEMENTING the serve-functions option: make `supabase functions serve` (edge runtime already part of local stack) actually serve /functions/v1/public-catalog locally and prove the gateway path end to end; record the decision in DECISIONS.tsv. WRITE/DOCS ONLY this phase — live verification is scheduled by the driver (stack owned elsewhere).

Read first: docs/stress/DECISIONS.tsv (2026-08-23T01:00 EXPLORE row), supabase/functions/ (find the public-catalog function), README local runbook section.

Deliverables:
1. docs/operations/RUNBOOK_LOCAL_FUNCTIONS_GATEWAY.md: exact local steps (serve command, env vars the function needs, port expectations), how the stress harness should target it, fallback if edge runtime is unavailable.
2. Whatever config/code change is genuinely required for the function to boot locally (check its imports/secrets handling; prefer zero code change).
3. Append DECISIONS.tsv row: decision=SERVE-LOCALLY with evidence column filled after Phase 2 verification.
4. README pointer from the stress/local runbook section to the new doc.

- [x] G1: runbook exists with concrete commands
  CHECK: Test-Path docs\operations\RUNBOOK_LOCAL_FUNCTIONS_GATEWAY.md
  EXPECT: True
  EVIDENCE: file written; covers supabase start bundled edge runtime under CLI 2.115.0, env contract, JWT minting, authenticator grant, restart, URL http://127.0.0.1:54321/functions/v1/public-catalog, probe ladder P0-P3 with expected coded responses, harness targeting + rate-limit ceiling (60/300s per IP-hash bucket), standalone functions serve fallback

- [x] G2: public-catalog function identified; any required local config documented or applied
  EVIDENCE: supabase/functions/public-catalog/index.ts; needs SUPABASE_URL/SUPABASE_ANON_KEY (built-in locally), PUBLIC_APP_ORIGIN, PUBLIC_CATALOG_RATE_SALT, PUBLIC_CATALOG_GATEWAY_JWT (role=public_catalog_gateway HS256 via local demo secret); returns own 503 GATEWAY_UNAVAILABLE unless POST + Origin==PUBLIC_APP_ORIGIN + all five set. Zero code change and zero config.toml change ([edge_runtime] default-enabled; verify_jwt satisfied by anon bearer/apikey like the browser sends). Required-but-undocumented DB step found and documented: grant public_catalog_gateway to authenticator (PostgREST SET ROLE membership; volume-local until folded into a post-boot migration by the migrations owner - outside this leaf's file ownership). Local stage=synthetic_alpha routes through synthetic_catalog_gateway_request whose evidence gate is unseeded, so anonymous list/details currently yields coded 503 CATALOG_UNAVAILABLE; map smoke probe (503 MAP_UNAVAILABLE) proves full chain without fixtures; true 200+12-store JSON additionally needs Synthetic Alpha fixtures + verified shopper session (seeder work DECISIONS 2026-08-23T01:02)

- [x] G3: DECISIONS.tsv row appended (evidence may say pending until Phase 2)
  CHECK: Select-String -Path docs\stress\DECISIONS.tsv -Pattern "public-catalog|functions serve"
  EXPECT: match
  EVIDENCE: row 2026-08-24T22:28:23Z RUN SERVE-LOCALLY appended tab-separated, result PENDING-LIVE

- [ ] G4: LIVE DEFERRED — driver verifies GET /functions/v1/public-catalog returns 200 + 12-store JSON in Phase 2 and flips the TSV result
  EVIDENCE: pending — CORRECTION FOR DRIVER: the function rejects every non-POST with 503 GATEWAY_UNAVAILABLE (index.ts request.method check); live verify must be a POST probe ladder, not GET. Minimal serving proof = POST {"operation":"map","args":{}} with Origin http://127.0.0.1:4173 -> 503 MAP_UNAVAILABLE (needs Step 3 grant applied). 200+12 stores additionally requires seeding the synthetic evidence rows + verified shopper active session per runbook
