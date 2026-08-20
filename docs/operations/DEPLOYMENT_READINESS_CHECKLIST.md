# Deployment readiness and gate evidence checklist

Status: **UNACCEPTED / NO-GO**

This is a non-approving workbook for the remaining human, provider, and
deployment gates. A checked local test, placeholder, AI statement, or green CI
run is not a gate receipt. Record links to real provider configuration,
observed execution, and named-human approval. Keep capabilities disabled when
evidence is absent, expired, or contradictory.

Current accepted code baseline before the Vercel documentation change:

- Commit: `680681049df2c2b5495c8baa7064b091be414827`
- CI: <https://github.com/samarquis/AntiqueTrail/actions/runs/32331761838>
- Deployment-provider decision: ADR 0006 selects Vercel; live Vercel configuration and release evidence remain unaccepted

## Gate order

Independent preflight gates may run in parallel. Downstream execution must
still follow the dependency column.

| Layer | Gate               | Required decision or observed evidence                                                                                                                                   | Depends on                                                 | Current state                          |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------- |
| 1     | #2 H-01            | Approve Vercel/Supabase topology, plan eligibility, protected prebuilt deployment, cost ceiling, quota stops, RPO/RTO; witness DB/Auth/Storage restore and rollback      | None                                                       | NO-GO                                  |
| 1     | #3 E-01            | Approve email provider/region/retention/cost; witness tracking-free delivery, reconciliation, retry, outage, and recovery behavior                                       | None                                                       | NO-GO                                  |
| 1     | #4 R-01            | Approve routing/geocoding privacy, region, retention, attribution, quota/cost; witness minimized request and fallback behavior                                           | None                                                       | NO-GO                                  |
| 1     | #5 M-01            | Approve quarantined media pipeline; witness decode limits, EXIF removal, re-encode, deletion, and restore                                                                | None                                                       | NO-GO                                  |
| 1     | #6 L-01            | Approve separately administered content-free audit anchor; witness publish, missed-root disablement, recovery, and replay                                                | None                                                       | NO-GO                                  |
| 1     | #7 S-01            | Name monitored support/security/status channels, severity commitments, on-call primary/backup; rehearse incident and deletion lifecycle                                  | None                                                       | NO-GO                                  |
| 1     | #8 HC-01           | Name and obtain acceptance from Product, Engineering/Security, Operations, support backup, second verifier, legal/insurance, and independent reviewer humans             | None                                                       | NO-GO                                  |
| 1     | #11 B-01           | Product Owner approves final brand/copy/owned HTTPS domain; verify canonical routes, redirects, sitemap, robots, and non-endorsement copy                                | None                                                       | NO-GO                                  |
| 1     | A-01               | Optional analytics requires a separate consent/minimization ADR and acceptance receipt; otherwise analytics remains disabled                                             | None                                                       | OFF / NO-GO unless separately approved |
| 2     | #15, #16, #17, #18 | Hosted Synthetic isolation, workers, cleanup, separate-device/offline journey, and Product Owner Continue/Revise/Stop receipt                                            | H-01; #18 also needs #15/#17                               | NO-GO                                  |
| 3     | #19                | Real provider-backed map/Check My Day privacy, attribution, quota, outage, and fallback evidence                                                                         | R-01, #17                                                  | NO-GO                                  |
| 3     | #20                | Real invitation/email, Administrator MFA, authority, consent, withdrawal, and recheck evidence                                                                           | E-01, HC-01; shared external use also needs H-01/S-01/L-01 | NO-GO                                  |
| 4     | #25                | Product Owner authorizes stores 1, 2, and 3 sequentially; signed expansion receipts, recovery/support/monitoring, zero Blocking Defects                                  | Prior private-beta prerequisites                           | NO-GO                                  |
| 4     | #9 HC-02           | Name and rehearse moderation, independent appeal, support, on-call backup, two verifiers, accessibility, and incident owners                                             | Package 8B is complete                                     | NO-GO                                  |
| 4     | #10 SEC-01         | Independent release-candidate review, dated dispositions, executable retests, zero Blocking Defects                                                                      | Package 9 is complete                                      | NO-GO                                  |
| 5     | #27                | Two named CAT-01 reviewers, three listings, budget approval, invited cohort, nine unique itineraries, legal/support/security/recovery evidence, signed readiness receipt | #25, HC-02                                                 | NO-GO                                  |
| 6     | #28                | Product Owner release approval; recovery/capacity, migration dry run, canary, smoke, monitoring/status, consented promotion, rollback, signed receipt                    | #27 and accepted #2-#7/#9/#10/#11                          | NO-GO                                  |
| 7     | #29                | Frozen rolling Topeka evidence and Product Owner-only RG-01 receipt                                                                                                      | Signed #28 release                                         | NO-GO                                  |
| 8     | #30                | Separately selected eligible community, real listings/consent/provenance/trips/support/recovery, activation/rollback and signed gate; stop after ordinal 3               | Passing #29, then prior community gate                     | NO-GO                                  |

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

### Vercel deployment values

- Environment secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
  `H01_PASS_RECEIPT_BASE64`
- Environment variable: `VERCEL_SHARED_ALPHA_HOSTNAME`
- Public signer registry: `H01_PRODUCT_SIGNER_*`, `H01_SECURITY_SIGNER_*`,
  `H01_REVOKED_SIGNER_FINGERPRINTS_JSON`
- Repository guard: `vercel.json` sets `git.deploymentEnabled` to `false`
- Retired after verified cutover: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_*`

The existing H-01 evidence template, receipt verifier, and Pages workflows still
encode Cloudflare-specific operation/quota fields. They cannot authorize a
Vercel call and must be migrated and retested before provider activation.

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

## Immediate first H-01 intake

H-01 can start now and unlocks hosted acceptance. The Product Owner must choose
and approve:

1. The exact Vercel project/owner/plan plus Supabase environment/access topology.
2. The allowed monthly cost/no-overage ceiling.
3. Whether public-stage backup/restore uses an approved paid capability or a
   demonstrated compliant alternative.
4. Named human custodian(s) for provider accounts, secrets, backup media, and
   restore/rollback execution.

These choices are intake inputs, not an H-01 acceptance receipt. Every H-01
requirement in ADRs 0005/0006 remains mandatory, including Vercel plan-use
eligibility, disabled automatic Git deployment, deny-by-default Deployment
Protection for every shared hostname, protected prebuilt deployment and
digest-matched rollback, complete
Database/Auth/Storage/configuration recovery, quota and no-charge stops, the
external registration journal and deployment fence, two-custodian encrypted
backup recovery, hosted private-helper privilege/denial proofs, and separate
Product/Security recovery signers. Until every applicable proof is observed and
signed, shared hosted acceptance and every dependent public/private stage
remain **NO-GO**.
