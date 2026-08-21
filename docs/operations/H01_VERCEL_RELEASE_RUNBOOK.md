# H-01 Vercel prebuilt deployment runbook

Status: selected replacement path under ADR 0006; implementation and provider activation are **NO-GO** until the repository workflow and every live preflight below are verified.

This runbook replaces `H01_PAGES_RELEASE_RUNBOOK.md` for new deployment work. It does not authorize a Vercel deployment, create a project, accept provider terms, approve spend, or pass H-01.

## 1. One-time provider preflight

Record redacted evidence for each item. A GitHub connection is not proof of any other item.

1. Confirm the exact Vercel owner/team, project ID, connected `samarquis/AntiqueTrail` repository, Production branch, plan, region behavior, and account roles.
2. Confirm the intended project use is allowed by the selected plan. Hobby is not acceptable when the intended use is commercial or eligibility is uncertain.
3. Disable automatic deployments for every branch with `git.deploymentEnabled: false` and prove a test push does not create a deployment.
4. Disable automatic assignment of custom Production domains. Do not attach a production domain during Shared Alpha.
5. Enable Vercel Authentication with Standard Protection and prove every intended Preview/generated/branch/alias URL denies a logged-out request. If any reachable hostname is unprotected, stop.
6. Inventory and disable Shareable Links, protection bypasses, exceptions, Analytics, Speed Insights, Functions, Storage, Marketplace add-ons, and other unapproved billable features.
7. Record the exact data sent to Vercel: compiled static assets and build/deployment metadata during upload, plus hostname, URL, IP/network, user-agent, request, and platform-log metadata during delivery. Record Vercel's processor/controller role, regions/transfers, subprocessor path, retention/deletion, and whether any URL can reveal a private identifier. No Supabase row, auth token, private note, or provider secret may enter a Vercel build or log.
8. Record current limits, retention, logs, legal/privacy terms, cancellation/export/replacement steps, and actual plan cost. For a paid plan, attach the separate Product Owner funding approval and hard monthly ceiling.
9. Create a dedicated CI Vercel access token with the minimum available personal/team scope and an expiry. Record the platform's lack of finer project/action scope as residual risk; record only scope, owner, creation/expiry, custodian, and rotation receipt—never the token value.
10. Define provider-call deadlines, bounded retry/backoff, idempotency lookup by source SHA/artifact digest, and response-loss reconciliation. An ambiguous upload or promotion must be resolved by querying the Vercel deployment state; never retry into an unknown second promotion.
11. Define outage behavior: no new promotion while Vercel or protection-state verification is unavailable; keep the last accepted deployment assigned when safe; use the status/incident path; never fail over to an unprotected hostname.
12. Restrict deployment observability to content-free identifiers/digests and redacted status/error classes. Prove tokens, environment values, private URLs, cookies, request payloads, and Supabase responses are absent from logs and receipts.
13. Execute contract fixtures for wrong/expired token, wrong owner/project, automatic-Git-deployment denial, duplicate prebuilt upload, timeout/response loss, invalid artifact digest, unprotected URL, protection bypass denial, failed promotion, and digest-matched rollback. Every unsafe or unknown result remains NO-GO.

## 2. Protected GitHub environment

Configure `shared-alpha` with required reviewers, prevent self-review, protected-branch rules, and no administrator bypass. Store:

| Kind | Name | Handling |
|---|---|---|
| Secret | `VERCEL_TOKEN` | Dedicated minimum-available-scope CI token; never printed or copied into evidence |
| Secret | `VERCEL_ORG_ID` | Environment-scoped provider owner/team identifier |
| Secret | `VERCEL_PROJECT_ID` | Environment-scoped project identifier |
| Secret | `H01_PASS_RECEIPT_BASE64` | Exact signed, unexpired PASS receipt for one deployment operation |
| Var | `VERCEL_SHARED_ALPHA_HOSTNAME` | Full HTTPS protected Preview origin |
| Vars | `H01_PRODUCT_SIGNER_*`, `H01_SECURITY_SIGNER_*`, `H01_REVOKED_SIGNER_FINGERPRINTS_JSON` | Public signer registry only; no private key |
| Vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser-visible Supabase URL and publishable/legacy anon key; never secret/service-role |
| Vars | `VITE_TRIP_OFFLINE_GRANT_KEY_ID`, `VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK` | Browser-visible public verification material only |
| Vars | `VITE_PARTNER_EMAIL_PROVIDER_ENABLED`, `VITE_PARTNER_MEDIA_PROVIDER_ENABLED`, `VITE_PARTNER_SYNTHETIC_ENABLED` | Exact lowercase `true` or `false` stage inputs |

Retire `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PAGES_*` after the replacement workflow passes and the abandoned-project record is retained. Do not delete them merely because this document changed.

## 3. Build and upload contract

The replacement protected workflow must use an exact reviewed Vercel CLI version and the following order:

1. fail closed on missing/unsafe configuration;
2. verify and consume the dual-signed H-01 nonce before provider access;
3. check out the exact accepted `main` SHA with persisted Git credentials disabled;
4. perform a locked install and run the required release suite;
5. obtain nonsecret Vercel project settings for Preview without logging values;
6. run `vercel build` to produce `.vercel/output`;
7. compute and verify the release manifest and artifact digest;
8. run `vercel deploy --prebuilt` for Preview and capture the exact deployment ID and URL;
9. prove logged-out denial on every reachable URL before authenticated smoke testing;
10. create and retain the digest-bound deployment receipt.

The retired Cloudflare workflows remain only as historical evidence. `.github/workflows/vercel-release-artifact.yml` and `.github/workflows/vercel-deploy-existing-artifact.yml` now implement this contract, and `H01_GATE_EVIDENCE.template.json`, `scripts/h01-gate.mjs`, and `scripts/release-artifact.mjs` encode `vercel_deployments_month` and `vercel-prebuilt-deploy`. Their guard tests pass under `node --test scripts/h01-gate.test.mjs scripts/release-artifact.test.mjs`.

## 4. Shared Alpha acceptance

H-01 remains NO-GO until the receipt also proves every provider-independent ADR 0005/0006 control: complete DB/Auth/Storage/config backup and isolated restore; RPO/RTO; deletion/revocation replay; registration fence and external journal; two-custodian encryption; Product/Security signatures; provider quotas and cost stops; cancellation/export; and rollback.

Shared Alpha uses protected Preview only. Registration stays `closed`; latch stays `draining`; optional providers remain off unless their gates pass. No Production deployment or production domain is allowed.

## 5. Regional Public promotion and rollback

After signed Package 10A, every Package 10B prerequisite gate, and the Product Owner's Package 10B pre-deployment authorization:

1. build a Production-targeted `.vercel/output` once with the exact accepted Production inputs;
2. deploy it as a staged Production deployment without assigning domains;
3. verify source/artifact/config/schema/capability digests and readiness smoke checks;
4. promote that existing staged deployment without rebuilding;
5. execute Package 10B's owned-domain HTTPS, public catalog behavior, private/privileged denial, capability, recovery, monitoring, cost, canary, and smoke checks;
6. issue and sign the final Package 10B deployment receipt only after those checks pass.

Rollback reassigns the last accepted Production deployment without rebuilding and repeats the compatibility, capability, and smoke checks. If the prior deployment cannot be identified or its digest cannot be proven, stop and use the incident runbook; do not rebuild a presumed rollback candidate.
