# H-01 Shared Alpha pre-activation record — 2026-08-20

Gate: H-01 Hosting, recovery, access, and cost

Environment: `shared_alpha`

Decision: **NO-GO**

Observation window: 2026-08-20T03:17:25Z–2026-08-20T03:36:00Z

Supersedes: none

This is a content-free pre-activation record, not an H-01 PASS receipt. It
records only the provider state and entry points explicitly observed below.
The catalog entry point remained unavailable, no Pages artifact was deployed,
and no stage or capability activation was performed during this observation.
This record does not assert the state of an unqueried capability. Secret values,
user data, and provider credentials are intentionally absent.

## Source and verification

| Field | Observed value |
| --- | --- |
| Source | `498d0c301969a0443a7d6fedd57360cfcd5303b7` (`main`) |
| Clean-build CI | <https://github.com/samarquis/AntiqueTrail/actions/runs/32328029174> — web and database jobs passed |
| Pre-merge CI | <https://github.com/samarquis/AntiqueTrail/actions/runs/32327726475> — web and database jobs passed |
| Independent review | Standards PASS; Spec PASS on candidate fingerprint `87afa45005c074694ce00c5ef1309deec63b4595` |
| Security diff scan | `e766635b-6b2d-4410-a329-85dfc02740ae` — complete coverage, zero findings |

## Hosted Supabase topology

| Field | Observed value |
| --- | --- |
| Project | `uaupykgpegbseboklubv` / `antique-trail-beta` |
| Region / database | `us-east-2` / PostgreSQL `17.6.1.155` |
| Health | `ACTIVE_HEALTHY` |
| Migrations | 82 local versions matched 82 hosted versions through `20260823110000` |
| Migration-set digest | `sha256:9d35db8e043b52c591306943f019a2edab81dd13a9c131a6ec02bc9db35d81dd` |
| Digest algorithm | SHA-256 of UTF-8 lines `filename + space + lowercase file SHA-256`, filename-sorted, each line LF-terminated |
| Edge Functions | `account-registration-cleanup` v10; `public-catalog` v1 |
| Public catalog source | Deployed from the exact `main` worktree above |

The `public-catalog` function was deployed before its constrained database-role
JWT existed. Both an exact-origin request and a wrong-origin request returned
HTTP 503 with the neutral body `{"error":{"code":"GATEWAY_UNAVAILABLE"}}`.
No catalog row, identity fact, stage fact, credential fact, or internal error
was returned.

The hosted function secret inventory contains the platform-managed Supabase
secrets plus these application-owned identifiers:

- `PUBLIC_APP_ORIGIN`
- `PUBLIC_CATALOG_RATE_SALT`

Only provider-reported digests were inspected. Custodian, rotation, and
revocation evidence is not yet accepted. `PUBLIC_CATALOG_GATEWAY_JWT` is
intentionally absent, so the function remains unavailable.

## GitHub deployment protection

The `shared-alpha` environment was observed with:

- protected-branch-only deployment;
- required reviewer `samarquis`;
- self-review prevention enabled; and
- administrator bypass disabled.

This is deliberately blocking for a workflow initiated by the same account. A
distinct authorized human must participate before an environment job can gain
access to its secrets.

## Cloudflare Pages and Access observation

At 2026-08-20T03:36:00Z, unauthenticated requests to the configured canonical
Pages hostname returned HTTP 522 for each of these paths:

- `https://antique-trail-pages.pages.dev/`
- `https://antique-trail-pages.pages.dev/stores`
- `https://antique-trail-pages.pages.dev/manifest.webmanifest`

The responses did not redirect to or present a Cloudflare Access challenge.
They prove neither availability nor deny-by-default Access coverage. No Pages
artifact deployment was attempted, because Access, rollback, recovery, quota,
human-review, and signed-receipt gates remain incomplete.

## Explicitly missing evidence

The following required evidence is absent, so this record cannot authorize a
build, deployment, shared-stage activation, or H-01 PASS decision:

- deny-by-default Cloudflare Access coverage for canonical, preview, and unique
  deployment hostnames;
- Cloudflare token least-privilege scope identifier, named custodian, version,
  activation date, rotation procedure, and revocation proof;
- `PUBLIC_CATALOG_GATEWAY_JWT` issued for the constrained database role;
- hosted authenticated synthetic-catalog allow/deny and revocation smoke tests;
- `VITE_TRIP_OFFLINE_GRANT_KEY_ID` and
  `VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK`, their corresponding server-side signer
  configuration, named key custodian, rotation/revocation evidence, and a
  deployment sign/verify proof;
- remaining required Edge Functions, schedules, and their disabled-provider
  proofs;
- immutable Pages artifact and digest-matched prior rollback bundle;
- Database, Auth, Storage, configuration, and secret-manifest backup/restore on
  a separate target with witnessed RPO/RTO;
- external registration journal and deployment-fence evidence;
- provider-authenticated capacity/cost observations, hard no-overage controls,
  25% headroom, and witnessed 75%/90%/100% actuations;
- two-custodian encrypted recovery evidence;
- Product Owner approval of the Cloudflare/Supabase topology, monthly
  no-overage ceiling, public-stage recovery approach, and named provider,
  secret, backup, restore, and rollback custodians;
- distinct registered Product and Security signers over the same final receipt;
- incident, monitoring, support, rollback, and evidence-expiry ownership; and
- E-01, R-01, M-01, L-01, S-01, HC-01, HC-02, SEC-01, B-01, and SLM-01;
- ordered Package 5B, 6A, 6B, 7, 8A, 8B, 8C, 9, and 10A acceptance before
  Package 10B; and
- final Package 10B Product Owner review, capability transition, canary,
  monitoring, smoke, rollback, and signed public-release receipt.

## Invalidation triggers

Repeat this observation after any migration, Edge Function deployment, signing
key or API-key change, secret rotation/revocation, stage/config/latch change,
GitHub environment-policy change, Supabase platform upgrade, or contradictory
provider evidence. This record expires no later than 2026-08-27T03:36:00Z and
does not become PASS merely because it has not yet expired.
