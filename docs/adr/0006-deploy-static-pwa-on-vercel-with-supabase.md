# ADR 0006 — Deploy the static PWA on Vercel with Supabase

- Status: Accepted deployment-provider decision; no Vercel environment or release is accepted until H-01 passes
- Date: 2026-08-20
- Decision owner: Product Owner
- Applies to: Shared Synthetic Alpha through Regional Public MVP
- Supersedes: ADR 0005 only where it selects Cloudflare Pages, Cloudflare Access, Direct Upload/Wrangler, or Cloudflare frontend quotas. ADR 0005 remains controlling for Supabase, recovery, startup cost, media-transition, and service-gate requirements unless this ADR says otherwise.

## Context

The Product Owner selected Vercel instead of Cloudflare Pages and reports that the GitHub repository is connected in Vercel. That connection is useful discovery evidence, but it is not an H-01 receipt and does not authorize a deployment.

Current Vercel behavior was rechecked on 2026-08-20:

- [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github) creates deployments from repository pushes by default. A connected repository therefore needs an explicit release boundary before it can satisfy Antique Trail's protected-promotion contract.
- [`git.deploymentEnabled`](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments) can disable Vercel's automatic Git deployments while preserving the GitHub connection.
- Vercel supports a CI-built [prebuilt deployment](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel) by generating `.vercel/output` with `vercel build` and uploading that output with `vercel deploy --prebuilt`.
- A staged production deployment can be created without assigning production domains and later promoted without rebuilding. See [staged production promotion](https://vercel.com/docs/deployments/promoting-a-deployment#staging-and-promoting-a-production-deployment).
- [Standard Deployment Protection](https://vercel.com/docs/deployment-protection#standard-protection) is available on all plans, but it excludes production domains. Protecting every production URL requires All Deployments protection on an eligible paid configuration. Shared Alpha may not use an unprotected production domain.
- [Hobby is restricted to personal, non-commercial use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage). Pro currently has a recurring platform fee and metered usage. Neither commercial eligibility nor spend is inferred from a GitHub connection.
- [Vercel access tokens](https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token) are scoped at the personal-account or team level. H-01 must record that broader-than-project credential boundary instead of claiming project/action least privilege.

Provider terms, features, and prices can change. H-01 must preserve a dated provider receipt immediately before activation or promotion.

## Decision

### Architecture and provider boundary

Vercel replaces Cloudflare Pages as the frontend deployment provider. The application remains one static React/TypeScript/Vite PWA. Privileged operations, authentication, data, Storage, scheduled jobs, and provider gateways remain in Supabase; Vercel Functions, Vercel Storage, Analytics, Speed Insights, and other Vercel add-ons are disabled unless a later ADR and named gate authorize them.

The existing Vercel GitHub connection is retained for source association and deployment metadata, but automatic Git deployments must be disabled with `git.deploymentEnabled: false` before the connection is accepted. Only protected GitHub Actions may build and upload a release candidate.

### Build-once and promotion contract

Protected CI must:

1. check out the exact accepted commit and locked dependencies;
2. validate browser-visible configuration and reject secret/service-role keys;
3. run the required release checks;
4. run a version-pinned Vercel CLI build to produce `.vercel/output`;
5. record deterministic source, lockfile, build-environment, file-manifest, and artifact digests;
6. upload that exact output with `vercel deploy --prebuilt` without a provider rebuild;
7. bind the Vercel project, deployment ID/URL, Git commit, artifact digest, protection result, and smoke result into the deployment receipt.

For Shared Synthetic Alpha, deploy only to a protected Preview deployment. Do not create or assign a production domain. A logged-out request to every generated, branch, alias, and custom hostname must be denied before H-01 can pass.

For Regional Public readiness, create a staged Production deployment with automatic custom-domain assignment disabled. Promotion may assign the already-tested Production deployment to the owned public domains only after Package 10B's signed authorization. Do not promote Preview to Production because Vercel documents that doing so rebuilds with Production variables.

Rollback must reassign the prior accepted Production deployment without rebuilding, then prove the expected source and artifact digests, public smoke checks, server capability state, and database/schema/config compatibility. The rollback receipt records the prior and replacement deployment IDs and domain assignment.

### Access boundary

Shared Alpha and private readiness remain deny-by-default at the hosting edge in addition to application authorization. Standard Vercel Authentication may be accepted only when every reachable hostname is demonstrably protected. Because Standard Protection excludes production domains, no production deployment or production domain may exist for Shared Alpha on that configuration.

If any generated or custom URL cannot be protected under the selected plan, the remote shared stage stays disabled. Shareable links, protection bypass secrets, public aliases, branch domains, and protection exceptions are forbidden unless separately inventoried, time-bounded, and proven not to bypass the cohort boundary. Private Beta participant access requires a separately approved enrollment and expiry design; Vercel team membership is not an Antique Trail account or authorization role.

### Plan, eligibility, and cost

The startup `$0` rule still applies until a separate Product Owner funding approval. H-01 must identify the actual Vercel owner/team/project and plan, verify that the intended use complies with the plan terms, and prove that no payment method, paid add-on, automatic upgrade, or on-demand charge can be invoked by the startup deployment.

If Hobby eligibility cannot be affirmatively established, or if required protection is unavailable on Hobby, Vercel activation is blocked until the Product Owner approves Pro or another eligible plan with a monthly ceiling and spend controls. Pro's platform fee, seats, add-ons, and metered spend all count toward that ceiling. Spend Management must be configured to pause projects at the approved metered-spend threshold; notifications alone are insufficient. A paid plan does not waive the independent 15-minute recovery requirement for Regional Public MVP.

### Provider operations and privacy contract

The H-01 evidence must inventory compiled static assets and build/deployment metadata sent during upload, and hostname, URL, IP/network, user-agent, request, and platform-log metadata processed during delivery. It records Vercel's processor/controller role, regions/transfers, subprocessors, retention/deletion, account cancellation/export, legal review, and replacement path. Application private data, Supabase secret/service-role credentials, and private Supabase responses do not belong in Vercel build inputs, logs, Analytics, or receipts; the explicitly inventoried browser-visible URL and publishable/legacy anon key remain allowed public build inputs.

Every Vercel CLI/API operation has a bounded deadline, retry/backoff rule, and an idempotency/reconciliation key derived from source SHA plus artifact digest. After timeout or response loss, CI queries the selected project for an exact matching deployment before retrying; unknown finality blocks promotion. An outage preserves the last accepted assignment when safe, blocks new promotion, invokes the status/incident path, and never falls back to an unprotected hostname.

Observability is limited to content-free project/deployment identifiers, digests, timestamps, protection result, and redacted status/error classes. Executable contract tests cover wrong/expired credential, wrong owner/project, automatic-Git-deployment denial, duplicate upload, response loss, digest mismatch, every-host protection, bypass denial, failed promotion, and digest-matched rollback.

### Required protected configuration

The GitHub `shared-alpha` environment must eventually contain only the minimum deployment credentials and public build inputs:

| Kind | Name | Purpose |
|---|---|---|
| Secret | `VERCEL_TOKEN` | Dedicated CI token with the minimum available personal/team scope, expiry, and rotation; current Vercel token scope is not assumed to be project/action granular |
| Secret | `VERCEL_ORG_ID` | Provider account/team identifier; kept environment-scoped with the token |
| Secret | `VERCEL_PROJECT_ID` | Selected Vercel project identifier; kept environment-scoped with the token |
| Var | `VERCEL_SHARED_ALPHA_HOSTNAME` | Expected protected Preview origin after first accepted deployment |
| Vars | existing `VITE_*` public inputs | Browser-visible build configuration defined by the H-01 runbook |

No value belongs in documentation, source, workflow output, or evidence. Cloudflare credentials and project variables are retired inputs. Remove them from `shared-alpha` only after the Vercel replacement is implemented, verified, and a rollback/export record for the abandoned Cloudflare project is retained.

## Consequences and acceptance

- The current Cloudflare build/deploy workflows and H-01 Pages runbook are retired and must not be used for a new deployment.
- The H-01 receipt operation becomes `vercel-prebuilt-deploy`; provider evidence names Vercel deployment IDs/URLs and Deployment Protection results.
- Existing Cloudflare evidence remains historical NO-GO evidence and must not be rewritten as Vercel proof.
- The GitHub connection, installed Vercel plugin, successful CI, or a Vercel build by itself does not pass H-01.
- No site is public under this decision. Shared activation still requires every H-01 recovery, cost, signer, quota, access, rollback, and Supabase proof; public release still requires Packages 1–10B and every dependent gate.

## Rejected alternatives

- Continue Cloudflare Pages: rejected by Product Owner direction.
- Allow Vercel's default Git auto-deployments: rejected because a push could create an unreviewed or unprotected deployment outside the signed gate.
- Promote a Preview deployment to Production: rejected because Vercel performs a new Production build, breaking the tested-artifact identity.
- Treat Hobby as automatically eligible or sufficient: rejected because plan-use eligibility and production-domain protection are separate unresolved facts.
- Put Supabase secret/service-role credentials in `VITE_*`: rejected because all `VITE_*` values are browser-visible.
