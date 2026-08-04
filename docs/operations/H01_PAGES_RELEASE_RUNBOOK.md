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
