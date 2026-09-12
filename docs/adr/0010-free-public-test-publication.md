# ADR 0010 — Free public test publication

- Status: Product Owner authorized; effective after #369's dedicated amendment is independently reviewed and merged. Not a deployment receipt.
- Date: 2026-09-12.
- Scope: the bounded public test in [PRD](../../PRD.md#public-test-publication), using the existing Vercel frontend and preserved Supabase beta.
- Supersedes: ADR0006's protected-edge/CI-only publication requirement and ADR0009's local-only showcase boundary only for this named test. Other release, real-store, billing and deferred-feature stages retain their requirements. ADR0007/0008 are not renewed.

## Authorization

The owner requested a free public test address, easy publishing/account entry, and computer-use verification while signed out. The assistant presented `update plan` for that bounded scope; the owner replied `yes make this happen. I want the link after you use computer use and test it in a unsigned in`. The later direction `Again i am giving you my requirements and you are going to make it work` delegated implementation choices. The coordinating task selected the verified `antique-trail-beta` target with preservation of existing data and no spending. This records the actual confirmations, not a claim the owner typed the proposal verbatim.

## Provider and resource boundary

Use Vercel project `prj_6WkHOQyyzALAHzlytLuYpWFgJ4FM`, team `team_0ID7Qo6jPN5UHz0eetnfnDIo`, named `scott-marquis-projects/antique-trail`. The stable entry is `https://antique-trail.vercel.app/`. Anonymous visitors reach the allowed fictional catalog without a Vercel account, access approval or secret bypass URL. Preview/generated addresses may remain protected. Inventory their state; do not disable project-wide protection merely to publish the stable domain.

The backend is existing Supabase project `uaupykgpegbseboklubv`, `antique-trail-beta`, organization `slrsloizelnsfabjukbn`, region `us-east-2`. Preserve historical Auth identities, role/session records, private data, schemas, Storage, migration history and retention/deletion duties. The retired assessment project and unrelated resources are excluded. Verify schema/account/function configuration against the final source; a healthy project badge is insufficient.

Use existing free plans only. Before publication record current eligibility and hard limits for this non-revenue fictional test. No sales, payments, purchased domains, upgrades, paid trials/add-ons or overage. If actual Vercel terms do not permit this use on Hobby, stop that operation and prepare an eligible free alternative with an exact-resource amendment; a Hobby badge alone proves no eligibility. Supabase Auth/PostgreSQL remains the account/data system.

## Publication and migration contract

The existing H-01 workflows keep their original meaning and fail-closed behavior. This test may use a pinned CLI and local prebuilt artifact from an isolated clean checkout of the final reviewed source, after applicable repository checks and independent review. Keep automatic Git deployments disabled. A simple publish command or manual workflow accepts an explicit reviewed source SHA and backend target; it does not publish every push. Require matching target identity, complete public inputs and current acceptance before upload.

Build with locked dependencies and public browser inputs only: the selected Supabase URL and publishable/anon key plus approved nonsecret capability values. Reject service-role/secret keys, loopback/placeholder/empty targets and production inclusion of the local review harness. Privileged credentials belong only in protected operator/appropriate Supabase service environments, never frontend output, public evidence or VITE variables. Preserve callback no-store/no-referrer headers and SPA fallback for root, direct routes and refresh. A public frontend is no substitute for a configured account backend.

Recover remote-only migration statements from trusted server history into a private audit. Compare version AND content with source, review the full pending set for data impact, and establish a recoverable pre-change database/Auth/Storage/configuration inventory appropriate to affected data. Apply forward-only reviewed corrections. Never reset, overwrite beta with a seed, fabricate historical SQL, silently relabel history or mark missing code applied. A version collision needs preserved-history mapping and a new corrective migration where current behavior is absent. Destructive changes or uncertain ownership block that operation until resolved; an unrelated clean local database is not beta recovery proof.

After the coordinating task supplies the final source-ready SHA, build once, compute source/configuration/artifact digests, publish the exact prebuilt output and bind the stable domain. Record prior deployment/alias assignment for rollback. Reconcile ambiguous provider responses by exact source/artifact identity before retrying. Backend changes require exact migration/function/configuration receipts and affected hosted allow/deny checks before activation. No fabricated H-01, Regional, pilot or internal-assessment receipt is permitted.

## Evidence, lifetime and recovery

[Public-test security](../../SECURITY_AND_TRUST.md#public-test-boundary) and [execution](../../PACKAGE_CONTRACTS.md#public-test-execution-contract) control admitted accounts, private operations and direct-server denials. The receipt names source/artifact/config/schema/function identities, exposed capabilities, preserved-data inventory, applicable checks, authorization, issue/PR references, exact origins and rollback/stop procedure. Operator: publication task `01a0968f-bdaf-78a3-9e9a-858d93269ad4`; decision/support owner: Scott Marquis. Record an explicit end time before activation, at most 30 days after first publication, without automatic renewal. Expiry/stop denies new test-only private admission/operations and withdraws the test publication. Preserve existing data and necessary lifecycle access; do not delete beta as teardown.

Completion requires signed-out computer-use proof of root, direct `/stores`, reload, direct store details, Browse -> details -> back and account entry. Verify an authorized test account's actual Auth/session/private-save/sign-out behavior separately. Email delivery, verification, provider mutations and human usability are independent evidence; a fixture or screen cannot pass them. Return the stable tested URL, deployed source, actual backend and limitations. The August 20 deployment is not current-round publication.

Rollback disables new unsafe test activity, then reassigns a retained compatible frontend without rebuilding. Do not undo forward migrations or restore revoked credentials. If the old frontend is incompatible with updated schema, use the documented maintenance/stop state. Preserve evidence and existing-account data; remove only proven task-owned disposable records through their normal cleanup contract.
