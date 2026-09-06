# ADR 0007 — Protected internal synthetic review

- Status: Accepted Product Owner decision; effective only after the amendment PR merges
- Date: 2026-09-06
- Decision owner: Product Owner
- Scope: owner-only internal product-reset assessment, not a release stage
- Supersedes: ADR0006's CI-only upload and H-01-before-any-shared-environment clauses only for the context defined here; all other release stages retain ADR0005/0006 and their gates

## Authorization and purpose

The presented directive was `update plan: authorize the protected internal synthetic review deployment described in DEPLOYMENT_DECISION.md, with no paid resources or public activation.` The Product Owner replied `yes approved and authorized`, explicitly approving that proposal. This records the actual confirmation rather than claiming the owner typed the proposed directive verbatim.

The purpose is to publish and verify a current, protected build before evaluating the application against expectations. A new deployment does not establish functional correctness, value, H-01 acceptance or public readiness.

## Bounded exception and retained controls

This context permits the Product Owner and the agents operating this authorized task to review synthetic data in a dedicated isolated backend. It admits no customers, external participants, other store owners or research cohort. Existing Shared Alpha, Private Beta, public, paid and expansion stages remain governed by their original gates.

For this context only, an independently reviewed exact commit with passing required repository checks may be built locally with locked dependencies and a pinned Vercel CLI, validated as Build Output v3 and uploaded with `vercel deploy --prebuilt` to a protected Preview. Record the actual local runtime; do not label it a CI build. Do not use `--prod`, create or assign production/custom domains, promote a Preview, enable automatic Git deployment, create a protection bypass or weaken authentication.

H-01 dual signatures, full shared-stage recovery certification, L-01 external-anchor certification and external-participant gates are not prerequisites for this separate owner-only context. They remain prerequisites for their original stages and cannot be marked passed using this assessment. No application receipt may be forged, no gate/signature validator bypassed and no server capability enabled contrary to its implemented authorization rules to make a test appear successful. A gated workflow stays blocked and is reported as such until a separately authorized implementation or genuine receipt permits it.

All security boundaries remain: server authorization, RLS/grants, role/store/account isolation, authentication and revocation, private-storage controls, callback privacy, secret exclusion, provider quotas and safe fixture handling. Registration and real email delivery remain disabled. Synthetic identities must use controlled test addresses without delivery. No real user data, copied existing Auth accounts, real store records, customer payment data, outreach, live Stripe calls, paid membership or commercial activation is permitted. Provider-backed versus stubbed results must be labeled separately; a demo catalog or review-harness login is never a provider pass.

## Provider, isolation and cost prerequisites

Before any new hosted resource or upload, establish that the actual plan permits the intended use, the operation is free under current account limits, and it cannot trigger an upgrade, trial conversion, add-on or overage. This decision does not approve paid resources, accept additional paid terms or override provider restrictions. In particular, do not assume that Vercel Hobby permits development of a commercial service merely because a Preview is private; obtain an applicable eligibility basis or report the blocker. Do not switch providers to evade this prerequisite.

Use a new isolated synthetic Supabase project only if the actual organization permits it within confirmed free resource limits. Record owner, project, region, creation outcome and identifiers without secrets. Inventory and reconcile an uncertain create response before retrying. Do not upgrade an organization or use paid branching. The existing beta project, six accounts and historical migration records remain untouched.

Build the isolated schema from the current committed migration chain and record applied versions and effective schema/configuration digests. Inventory effective grants, RLS, deployed functions, jobs and server stage/capability state. Only task-owned synthetic fixtures may be created; do not weaken production code to seed them. Configure browser inputs from this isolated project, validate the public anon/publishable role and exclude all private keys and server credentials. Use narrowly scoped server secrets only at the intended backend boundary and keep secret values out of documentation, logs and source.

The Supabase API is a separate reachable boundary from Vercel. Before browser review, verify unauthorized direct calls are denied, open signup is disabled and no real data is reachable. Vercel edge protection does not prove backend authorization. Existing credentials or provider modes cannot be copied into this environment without verifying their allowed purpose and isolation.

## Publication receipt and live verification

The content-free internal-review receipt must include:

1. Owner authorization reference, executor, UTC time, exact source SHA, lockfile digest, actual runtime/CLI versions, build configuration digest and exact file/artifact manifest.
2. Vercel owner/project/deployment ID and every generated, branch, alias and custom hostname associated with the new deployment; verify logged-out denial on each before commencing review. Failure blocks review and requires withdrawal of the new deployment or restoration of protection, never an unprotected fallback.
3. Isolated backend identity, migration versions, effective schema/configuration digests, function/job inventory, stage/capabilities and fixture namespace; list missing integrations explicitly.
4. Binding of the uploaded prebuilt bytes to the deployment, authenticated live entry/deep-link smoke, callback privacy headers and a real configured backend smoke where authorized. Unknown upload finality requires provider reconciliation by source/artifact identity before any retry.
5. Evidence class for each result: local, hosted CI, synthetic hosted, provider-backed, blocked or excluded. No H-01, SEC-01, human usability, restore or commercial pass is inferred.

Do not begin expectation testing on an older URL or substitute a local harness for the new verified baseline. If publication or backend parity remains blocked, continue independent source/research work and preserve the blocked status.

## Recovery, retention and termination

Before writes, record the existing environment as out of scope and define the new synthetic fixture manifest and reproducible rebuild steps. For this disposable context, losing only task-owned synthetic fixtures is acceptable if explicitly recorded; this is not satisfaction of public RPO/RTO or full DB/Auth/Storage restoration requirements. Preserve encrypted/private task evidence as needed and never publish tokens or account records.

The executor owns teardown; the Product Owner decides whether to continue the review. Authorization lasts for this product-reset review only. On completion or withdrawal, first revoke synthetic sessions and task credentials, disable the new deployment and verify all its hostnames are inaccessible, then remove task-created fixtures/resources according to the recorded ownership manifest. Preserve source/artifact identifiers and a content-free teardown receipt. Any resource with uncertain ownership or real data is not disposable and must not be deleted under this authority. An extension to real data, participants, spending, providers or public access requires a separate decision and applicable gates.

## Acceptance and consequences

The coordinated amendment and independent review must merge before execution. The required internal receipt and live checks are execution evidence, not generated by this document. Existing protected CI release workflows remain unchanged and fail closed; this exception does not provide fabricated H-01 input to them. Functional findings remain review-only until separately approved for repair.

The Product Owner may receive a complete disposition of reviewed and blocked items while deployment or human/provider prerequisites remain unresolved. Neither issue closure nor this exception promises a public release, a successful workflow or a cleared business case.


## Governed internal synthetic admission

[ADR 0008](0008-governed-internal-synthetic-admission.md) extends only the ADR0007 owner-only assessment with a genuine, short-lived internal authorization for allowlisted synthetic identities and owned fixtures on the named isolated backend. Its server validation, role/scope/assurance controls, expiry, revocation and teardown are mandatory. Existing release receipts and public/shared/paid activation gates retain their meaning; no invented release evidence, real delivery, external participants or spending is authorized. The coordinated amendment must merge before dependent implementation.
