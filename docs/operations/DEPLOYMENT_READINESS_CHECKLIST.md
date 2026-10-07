# Deployment readiness and gate evidence checklist

Stage applicability (2026-10-06): [PRD stages](../../PRD.md#stage-dependencies) and [ADR0012](../adr/0012-shopper-first-scope.md) own target product scope. The procedures below remain controls for their actual provider/exposure and retained data. Historical full-program cohorts or deferred features are not prerequisites to unrelated selected work. Existing ADR0010/0011 admissions are not expanded; future admitted routing/media/account use still requires its applicable proof. Photo subscriptions do not authorize infrastructure spending or migration.

Status: **UNACCEPTED / NO-GO**

This is a non-approving workbook for the remaining human, provider, and
deployment gates. A checked local test, placeholder, AI statement, or green CI
run is not a gate receipt. Record links to real provider configuration,
observed execution, and named-human approval. Keep capabilities disabled when
evidence is absent, expired, or contradictory.

## Gate order

Select the exact exposure first. Existing catalog-only verification follows ADR 0010/0011 and its current release-owner admission. New hosted account, routing or media work needs only its applicable prerequisites plus retained-data protections. The unpaid local outing does not depend on a complete regional launch, paid plans, teams or public reviews.

Use live GitHub issues for remaining work. Never infer a current NO-GO/PASS or assignment from an old workbook. Original full-program sequencing is [archived](../archive/planning/DEPLOYMENT_READINESS_CHECKLIST.md); it is not an execution queue.

## Configuration inventory

Do not put secrets in `VITE_*`, Git, issue comments, logs, screenshots, or gate
receipts. Record only secret identifiers, custodian, version, and rotation date.

### Browser-visible values

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TRIP_OFFLINE_GRANT_KEY_ID`
- `VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK`
- `VITE_PARTNER_EMAIL_PROVIDER_ENABLED`
- `VITE_PARTNER_MEDIA_PROVIDER_ENABLED`
- `VITE_PARTNER_SYNTHETIC_ENABLED`
- `VITE_AUTH_PROVIDER_GOOGLE_ENABLED`
- `VITE_AUTH_PROVIDER_FACEBOOK_ENABLED`

### Vercel deployment values

- Environment secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
  `H01_PASS_RECEIPT_BASE64`
- Environment variable: `VERCEL_SHARED_ALPHA_HOSTNAME`
- Public signer registry: `H01_PRODUCT_SIGNER_*`, `H01_SECURITY_SIGNER_*`,
  `H01_REVOKED_SIGNER_FINGERPRINTS_JSON`
- Repository guard: `vercel.json` sets `git.deploymentEnabled` to `false`
- Retired after verified cutover: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_*`

The H-01 evidence template, receipt verifier, and quota monitor now encode
`vercel_deployments_month` and `vercel-prebuilt-deploy`. The retired Cloudflare
workflows remain only as historical evidence;
`.github/workflows/vercel-release-artifact.yml` and
`.github/workflows/vercel-deploy-existing-artifact.yml` implement the protected
prebuilt path, covered by guard tests in `scripts/h01-gate.test.mjs`,
`scripts/release-artifact.test.mjs`, and `scripts/h01-quota-monitor.test.mjs`.
Provider activation still requires H-01 acceptance.

### Candidate services

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CANDIDATE_EMAIL_HMAC_SECRET`, `CANDIDATE_PAYLOAD_SECRET`
- `CANDIDATE_OUTBOUND_PROXY_URL`, `CANDIDATE_OUTBOUND_PROXY_SIGNED_CREDENTIAL`
- `CANDIDATE_WORKER_SECRET`
- `CANDIDATE_CLEANUP_JWT`, `CANDIDATE_CLEANUP_BUCKET`
- `CANDIDATE_CLEANUP_SCHEDULER_TOKEN`
- GitHub Actions: `SUPABASE_CANDIDATE_CLEANUP_URL`,
  `CANDIDATE_CLEANUP_INVOKE_JWT`, `CANDIDATE_CLEANUP_SCHEDULER_TOKEN`

Candidate cleanup has an in-repo schedule. Until activation, a repository
administrator must disable `candidate-cleanup.yml` in GitHub Actions (or run
`gh workflow disable candidate-cleanup.yml`) and record the observed `disabled`
state. An empty-secret scheduled failure is not deployment evidence. Activate
only after deploying the cleanup function, configuring all three Actions
secrets, passing a manual authenticated smoke invocation, and then running
`gh workflow enable candidate-cleanup.yml`. Record the first successful
scheduled run after activation.

Candidate share delivery requires a deployment-owned invocation schedule for
the `candidate-share-worker` function URL. The selected scheduler must keep
`SUPABASE_SERVICE_ROLE_KEY` and `CANDIDATE_WORKER_SECRET` in its protected secret
store and send both exact headers on `POST` with no credentials in the URL,
query, logs, or receipts:

```text
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
x-candidate-worker-secret: <CANDIDATE_WORKER_SECRET>
```

Record the function URL secret identifier, scheduler/provider, named
custodian, secret versions, rotation/revocation procedure, cadence,
one-at-a-time concurrency, invocation timeout, and bounded retry/backoff. Prove
`204` for an empty queue and `200` for one durably completed job. A missing or
invalid bearer must fail closed at either the platform or handler; record the
observed `401` or `503` and prove response neutrality. With a valid service-role
bearer, a missing or wrong `x-candidate-worker-secret` must reach the handler
and return `503`; unavailable dependencies must also return `503`. Record
observed retry and terminal receipts before acceptance;
`CANDIDATE_WORKER_SECRET` alone is insufficient.

### Trip services

- `TRIP_GRANT_SIGNER_JWT`
- `TRIP_GRANT_SIGNING_PRIVATE_JWK`
- `TRIP_GRANT_SIGNING_KEY_ID`
- `TRIP_GO_GATEWAY_JWT`

Before deployment, prove independently that
`TRIP_GRANT_SIGNING_PRIVATE_JWK` cryptographically corresponds to
`VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK`, and that
`TRIP_GRANT_SIGNING_KEY_ID` exactly equals
`VITE_TRIP_OFFLINE_GRANT_KEY_ID`. The JWKs do not need embedded `kid` members.
Run a deployment sign/verify smoke fixture before activation. Record key
version, custodian, activation, overlap/rotation, and revocation evidence. The
constrained JWT roles must match the database roles created by migrations; a
service-role key is not a substitute.

### Public catalog and partner boundaries

- `PUBLIC_CATALOG_GATEWAY_JWT`, `PUBLIC_APP_ORIGIN`,
  `PUBLIC_CATALOG_RATE_SALT`
- `PARTNER_SYNTHETIC_ENABLED`

The single catalog Edge Function selects its database projection from signed
server state, never from a browser flag. While `environment_stage` is
`synthetic_alpha`, it requires a non-null stage receipt, `private_auth=true`,
`receipt_only` registration with its signed receipt, an open registration
quarantine latch, and an active exact session with an active Shopper grant.
Only then may the constrained catalog gateway return Synthetic Stores. Outside
that stage it uses the Package 10B public projection, which continues to hide
Synthetic Stores. Missing or revoked stage/account evidence fails closed; the
browser cannot call either catalog RPC directly.

Real partner email and media remain disabled until E-01 and M-01 are accepted.

## Environment deployment record

Create one record per environment and deployment. Do not overwrite prior
records; link a superseding record.

| Field           | Required value                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Environment     | `local`, `shared_alpha`, `private_beta`, or `regional_public`                                     |
| Artifact        | Immutable artifact identifier and SHA-256 digest                                                  |
| Source          | Commit SHA and clean-build CI URL                                                                 |
| Database        | Migration-set digest and observed migration log                                                   |
| Configuration   | Content-free config manifest digest                                                               |
| Secrets         | Secret identifiers/versions, custodians, activation and rotation dates; no values                 |
| Functions       | Exact deployed function versions and access roles                                                 |
| Schedules       | Exact cleanup/delivery/anchor/backup schedules and last observed results                          |
| Denial checks   | Anonymous, wrong-account, stale-session, old-device, direct-RPC, and disabled-capability evidence |
| Smoke checks    | Dated list-first Browse, private actions, provider fallbacks, support/status checks               |
| Recovery        | Backup identifier, restore target, observed RPO/RTO, Auth/Storage reconciliation                  |
| Capacity/cost   | Plan, quotas, 25% headroom, 75% pause, 90% degradation, hard spend ceiling                        |
| Rollback        | Previous artifact/config/migration reference and observed rollback result                         |
| Monitoring      | Availability, error, quota, cost, queue age, cleanup age, incident routing                        |
| Evidence expiry | Expiry/retest date and invalidation triggers                                                      |

## Gate receipt template

Copy this section into a new dated evidence document or approved evidence
system. Never pre-check fields.

```text
Gate:
Environment:
Decision: PASS | NO-GO
Decision timestamp (UTC):
Effective until / retest date:
Artifact digest:
Migration-set digest:
Configuration-manifest digest:
Provider/version/region/retention:
Quota and hard cost ceiling:
Evidence links:
Observed denial tests:
Observed smoke tests:
Observed restore RPO/RTO:
Observed rollback:
Open defects and dispositions:
Named responsible owner:
Named independent approver (when required):
Signature mechanism and receipt identifier:
Supersedes:
Notes (content-free):
```

## Exposure-specific intake

Record the actual target, owner, cost boundary, data/credentials involved, recovery/rollback and selected capability. Read the applicable ADR/runbook and existing authorization. A new intake does not renew an expired receipt or reopen a paused provider operation. Use the scoped ADR 0010/0011 admission where it applies; do not impose the archived full H-01 program on unrelated local work or treat a narrow exception as general hosted approval.
