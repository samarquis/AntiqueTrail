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

| Kind   | Name                        | Meaning                                      |
| ------ | --------------------------- | -------------------------------------------- |
| Secret | `CLOUDFLARE_API_TOKEN`      | Least-privilege Pages deployment token       |
| Secret | `CLOUDFLARE_ACCOUNT_ID`     | Cloudflare account identifier                |
| Var    | `CLOUDFLARE_PAGES_PROJECT`  | Existing Direct Upload Pages project name    |
| Var    | `CLOUDFLARE_PAGES_BRANCH`   | Direct Upload production branch, `main`      |
| Var    | `CLOUDFLARE_PAGES_HOSTNAME` | Full HTTPS canonical shared-stage origin URL |

Do not configure these names at repository scope. Environment-scoped values
ensure that the reviewer gate is crossed before they are released to a job.
Missing or malformed configuration produces a successful no-op workflow with
a `Deployment blocked safely` summary; it never performs a provider call.

The token must allow only the selected account/project's Pages deployment and
deployment inspection operations. Record its identifier, custodian, version,
activation, rotation, and revocation receipt without recording its value.

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
coordinates, `mode=promotion`, and a content-free reason code. The fixed
`shared-alpha` GitHub environment must require human approval.

The workflow downloads the bundle from the specified prior workflow run,
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
with witnessed facts and content-free evidence references, then run:

```powershell
node scripts/h01-gate.mjs receipt `
  --evidence docs/operations/H01_GATE_EVIDENCE.json `
  --out-dir receipts
```

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
separate Product/Security signers, named Product Owner and Recovery Custodian
key holders, witnessed backup/decrypt/restore and rollback runs, current plan
and `$0` no-overage evidence, secret custody and rotation evidence, Access
coverage/denial checks, and the remaining registration journal/fence/provider
finality fixtures required by ADR 0005. If any cannot be supplied, retain the
`BLOCKED` receipt and keep the shared stage disabled.
