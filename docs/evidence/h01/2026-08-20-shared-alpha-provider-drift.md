# H-01 Shared Alpha provider-drift record — 2026-08-20

Gate: H-01 Hosting, recovery, access, and cost

Environment: `shared_alpha`

Decision: **NO-GO**

Observation window: 2026-08-20T03:45:27Z–2026-08-20T03:55:16Z

Supersedes: the hosted-function, GitHub-environment, and Cloudflare observations
in `2026-08-20-shared-alpha-preactivation.md`; its source, CI, review, security,
and missing-evidence history remains applicable.

This is a content-free provider-drift record, not an H-01 PASS receipt. The
earlier record required a repeat after any Edge Function deployment. Hosted
function versions changed, so this record captures the resulting state without
authorizing a build, deployment, shared-stage activation, or capability change.
Secret values, user data, billing data, and provider credentials are
intentionally absent.

## Source and verification

| Field                     | Observed value                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Source                    | `5acda1a56bfa5be3ef6b123093c3a59e3a9a8009` (`main`)                                                 |
| Post-merge CI             | <https://github.com/samarquis/AntiqueTrail/actions/runs/32329318791> — web and database jobs passed |
| Web job                   | 143 browser checks passed; 11 skipped                                                               |
| Prior catalog boundary CI | <https://github.com/samarquis/AntiqueTrail/actions/runs/32328029174> — web and database jobs passed |

## Hosted Supabase drift

The hosted project reported these active functions:

| Function                       | Hosted version | Provider update time |
| ------------------------------ | -------------- | -------------------- |
| `account-registration-cleanup` | 12             | 2026-08-20T03:45:27Z |
| `public-catalog`               | 2              | 2026-08-20T03:31:43Z |

The earlier observation recorded `account-registration-cleanup` v10 and
`public-catalog` v1. This record does not infer who or what produced either
version increment. Exact deployed-bundle provenance and digest evidence is
missing and must be reconciled before H-01 can pass.

The hosted secret-name inventory still contains only the platform-managed
Supabase identifiers plus these application-owned identifiers:

- `PUBLIC_APP_ORIGIN`
- `PUBLIC_CATALOG_RATE_SALT`

`PUBLIC_CATALOG_GATEWAY_JWT` remains absent. An exact-origin catalog request
returned HTTP 503 with the neutral body
`{"error":{"code":"GATEWAY_UNAVAILABLE"}}`. No catalog row, identity fact,
stage fact, credential fact, or internal error was returned. No stage or
capability activation was performed.

## GitHub deployment protection

The `shared-alpha` environment reported:

- protected-branch-only deployment;
- required reviewer `samarquis`;
- self-review prevention enabled; and
- administrator bypass disabled.

The configured browser-visible build identifiers are the Supabase URL and anon
key plus the three partner-provider flags. The two Cloudflare secret names are
present. The trip offline-grant identifiers, H-01 receipt, Product/Security
signer registry, quota-actuator configuration, and other required provider and
human evidence remain absent.

## Cloudflare cost and Access conflict

The authenticated Cloudflare Zero Trust flow showed that the account has not
completed Zero Trust plan activation. Selecting the nominal `$0 / seat / month`
Free plan opened a checkout that required:

- billing identity and address;
- acceptance of Cloudflare terms; and
- authorization for charges when usage exceeds free limits.

No billing data was entered, no terms or charge authorization was accepted,
and plan activation was not submitted. ADR 0005 forbids an automatic upgrade,
paid-overage acceptance, or billable add-on during Startup Free Stage. The
checkout therefore cannot be completed under the current approved `$0` and
no-overage contract. H-01 requires a Product Owner cost-ceiling decision and a
provider configuration or independently verified control that enforces it.

At the end of the observation window, unauthenticated requests still returned
HTTP 522 for:

- `https://antique-trail-pages.pages.dev/`
- `https://antique-trail-pages.pages.dev/stores`
- `https://antique-trail-pages.pages.dev/manifest.webmanifest`

The responses prove neither availability nor deny-by-default Access coverage.
No Pages artifact deployment was attempted.

## Required next evidence

H-01 remains NO-GO until every requirement in ADR 0005 and the H-01 runbook is
proved. Immediate provider/human prerequisites are:

1. Product Owner approval of the topology, enforceable monthly cost/no-overage
   ceiling, public-stage recovery approach, and named custodians.
2. Cloudflare evidence that plan/Access activation cannot create unapproved
   usage charges, followed by deny-by-default coverage for canonical, preview,
   and unique deployment hostnames.
3. Reconciliation of each hosted function version to an exact source commit,
   immutable bundle digest, deployer, and deployment time.
4. A safely issued constrained `PUBLIC_CATALOG_GATEWAY_JWT` and hosted
   allow/deny/revocation proof without using a service-role key as a substitute.
5. Every recovery, journal, fence, quota, rollback, two-custodian, dual-signer,
   provider, operational, package-order, and final 10B item already enumerated
   in `2026-08-20-shared-alpha-preactivation.md`.

## Invalidation triggers

Repeat this observation after any migration, Edge Function deployment, signing
key or API-key change, secret rotation/revocation, stage/config/latch change,
GitHub environment-policy change, Supabase or Cloudflare plan/configuration
change, checkout completion, or contradictory provider evidence. This record
expires no later than 2026-08-27T03:55:16Z and does not become PASS merely
because it has not yet expired.
