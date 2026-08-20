# H-01 Cloudflare Pages Direct Upload runbook

Status: **pipeline implemented; provider activation remains NO-GO**

These workflows implement the safely automatable frontend portion of H-01.
They do not create a Cloudflare project, configure Access, accept a gate, or
authorize a shared environment. The Pages project must be created as **Direct
Upload**; a Git-integrated Pages project is not acceptable under ADR 0005.

## One-time protected configuration

A repository administrator must create and protect the GitHub environment
named `shared-alpha`. Require designated reviewers, prevent self-review when
the GitHub plan supports it, restrict deployment branches to `main`, and store:

| Kind   | Name                                         | Meaning                                      |
| ------ | -------------------------------------------- | -------------------------------------------- |
| Secret | `CLOUDFLARE_API_TOKEN`                       | Least-privilege Pages deployment token       |
| Secret | `CLOUDFLARE_ACCOUNT_ID`                      | Cloudflare account identifier                |
| Secret | `H01_PASS_RECEIPT_BASE64`                    | Exact current signed PASS receipt, base64    |
| Var    | `CLOUDFLARE_PAGES_PROJECT`                   | Existing Direct Upload Pages project name    |
| Var    | `CLOUDFLARE_PAGES_BRANCH`                    | Direct Upload production branch, `main`      |
| Var    | `CLOUDFLARE_PAGES_HOSTNAME`                  | Full HTTPS canonical shared-stage origin URL |
| Var    | `H01_PRODUCT_SIGNER_ID`                      | Registered Product human identifier          |
| Var    | `H01_PRODUCT_SIGNER_FINGERPRINT`             | SHA-256 of Product Ed25519 SPKI DER          |
| Var    | `H01_PRODUCT_SIGNER_PUBLIC_KEY_SPKI_BASE64`  | Product public key only                      |
| Var    | `H01_SECURITY_SIGNER_ID`                     | Registered Security human identifier         |
| Var    | `H01_SECURITY_SIGNER_FINGERPRINT`            | SHA-256 of Security Ed25519 SPKI DER         |
| Var    | `H01_SECURITY_SIGNER_PUBLIC_KEY_SPKI_BASE64` | Security public key only                     |
| Var    | `H01_REVOKED_SIGNER_FINGERPRINTS_JSON`       | JSON array of revoked signer keys            |
| Var    | `VITE_SUPABASE_URL`                          | Public HTTPS Supabase project URL            |
| Var    | `VITE_SUPABASE_ANON_KEY`                     | Current publishable or legacy anon key       |
| Var    | `VITE_TRIP_OFFLINE_GRANT_KEY_ID`             | Public offline-grant verification key ID     |
| Var    | `VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK`         | Public EC P-256 verification JWK             |
| Var    | `VITE_PARTNER_EMAIL_PROVIDER_ENABLED`        | Public browser feature flag, `true`/`false`  |
| Var    | `VITE_PARTNER_MEDIA_PROVIDER_ENABLED`        | Public browser feature flag, `true`/`false`  |
| Var    | `VITE_PARTNER_SYNTHETIC_ENABLED`             | Public browser feature flag, `true`/`false`  |

Do not configure these names at repository scope. Environment-scoped values
ensure that the reviewer gate is crossed before they are released to a job.
The seven `VITE_*` values are public build inputs embedded in browser assets,
not secrets. `VITE_SUPABASE_ANON_KEY` accepts a current `sb_publishable_...`
value or a legacy anon key; never use a `sb_secret_...` or service-role key.
The artifact workflow validates these inputs as its first step and fails before
checkout or build if any value is missing or unsafe. It reports variable names
only and never logs their values. Separately, missing or malformed deployment
configuration produces a successful no-op workflow with a
`Deployment blocked safely` summary and never performs a provider call.

The token must allow only the selected account/project's Pages deployment and
deployment inspection operations. Record its identifier, custodian, version,
activation, rotation, and revocation receipt without recording its value.

The signer identities must be two named, distinct humans. Their Ed25519 private
keys remain offline under separate custody. Only public SPKI bytes and their
SHA-256 fingerprints belong in protected configuration. A revoked, inactive,
duplicated, substituted, or malformed key blocks deployment. Never put a private
signing key in GitHub, the repository, Supabase, logs, or a backup.

## Supabase production-deployment boundary

Do not leave Supabase GitHub Integration's `Deploy to production` option enabled
during H-01 evidence collection. Supabase deploys every Edge Function declared
in `supabase/config.toml` on production-branch pushes, so an unrelated
documentation merge can otherwise create a new hosted function version and
invalidate the deployment evidence. The repository intentionally has no
per-function declarations while provider deployment is blocked. Supabase
requires JWT verification by default, so the removed redundant
`verify_jwt = true` declaration does not weaken the hosted or local boundary.

Before an accepted Edge Function deployment, disable the provider-side
production integration and use a protected, digest-bound deployment procedure
that records the source commit, function bundle digest, provider version,
deployer, and time. Reintroduce a per-function configuration only when the
function needs a nondefault setting and the controlled procedure explicitly
binds that configuration. A provider version change outside that procedure
invalidates H-01 evidence and keeps the shared stage closed.

## Build the immutable artifact

Manually run `Build H-01 Pages release artifact`. It checks out `main`, installs
only the lockfile graph, runs static/unit/release/browser checks, and runs the
production build once. It inventories the exact `dist/` bytes in stable path
order, rejects symlinks, and records per-file SHA-256 values plus a deterministic
tree digest. The uploaded `antique-trail-pages` bundle contains that directory
and its manifest.

Copy these three coordinates from the workflow summary into the proposed gate
receipt:

- source workflow run ID;
- exact source commit SHA;
- exact artifact SHA-256 tree digest.

Download and retain every accepted bundle outside transient Actions storage.
GitHub artifact retention is 90 days and is not an indefinite release archive.
An unavailable prior bundle means rollback is not proven and keeps H-01 NO-GO.

## Promote without rebuilding

Manually run `Deploy existing H-01 Pages artifact` with the three recorded
coordinates, the signed receipt digest, exact deployment version,
`mode=promotion`, and the same content-free reason code present in the signature payload. The fixed
`shared-alpha` GitHub environment must require human approval.

Before any Cloudflare call, the workflow decodes the protected exact PASS
receipt; checks its digest, source SHA, artifact digest, environment, mode,
operation, reason, 30-minute validity, quota controls, journal/fence and
operation/subject bindings; re-verifies both signatures against the protected
registry; and consumes the nonce in a repository artifact marker. A prior marker
blocks replay. The deployment concurrency group serializes marker checks and
creation. The workflow then downloads the bundle from the specified prior run,
recomputes and checks every byte, and invokes exactly
`wrangler@4.28.1 pages deploy` against its existing `dist/`. It then obtains the
successful deployment through the Cloudflare API and fails unless a logged-out
request is denied by Cloudflare Access on both the unique deployment URL and
the canonical hostname. The resulting JSON receipt binds source, lockfile,
build environment, artifact digest, deployment ID/URL/time, Wrangler version,
access observations, source run, mode, and reason under a receipt digest.

This receipt proves only the recorded frontend operation. H-01 remains NO-GO
until every other ADR 0005 field has real, witnessed evidence.

## Roll back without rebuilding

Select the last accepted bundle—not merely the last workflow run—and recover
its recorded run ID, source SHA, and artifact digest. Manually dispatch the
same deployment workflow with `mode=rollback`. The workflow re-uploads the
verified prior directory and creates a new receipt. It never runs `npm ci`, a
compiler, a bundler, or a build during deployment.

Compare the new receipt's `artifact.artifactDigest` with the prior accepted
receipt. They must match exactly. Record the new Cloudflare deployment ID,
logged-out Access denial, canonical hostname observation, and human witness.
Any mismatch, missing artifact, public `2xx`, non-Access redirect, provider
ambiguity, or failed API inspection is a failed rollback proof and keeps the
shared stage disabled.

## Dependency pinning

Every GitHub Action reference is a full commit SHA with its major-version
comment. Wrangler is invoked at exact version `4.28.1`. Upgrades require a
reviewed commit, all checks, a new artifact, and a new deployment/rollback
rehearsal; do not edit versions only in a workflow run.

## Build the complete local gate receipt

`scripts/h01-gate.mjs` evaluates the provider observations after the real
deployment and recovery rehearsal. It never queries a provider and cannot turn
an assertion into evidence. Start with
`docs/operations/H01_GATE_EVIDENCE.template.json`, replace every placeholder
with witnessed facts and content-free evidence references. Record exact
artifact/source/lockfile, two-layer backup, fence deployment/version, latch
version, journal high-water/root, operation-set digest, subject-set digest,
operation, mode, transition, reason, a fresh random 32-byte nonce, issue time,
and an expiry no more than 30 minutes later.

Export the exact canonical bytes for both offline signers:

```powershell
node scripts/h01-gate.mjs payload `
  --evidence docs/operations/H01_GATE_EVIDENCE.json `
  > h01-authorization-payload.json
```

Each named human independently signs those exact bytes with their registered
offline Ed25519 private key. Insert only the base64 signatures, roles, public
fingerprints, and public registry data. Do not normalize or reformat the bytes
between signatures. Then run:

```powershell
node scripts/h01-gate.mjs receipt `
  --evidence docs/operations/H01_GATE_EVIDENCE.json `
  --out-dir receipts
```

The receipt command must run inside the signed 30-minute interval. It refuses a
nonce present in the optional content-free JSON ledger passed via
`--used-nonce-ledger`. Before dispatch, base64-encode the exact PASS receipt into
the protected `H01_PASS_RECEIPT_BASE64` environment secret and supply its
`receiptDigest` as the workflow input. The workflow verifies it again and
creates its one-use nonce marker before Wrangler executes. A failed run after
nonce consumption requires a newly signed nonce; never reuse the old receipt.

A passing receipt is written to
`receipts/<evidence-date>/h01-<stage>-<receipt-digest>.json`. The evidence and
receipt digests use canonical JSON, so identical evidence produces the same
content address. The command exits `2` for a `BLOCKED` receipt and still writes
the receipt so missing facts remain reviewable. It exits `1` only when the
input or filesystem operation itself is invalid. Never commit provider secrets,
private keys, passwords, tokens, raw personal data, or an invented provider
identifier to make the evaluator pass.

The evaluator applies the lower of the provider allowance and the documented
safe limit. Forecast normal and abuse usage must both retain 25% headroom. Live
usage below 75% may continue; at 75% promotion and nonessential growth pause;
at 90% optional maps, route suggestions, media, and nonessential email degrade;
at 100% the dependent operation blocks. Any automatic paid overage blocks the
gate. Documented startup safe limits are:

| Resource                   | Safe limit             |
| -------------------------- | ---------------------- |
| Supabase database          | 375 MB                 |
| Supabase Storage           | 750 MB                 |
| GitHub Actions             | 1,500 minutes/month    |
| Retained Actions artifacts | 400 MB                 |
| Cloudflare builds          | 375 builds/month       |
| Resend, only after E-01    | 70/day and 2,100/month |

## Running quota monitor and actuator

The release gate is not the running-system control. `scripts/h01-quota-monitor.mjs`
turns a current signed provider observation into a deterministic, content-free
restriction plan. The observation window is at most 15 minutes and includes
all five startup resources. Missing, stale, tampered, duplicated, or invalid
measurements fail closed. At 75% the plan pauses new rollouts and recruitment;
at 90% it additionally disables optional maps, route suggestions, media uploads,
and nonessential email while preserving core browse/account safety; at 100% it
also blocks unsafe dependent work. It never automatically re-enables a feature.
A later recovery requires a fresh observation and a separately reviewed release.

`Run H-01 quota monitor and actuator` runs every six hours and also supports a
manual dispatch. The scheduled job performs its configuration preflight before
checkout or script execution. When any protected input is absent it exits
successfully, reports a blocked-safe no-op, uploads nothing, and makes no
provider or actuator call, so an unconfigured repository does not generate
recurring failed-run email. Six hours is only a configuration-safe backstop;
before shared activation, an accountable operator must provide an external
provider observation/dispatch cadence shorter than the observation's 15-minute
validity window and own failure alerts.

The protected `shared-alpha` environment requires:

| Kind   | Name                                        | Meaning                                                |
| ------ | ------------------------------------------- | ------------------------------------------------------ |
| Secret | `H01_QUOTA_OBSERVATION_BASE64`              | Exact signed, current observation; replaced each run   |
| Var    | `H01_QUOTA_OBSERVER_KEY_ID`                 | Allowlisted observation signer key identifier          |
| Var    | `H01_QUOTA_OBSERVER_FINGERPRINT`            | SHA-256 of observer Ed25519 SPKI DER                   |
| Var    | `H01_QUOTA_OBSERVER_PUBLIC_KEY_SPKI_BASE64` | Observer public key only                               |
| Var    | `H01_QUOTA_ACTUATOR_URL`                    | HTTPS endpoint dedicated to quota restrictions         |
| Secret | `H01_QUOTA_ACTUATOR_TOKEN`                  | Environment-scoped least-privilege actuator credential |

The actuator endpoint is a required provider boundary, not implemented by this
repository. It must authenticate the request, accept only
`apply-h01-quota-restrictions`, allow only the seven enumerated restrictive
actions, be idempotent by plan digest, reject any enable/delete/general-provider
operation, and return an authenticated exact-action receipt bound to both the
observation and plan digests. The client uses a ten-second deadline and rejects
partial, extra, or unbound receipts. Incomplete configuration exits successfully
without any network call and records a blocked-safe workflow summary.

The real provider residuals are therefore explicit: provider-authenticated usage
collection, the registered observer key/custodian and rotation receipt, the
constrained actuator deployment/token/allowlist, wiring each action to tested
runtime kill switches, production-frequency dispatch and alert ownership, and witnessed
75%/90%/100% rehearsals. None exists merely because this code is present; until
all are configured and witnessed, H-01 and shared activation remain NO-GO.

The template deliberately describes a blocked state. A real receipt must also
prove separate active and unroutable restore projects, U.S. region, Direct
Upload, deny-by-default Access on every hostname, environment-scoped
least-privilege credentials, provider kill switches, registration closed with
the latch draining, and exact no-rebuild rollback digest matching.

Recovery is evaluated independently for Database, Auth, and Storage. The
maximum observed targets are 24-hour RPO/eight-hour RTO for Shared Synthetic
Alpha, four-hour RPO/eight-hour RTO for Private Beta, and 15-minute RPO/four-hour
RTO for Regional Public. The one-business-day Alpha RTO is represented as an
eight-hour working day. All three assets require integrity evidence; the
restore target must remain unroutable behind a deployment-level registration
fence, pre-restore sessions must be invalidated, and deletion/revocation
receipts must be replayed. The backup set must also prove Product Owner inner
and Recovery Custodian outer encryption and denial with either key alone.

This local evaluator does not satisfy the human/provider portion of H-01. A
passing input still requires provider-authenticated observations, named and
separate Product/Security signers with registered offline keys, named Product Owner and Recovery Custodian
key holders, witnessed backup/decrypt/restore and rollback runs, current plan
and `$0` no-overage evidence, secret custody and rotation evidence, Access
coverage/denial checks, and the remaining registration journal/fence/provider
finality fixtures required by ADR 0005. If any cannot be supplied, retain the
`BLOCKED` receipt and keep the shared stage disabled.
