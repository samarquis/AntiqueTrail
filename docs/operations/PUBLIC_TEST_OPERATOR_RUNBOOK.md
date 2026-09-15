# Public test operator runbook (first-time)

Practical, ordered procedure for a first-time operator to reconcile, configure,
publish, activate, verify and stop the bounded public test. It implements and
composes [PUBLIC_TEST_ADMISSION.md](./PUBLIC_TEST_ADMISSION.md),
[PRESERVED_BETA_UPGRADE.md](./PRESERVED_BETA_UPGRADE.md), the
[H-01 Vercel release contract](./H01_VERCEL_RELEASE_RUNBOOK.md) and
[ADR0010](../adr/0010-free-public-test-publication.md).

This runbook is not an acceptance receipt, an H-01 pass, or an activation
authority. Secrets and the operator specification stay private: never put an
email, a key or the private spec in a public issue, commit or artifact.

## Fixed target identities (enforced by the code)

| Item | Value |
|---|---|
| Supabase project ref | `uaupykgpegbseboklubv` (project `antique-trail-beta`) |
| Supabase URL | `https://uaupykgpegbseboklubv.supabase.co` |
| Stable frontend origin | `https://antique-trail.vercel.app` |
| Vercel project | `scott-marquis-projects/antique-trail` (id `prj_6WkHOQyyzALAHzlytLuYpWFgJ4FM`) |
| Region | `us-east-2` |
| `reviewRef` form | `https://github.com/samarquis/AntiqueTrail/pull/<number>` |

The Edge functions and the `public_test_private.runtime` row reject anything
else (`supabase/functions/**`, `20260912233000_issue_376_public_test_admission.sql`).
Do not change these identities as a shortcut; change the reviewed source instead.

## Milestones

Two activatable milestones within one 30-day runtime:

1. **Catalog-only** — `capabilities:["catalog"]`, `testers:[]`, frontend built
   with `VITE_PUBLIC_TEST_CATALOG_ONLY=true`. Anonymous visitors browse and
   read details for the twelve bound stores. Registration stays closed.
2. **Registration** — `capabilities` includes `registration` (and later `saved`),
   `testers` holds 1-2 named emails, mail provider accepted, real admitted
   tester accounts verified. Do not expose registration before that acceptance.

Runtime version starts at `1`. `prepare(spec, request_id, 1)` creates a
`prepared` binding and returns its `binding_id`; `activate(binding_id, 1)`
returns version `2`; `revoke(binding_id, 2)` returns `3`. Identical re-prepare
with the same `request_id`, spec and version is idempotent.

## Phase 0 — Access and custody

1. Authenticate the CLIs:
   ```
   supabase login
   npx vercel login
   ```
2. Confirm only one reachable backend and the exact target:
   ```
   supabase projects list
   supabase link --project-ref uaupykgpegbseboklubv
   ```
3. Prepare a private folder (for example `%USERPROFILE%\antique-private`, chmod
   `0600` files) holding: the operator specification, the exact acceptance
   evidence, the encrypted backup set with separate recovery key material, and
   the exact digests. Nothing from this folder is committed.
4. Record free-plan eligibility/hard limits for both providers and the named
   stop owner before any change (ADR0010).

## Phase 1 — Backend reconciliation (the risky step)

Follow `PRESERVED_BETA_UPGRADE.md` "Required ordering". Do **not** run
`supabase db push --include-all` and do **not** use
`supabase migration repair --status applied`.

1. Read the remote migration history without modifying anything:
   ```
   supabase migration list --linked
   ```
2. From an isolated, clean checkout of the final reviewed source SHA, capture:
   remote history rows (version + exact SQL), remote function owners/definitions,
   effective roles/privileges, row/object counts, provider configuration. Keep
   the raw bytes and per-item SHA-256 pairs in private custody.
3. Complete ADR0010's encrypted export and isolated restore rehearsal first.
   A schema-only dump or reset is not recovery evidence. Do not activate
   restored accounts or send mail during the rehearsal.
4. Apply `20260912230000_issue_374_preserved_beta_contract_bridge.sql` **first**,
   in one transaction, to both the rehearsal restore and (once accepted) the
   beta. It repairs dependencies needed by older-numbered pending migrations.
   Keep the old `20260823150000` collision history; add the bridge's own row
   only after it executes. What the bridge repairs is itemized in
   `PRESERVED_BETA_UPGRADE.md`.
5. Apply each remaining pending migration in reviewed order, recording its
   exact SQL only after successful execution. Stop on any version/content
   mismatch; reconcile against the transaction/history, never by relabeling.
6. Run the pgTAP contracts for this work:
   ```
   supabase test db   # or the CI harness that grants ephemeral test roles
   ```
   The relevant suites are `supabase/tests/0126_issue_374_preserved_beta_contract.sql`
   and `supabase/tests/0127_issue_376_public_test_admission.sql`. Passing SQL is
   not proof of hosted behavior.

## Phase 2 — Hosted Auth configuration

In the Supabase dashboard for `uaupykgpegbseboklubv` (Authentication →
URL Configuration and Providers):

1. Site URL: `https://antique-trail.vercel.app`.
2. Redirect URLs: add `https://antique-trail.vercel.app/auth/callback`.
3. Email provider: "Confirm email" (email confirmation) **ON**, "Allow new
   users to sign up" (direct provider signup) **OFF**. Human accounts are never
   auto-confirmed; registration flows through the reviewed admin
   `generate_link` path and callback.
4. Confirm the settings were applied and record the configuration digest (see
   Phase 6).

## Phase 3 — Mail provider (registration milestone)

The functions call an HTTPS mail relay with this exact contract
(`registration-config.ts`, `account-registration/index.ts`):

- `POST <REGISTRATION_MAIL_ENDPOINT>` — the endpoint pathname must be exactly
  `/send`. Headers: `Authorization: Bearer <token>` and
  `Idempotency-Key: <requestId>:send-verification`. Body: `{"recipient": <email>,
  "verificationUrl": <appCallbackUrl>}`. Success returns 2xx and
  `{"delivered": true}`.
- `POST <REGISTRATION_MAIL_ENDPOINT>/status` — body `{"idempotencyKey": <key>}`.
  Returns `{"outcome": "confirmed_delivered" | "confirmed_not_delivered" |
  "unknown"}`.

Accept and record the provider before exposing registration (the catalog-only
milestone keeps the relay closed). Local fixtures and mocked transport tests do
not count as acceptance.

## Phase 4 — Function environment and deployment

### 4a. Secrets

Create a private env file (never committed; file mode `0600`). Platform-injected
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` must resolve to
the beta project. Public-test registration additionally pins them in code to the
beta URL and app origin.

| Name | Used by | Rule |
|---|---|---|
| `PUBLIC_TEST_MODE` | public-catalog, account-registration, account-registration-callback | exactly `true` |
| `PUBLIC_CATALOG_GATEWAY_JWT` | public-catalog | constrained HS256 JWT, see 4b |
| `PUBLIC_CATALOG_RATE_SALT` | public-catalog | 32 random bytes hex |
| `PUBLIC_APP_ORIGIN` | public-catalog | `https://antique-trail.vercel.app` |
| `APP_ORIGIN` | account-registration, callback, cleanup | `https://antique-trail.vercel.app` |
| `REGISTRATION_APPROVED_APP_ORIGIN` | the three registration functions | same app origin |
| `REGISTRATION_EMAIL_HMAC_SECRET` | account-registration | `>= 32` random chars, used for `emailHmac` |
| `REGISTRATION_MAIL_ENDPOINT` | account-registration, callback, cleanup | https, pathname `/send` |
| `REGISTRATION_APPROVED_MAIL_ENDPOINT` | the three registration functions | byte-identical to the mail endpoint |
| `REGISTRATION_MAIL_TOKEN` | account-registration | bearer token for the relay |
| `REGISTRATION_APPROVED_SUPABASE_ORIGIN` | the three registration functions | `https://uaupykgpegbseboklubv.supabase.co` |
| `REGISTRATION_LOCAL_MODE` | the three registration functions | `false` |
| `REGISTRATION_PROVIDER_TIMEOUT_MS` | account-registration, cleanup | `10000` default |
| `REGISTRATION_CLEANUP_SCHEDULER_SECRET` | account-registration-cleanup | `>= 32` random chars |

Set them (values come from your private custody, never pasted into this repo):
```
supabase secrets set --project-ref uaupykgpegbseboklubv --env-file ".\private\function.env"
```
Protect the JWT secret, service-role key and HMAC secret; they must never reach
a browser, a VITE variable or a public artifact.

### 4b. Mint the catalog gateway JWT

The public catalog Edge function authenticates as the constrained
`public_catalog_gateway` role using an HS256 JWT signed with the Supabase JWT
secret (Dashboard → Settings → API → JWT Secret). Mint with a short TTL
(enforced client-side signing convention, same claims as the local harness in
`scripts/configured-shopper-local.mjs`):

```
node -e "const c=require('crypto');const s=process.env.SUPABASE_JWT_SECRET;const e=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const u=\`${e({alg:'HS256',typ:'JWT'})}.${e({role:'public_catalog_gateway',iss:'supabase',exp:Math.floor(Date.now()/1e3)+3600})}\`;process.stdout.write(u+'.'+c.createHmac('sha256',s).update(u).digest('base64url'))"
```
If the claim set differs from the reviewed public-catalog contract, stop and
correct, do not "work around" the role.

### 4c. Deploy

Deploy the reviewed functions to the exact backend (`--no-verify-jwt` for the
browser/scheduler-invoked edges, consistent with the verified hosting settings):

```
supabase functions deploy public-catalog --project-ref uaupykgpegbseboklubv --no-verify-jwt
supabase functions deploy account-registration --project-ref uaupykgpegbseboklubv --no-verify-jwt
supabase functions deploy account-registration-callback --project-ref uaupykgpegbseboklubv --no-verify-jwt
supabase functions deploy account-registration-cleanup --project-ref uaupykgpegbseboklubv --no-verify-jwt
```
Record each returned function version/identity. Callback denial never deletes an
already admitted human account; pending provider work stays owned by the
reconciliation protocol.

## Phase 5 — Frontend publish

Public build inputs only (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and for
catalog-only `VITE_PUBLIC_TEST_CATALOG_ONLY=true`). Never put a secret in a
VITE variable. `vercel.json` already carries the SPA rewrite, privacy headers
and callback no-store headers; `git.deploymentEnabled` is `false`, so the stable
alias only moves through an explicit reviewed publish.

From an isolated clean checkout at the final reviewed SHA, with locked
dependencies:

```
npm ci
vercel build
vercel deploy --prebuilt        # capture the deployment ID (staged, no alias yet)
vercel alias set <DEPLOYMENT_ID> antique-trail.vercel.app
```
Record the prior deployment/alias for rollback before aliasing. Keep the
artifact digest (Phase 6) with the deployment ID.

## Phase 6 — Binding spec and digests

`public_test_private.prepare` accepts exactly these keys and nothing more:
`backendRef`, `origin`, `sourceSha`, `artifactDigest`, `configurationDigest`,
`schemaDigest`, `evidenceDigest`, `decisionRef`, `reviewRef`, `operatorRef`,
`stopOwner`, `capabilities`, `storeIds`, `startsAt`, `expiresAt`, `testers`.
Secrets are omitted entirely (they live in private custody and are matched by
`configurationDigest`).

Digest recipe (record each command you actually ran in the private spec):

- `sourceSha`: `git rev-parse HEAD` at the final reviewed source.
- `artifactDigest`: the repository's canonical tree digest of the deployed
  `.vercel/output`/`dist` artifact (see `scripts/release-artifact.mjs`).
- `configurationDigest`: SHA-256 over the canonical sorted JSON of the accepted
  configuration contract — the **names** of every accepted setting plus each
  setting's own value hash. Values themselves are never stored in plaintext.
- `schemaDigest`: SHA-256 over `pg_dump --schema-only` of the reconciled beta.
- `evidenceDigest`: SHA-256 over the accepted evidence documents (computer-use
  and tester proof) held in private custody.

Compute the twelve bound stores:
```sql
select array_agg(id::text order by id)
from app_public.stores
where synthetic and audience = 'synthetic' and publication_state = 'active';
-- must return exactly 12; the prepare function rechecks this filter
```

For a registration tester, compute the email HMAC exactly as the Edge function
does (NFKC normalize, trim, lowercase en-US, then HMAC-SHA256 with the
`REGISTRATION_EMAIL_HMAC_SECRET`, hex):
```
node -e "const c=require('crypto');const [email,secret]=process.argv.slice(2);const norm=email.normalize('NFKC').trim().toLocaleLowerCase('en-US');process.stdout.write('email='+norm+' hmac='+c.createHmac('sha256',secret).update(norm).digest('hex'))" "Tester.Name@Example.com" "%REGISTRATION_EMAIL_HMAC_SECRET%"
```
The `email` in the spec is the same normalized value; `emailHmac` is the
64-hex HMAC. The database stores and enforces both (`lower(btrim(email))` and
`octet_length(email_hmac) = 32`).

## Phase 7 — Prepare, activate, verify, stop

Run these as the operator (`postgres`) in the beta database or via the dashboard
SQL editor.

### 7a. Check registration readiness (registration milestone only)

```sql
select state from app_private.registration_quarantine_latch where id = 1;            -- must be open
select state, count(*) from app_private.registration_cleanup_tickets group by state; -- only completed_absent
select state, count(*) from app_private.registration_provider_operations group by state; -- none reserved/calling/reconciliation_required
```
Activation refuses (`public_test_registration_not_ready`) otherwise.

### 7b. Prepare

Catalog-only spec (placeholders replaced from private custody; `startsAt` and
`expiresAt` ISO-8601 UTC, `expiresAt <= startsAt + 30 days`):
```sql
select public_test_private.prepare($json${
  "backendRef": "uaupykgpegbseboklubv",
  "origin": "https://antique-trail.vercel.app",
  "sourceSha": "<40-hex>",
  "artifactDigest": "<64-hex>",
  "configurationDigest": "<64-hex>",
  "schemaDigest": "<64-hex>",
  "evidenceDigest": "<64-hex>",
  "decisionRef": "<recorded acceptance ref>",
  "reviewRef": "https://github.com/samarquis/AntiqueTrail/pull/<number>",
  "operatorRef": "<operator id>",
  "stopOwner": "<named stop owner>",
  "capabilities": ["catalog"],
  "storeIds": ["<uuid1>", "... 12 in sorted order"],
  "startsAt": "<starts>",
  "expiresAt": "<starts + <=30d>",
  "testers": []
}$json$, '<request-uuid-v4>'::uuid, 1);
```
Record the returned `binding_id` in private custody. Replaying the identical
call returns the same id; any changed field raises `public_test_replay_mismatch`.

### 7c. Activate

```sql
select public_test_private.activate('<binding_id>'::uuid, 1);  -- returns 2
```
Then prove anonymous catalog behavior (Phase 8). Do **not** expose registration
until the mail acceptance (Phase 3) and a real tester account (Phase 9) pass.

### 7d. Stop / revoke

```sql
select public_test_private.revoke('<binding_id>'::uuid, 2);  -- returns 3
```
Revocation invalidates the registration config, revokes the named tester
sessions, and denies new test-only admission. Previously admitted accounts
retain provider sign-in for account lifecycle only. Roll back the frontend by
reassigning the retained deployment to the stable alias, then re-verify.

## Phase 8 — Signed-out computer-use proof

From a signed-out browser against `https://antique-trail.vercel.app`, prove:
`/`; direct `/stores`; reload; a direct store-details URL; Browse → details →
back; account entry (shows the catalog-only paused state, registration closed).
Record each path and whether it passed. A screen or fixture cannot substitute.

## Phase 9 — Real admitted tester account (registration milestone)

1. Prepare + activate a registration binding (testers 1-2, capabilities include
   `registration`).
2. Through the real mail relay, an invited tester completes registration and
   email verification; the callback must return `authenticated` with a session.
3. Verify the admitted session: profile active, shopper role, save listed store,
   sign out, signed-out denial of private routes, account lifecycle paths.
4. Record the exact evidence; registration must stay closed until this passes
   and the reviewed binding is approved.

## Completion

Return the stable tested URL, exact deployed source SHA, backend target, actual
function/config/schema identities and binding, passed paths and any excluded
paths. Keep the digest-bound deployment and prior deployment available for
rollback. Expiry is at most 30 days from first activation and is never renewed.