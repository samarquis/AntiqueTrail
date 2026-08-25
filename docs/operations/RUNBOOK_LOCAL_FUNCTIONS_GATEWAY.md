# Runbook: Serve the public-catalog Edge gateway locally

Resolves issue #104: production browser catalog traffic goes through
`POST {SUPABASE_URL}/functions/v1/public-catalog`, but the local stack answered
503 because nothing served the function. Under Supabase CLI 2.115.0 the local
stack already bundles an edge runtime (`supabase start` includes it), so serving
this function locally needs no code change: provide its env vars, grant the
gateway database role to `authenticator`, and restart.

This restores transport parity with production: same URL path, same Kong
front door, same function code. The prior deviation (stress harness targeting
direct REST RPC, DECISIONS.tsv 2026-08-23T01:00 EXPLORE) remains valid as the
high-volume SUT; see "Stress harness targeting" for why the gateway path is a
parity smoke / low-rate check, not a throughput target.

## What the function requires at boot

`supabase/functions/public-catalog/index.ts` reads five env vars and returns
its own `503 GATEWAY_UNAVAILABLE` unless every one is set, the request is
`POST`, and the `Origin` header exactly equals `PUBLIC_APP_ORIGIN`:

| Env var | Local source |
|---|---|
| `SUPABASE_URL` | Built-in under local CLI: injected into the function container as `http://kong:8000`. Do not override. |
| `SUPABASE_ANON_KEY` | Built-in: the local project anon key is injected automatically. Do not override. |
| `PUBLIC_APP_ORIGIN` | You provide. The app origin the function trusts for CORS, e.g. `http://127.0.0.1:4173`. |
| `PUBLIC_CATALOG_RATE_SALT` | You provide. Any non-empty local-only random string. |
| `PUBLIC_CATALOG_GATEWAY_JWT` | You mint. HS256 token with `"role": "public_catalog_gateway"` (see below). |

The browser client (`src/features/catalog/supabaseClient.ts`) sends
`Authorization: Bearer <access-token-or-anon-key>`, an `apikey` header, and
(being cross-origin from `:4173` to `:54321`) an automatic `Origin` header.
Local probes must send the same headers or they get `GATEWAY_UNAVAILABLE`.

## Step 1: Create the shared function env file

Create `supabase/functions/.env` (auto-loaded by both `supabase start` and
`supabase functions serve`; per-function `supabase/functions/public-catalog/.env`
files are loaded only by standalone `functions serve`, not `supabase start`,
so prefer the shared file):

```bash
# supabase/functions/.env -- LOCAL ONLY. Never commit; .gitignore only covers
# .env.local, so do not let this file reach git.
PUBLIC_APP_ORIGIN=http://127.0.0.1:4173
PUBLIC_CATALOG_RATE_SALT=replace-with-at-least-16-random-characters
PUBLIC_CATALOG_GATEWAY_JWT=replace-with-minted-local-gateway-jwt
```

Never put a real hosted secret here; these are local-only values.

## Step 2: Mint the gateway JWT

The gateway's database identity is the `public_catalog_gateway` role (created
by migration `20260817100000_package_10b_public_surface.sql`; it holds the only
EXECUTE grants on `app_public.synthetic_catalog_gateway_request` and
`app_public.public_catalog_gateway_request`). Locally, mint an HS256 token
signed with the local JWT secret shown by `npx supabase@2.115.0 status`
(default demo secret when config.toml sets none):

```powershell
node -e "const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const n=Math.floor(Date.now()/1000);const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'public_catalog_gateway',iat:n,exp:n+3600});console.log(h+'.'+p+'.'+c.createHmac('sha256','<jwt-secret-from-supabase-status>').update(h+'.'+p).digest('base64url'))"
```

Paste the output into `PUBLIC_CATALOG_GATEWAY_JWT`. Re-mint when it expires;
the same machinery mints the harness's other tokens (DECISIONS.tsv
2026-08-23T00:45 precedent).

## Step 3: Grant PostgREST entry privileges (volume-local, required once per reset)

PostgREST switches from `authenticator` to the JWT's `role` claim via
`SET ROLE`, which requires membership. Migration
`20260824000000_post_boot_authenticator_privileges.sql` fixes this for
`catalog_reader` but nothing grants `public_catalog_gateway` yet. Until that
grant is folded into the post-boot migration by the migrations owner, apply it
after every `db reset` on a running stack:

```powershell
docker exec supabase_db_antique-trail psql -U supabase_admin -d postgres -c "grant public_catalog_gateway to authenticator; notify pgrst,'reload schema';"
```

Skip nothing here: without it every request dies as `CATALOG_UNAVAILABLE`
instead of reaching the business responses below.

## Step 4: Restart so the env file loads

```powershell
npx supabase@2.115.0 stop
npx supabase@2.115.0 start
```

The edge runtime reads `supabase/functions/.env` at startup. No
`config.toml` change is needed: `[edge_runtime]` defaults to enabled, and the
default per-function `verify_jwt = true` is satisfied by sending the anon key
as bearer/apikey exactly like the browser does.

## Verify: probe ladder against http://127.0.0.1:54321/functions/v1/public-catalog

Each expected response proves a specific layer. All bodies are JSON.

| Probe | Command sketch | Expected | Proves |
|---|---|---|---|
| P0 wrong verb | `curl.exe -s http://127.0.0.1:54321/functions/v1/public-catalog` | `503 {"error":{"code":"GATEWAY_UNAVAILABLE"}}` | function reachable (GET is always rejected by design) |
| P1 missing Origin | POST list without `-H "Origin: ..."` | `503 GATEWAY_UNAVAILABLE` | origin/env contract enforced |
| P2 map smoke | POST `{"operation":"map","args":{}}` with Origin + anon bearer | `503 {"error":{"code":"MAP_UNAVAILABLE"}}` | full chain works: Kong -> edge runtime -> env -> supabase-js -> PostgREST `SET ROLE public_catalog_gateway` -> RPC raised the stage's map-disabled error |
| P3 anonymous list/details | POST `{"operation":"list","args":{}}` with Origin + anon bearer | currently `503 CATALOG_UNAVAILABLE` | expected until the Shared Synthetic Alpha evidence rows exist (see below) |

P2 is the minimal live-serving proof and needs no seeded data.

P3/P4 context: locally `app_private.environment_stage` sits at
`synthetic_alpha`, so requests route through
`synthetic_catalog_gateway_request`, whose admission order is: stage check ->
map rejection -> evidence gate (stage receipt + registration-config receipt +
open quarantine latch; unseeded locally) -> verified shopper check. A real
`200` therefore additionally needs the Synthetic Alpha fixtures: seed the three
evidence rows plus a shopper (`auth.users` + `app_private.profiles` + active
`app_private.role_grants` shopper grant + one `app_private.active_sessions`
row whose id matches the JWT `session_id` claim), then send a verified shopper
bearer. This is the same fixture work planned for the volume seeder
(DECISIONS.tsv 2026-08-23T01:02); until it lands, expect P3's coded 503s.

Full-parity probe once fixtures exist:

```powershell
curl.exe -s -X POST http://127.0.0.1:54321/functions/v1/public-catalog `
  -H "Origin: http://127.0.0.1:4173" `
  -H "Authorization: Bearer <shopper-access-token>" `
  -H "apikey: <local-anon-key>" -H "Content-Type: application/json" `
  -d '{\"operation\":\"list\",\"args\":{}}'
```

Expected: `200 {"data":[ ...12 synthetic stores... ]}`.

## Stress harness targeting

Point the harness at the gateway with production-shaped requests: POST to
`http://127.0.0.1:54321/functions/v1/public-catalog`, `Origin` header equal to
`PUBLIC_APP_ORIGIN`, `apikey` + `Authorization` bearers, body
`{"operation":"list"|"details"|"map","args":{...}}`.

Know the ceiling before load-testing through it: the gateway enforces its
abuse controls locally exactly as in production. Every caller behind one IP
hashes to one rate bucket (`SHA-256(PUBLIC_CATALOG_RATE_SALT|remoteAddr)`),
60 requests per 300 s window for list/map, 120 for details; excess returns
`429 RATE_LIMITED` with `Retry-After: 300`. A k6 ramp will exhaust that bucket
in seconds. Treat gateway runs as transport-parity smokes and modest-rate
soaks of the abuse path; keep direct REST RPC (catalog_reader JWT,
DECISIONS.tsv 2026-08-23T00:45) as the high-volume SUT. Token rotation per
phase still applies (DECISIONS.tsv 2026-08-23T11:06:53 BASELINE row).

## Fallback if the edge runtime cannot run

If the bundled edge runtime image is unavailable on a machine:

1. Standalone serve: stop the stack, then
   `npx supabase@2.115.0 functions serve public-catalog --debug`. It loads the
   shared `supabase/functions/.env` (plus any per-function `.env`) and serves
   `http://127.0.0.1:54321/functions/v1/public-catalog` directly from the CLI,
   bypassing Kong/JWT verification; the same probe ladder applies minus the
   `apikey` requirement.
2. If neither runtime path works, revert to the documented deviation:
   harness targets direct REST RPC as catalog_reader (DECISIONS.tsv
   2026-08-23T01:00 EXPLORE row) and records the fallback in that file.

## Troubleshooting quick table

| Symptom | Likely cause |
|---|---|
| Always `GATEWAY_UNAVAILABLE` even on valid POST | `supabase/functions/.env` missing/unread, or `Origin` header not exactly equal to `PUBLIC_APP_ORIGIN` (scheme+host+port) |
| `MAP_UNAVAILABLE` never appears where expected | request not actually reaching the DB path; check Step 3 grant and that `environment_stage` is still `synthetic_alpha` |
| `CATALOG_UNAVAILABLE` on list/details | Shared Synthetic Alpha evidence gate unseeded (expected pre-fixture), or gateway RPC privilege failure — compare against P2 |
| `403 {"error":{"code":"ALPHA_AUTH_REQUIRED"}}` | chain fully wired; bearer failed the verified-shopper/session check (fixtures or token issue) |
| `429 RATE_LIMITED` | working as designed; wait out the 300 s window or re-mint a different salt |
