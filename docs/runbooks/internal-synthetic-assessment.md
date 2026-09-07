# Internal synthetic catalog assessment operator runbook

Authority: ADR0008; implementation issue #229. This first slice admits only session registration/status/revocation, mandatory actor-bound account-status hydration and catalog list/details. It does not enable trip, owner, administrator, export, offline, media, routing, email or billing operations. No ordinary release receipt is issued or changed.

## Prepare the candidate and resource manifest

1. Require merged exact-head independent authorization review and passing required web, database and governance checks. Preserve source SHA, migration list and Edge bundle source.
2. Use only task-owned Supabase project `ykyrvqddgnfmgftjwpts`; verify the CLI link, Management API project identity and API hostname all agree. Stop on any discrepancy. Never use beta project `uaupykgpegbseboklubv`.
3. Apply the forward migration with the trusted database operator; deploy the updated `public-catalog` function with JWT verification enabled. The migration alone issues no authorization and installs no pre-request hook.
4. Build the merged source using this project's public configuration, with external/provider capabilities off. Produce a sorted artifact manifest and SHA256. Upload only as a protected prebuilt Vercel Preview. Verify the actual Vercel project, READY deployment ID, exact generated origin, absence of production aliases, logged-out SSO denial, logged-in entry and a served asset digest. Record these independently observed values, not values submitted by a browser.
5. Record a SHA256 configuration manifest covering backend identity, schema/version, Edge source, provider exclusion flags, Auth configuration, exact origin and host protection. Do not include credentials. Configure `PUBLIC_APP_ORIGIN` to that exact origin, without wildcard or trailing slash. The Edge gateway forwards only its validated configured origin. Keep its constrained gateway JWT private; do not substitute service_role.
6. Keep signup disabled. Enable only the Auth password sign-in mechanism needed by operator-created identities; leave SMTP/email delivery, invites, recovery and external providers disabled. If provider configuration cannot support no-delivery password login, stop that activation and record it blocked.
7. Before creation, privately record planned aliases, controlled `.invalid` addresses, roles, owned seed IDs and cleanup intent. Create at most shopper-a, shopper-b and revoked-a with the server-only Auth admin createUser API and `email_confirm: true`; never use invite or signUp. Generate random passwords and protect them in the task's private credential store, never Markdown/logs. Reconcile existing exact addresses/UUIDs before retrying; a conflict or unexpected account stops provisioning rather than adopting it.
8. Append actual provider UUIDs, creation/expiry times and negative-test relationships to the private fixture manifest before admission. Insert immutable identity markers, matching active profiles and shopper-only grants through the trusted database operator. No representative/admin grant or admission receipt from another stage is permitted. Seed only the twelve fixed IDs 1001–1012 and their referenced synthetic children from the pinned seed; verify zero unowned rows before/after. Do not run an arbitrary latest seed or import old beta data.

## Activate once, for at most 24 hours

The trusted SQL operator is the sole writer of `internal_review_private.runtime_binding`, identities and authorizations. Browser and service API roles have no such privilege. These commands require a private reviewed operator script populated from the independently verified receipt and private manifest; do not paste secrets into dashboard query history.

- Inspect `pg_roles.rolconfig` for authenticator before installation. Preserve any existing hook; do not overwrite another pre-request function. On this isolated project only, when no conflicting hook exists, set `pgrst.db_pre_request` to `app_public.internal_review_pre_request`, then `NOTIFY pgrst, 'reload config'`. Verify live REST requests actually invoke it; presence in role configuration alone is not transport proof.
- Insert singleton runtime binding with actual backend, source SHA, artifact/configuration digests, deployment ID/origin, verified_at and monotonically increasing version. Keep prior verified records in the private evidence ledger. A new build requires an independently verified replacement and a new authorization, not editing the old authorization.
- Insert the complete typed authorization with the owner decision reference, task ID, exact runtime fields, private fixture manifest digest, exact admitted UUID array and only `['catalog','session']` (including the required read-only `account_lifecycle_status` hydration). Issue time is now; expiry is no later than 24 hours. There is no scheduled/automatic renewal. Record receipt ID privately and secret-safe timing/digests in the evidence report.
- Confirm all ordinary stage/private/public/paid receipts and capability flags are unchanged. Assert unknown identities, unknown paths and foreign origins are denied before opening the test session.

## Hosted acceptance evidence

Use the real protected browser and provider password session. Record source/artifact/config/schema, actor alias, route, expected/actual behavior and evidence path without credentials or JWTs.

- Exact admitted shopper registers its provider session; registered expiry is bounded by internal expiry. List/search/filter/details return only the twelve owned seed IDs; a foreign slug returns no data.
- Anonymous, unlisted UUID, sibling session, missing record, stale configuration, wrong origin, unknown RPC, map, cancellation-only, export/offline/owner/admin/storage paths fail closed. Capture actual HTTP/RPC outcomes; SQL simulations alone are not hosted proof.
- Revoke revoked-a's separate receipt while its JWT remains valid. A new session/private request must fail; queued cleanup and session revocation must be visible. Never revoke another persona's receipt incidentally.
- Record unavailable provider-dependent flows as blocked. Catalog success is not a full-site or production pass.

## Revocation and retryable teardown

Call `internal_review_private.revoke_authorization(receipt_id, reason)` as the trusted operator. It is idempotent, irreversibly revokes that record, advances its cleanup deadline and revokes its marked active/cancellation-only sessions. Expiry independently denies access and has already queued cleanup, so a failed cleanup worker cannot reopen access.

The current task owns processing due rows; no background worker or automatic renewal is installed. For each due receipt, compare its UUIDs and manifest to actual records, revoke provider sessions, remove only manifest-owned dependent fixtures using supported forward lifecycle order, and then delete the exact Auth users. Treat already-absent resources as complete; unexpected dependencies remain a recorded cleanup failure. Keep the immutable identity tombstones and authorization audit, which contain no passwords/JWTs and prevent ordinary-access fallback. Mark cleanup completed only after all listed resources are proved removed. Do not truncate tables, reset a database, delete unowned records or mark cleanup complete on errors.

At assessment end, revoke every task receipt, finish owned cleanup, withdraw only the task-created Preview(s), and remove only the task-created isolated backend if required by ADR0007. Preserve secret-safe evidence and verify old beta remains untouched. A missing binding never restores ordinary access to marked internal identities. Unresolved cleanup is reported explicitly and retried by this task.
