# Public test publication preflight

Observed 2026-09-12 by publication task `01a0968f-bdaf-78a3-9e9a-858d93269ad4`. This is evidence and a proposed execution sequence, not a deployment or backend activation receipt.

## Authorized outcome and coordination

The owner requested a temporary public test address on free hosting, simple publishing and account entry, and a computer-use test while signed out. The assistant presented the bounded `update plan` scope (public test publishing, stable link without Vercel access, anonymous browsing and application accounts for private actions); the owner replied `yes make this happen. I want the link after you use computer use and test it in a unsigned in`. This preserves the actual confirmation rather than attributing the proposed words to the owner.

Orchestrator task `01a0922f-687f-7390-a9c7-4ac1df2a3361` owns the final source-ready SHA after #365 and #321. Do not publish this round before that handoff. The separate #365 plan amendment merged as `c3f74b4abce81376fabce62cf46f060e34051b6d`; it does not authorize hosting. Publication owns computer use and the final provider operation.

## Live frontend evidence

- Vercel CLI 50.25.5 is installed and authenticated as `samarquis4-1764`.
- Project: `scott-marquis-projects/antique-trail`, ID `prj_6WkHOQyyzALAHzlytLuYpWFgJ4FM`, team ID `team_0ID7Qo6jPN5UHz0eetnfnDIo`. Live dashboard identifies Hobby; Vite preset, Node 24.x.
- Existing Production deployment: `dpl_APyUxMJLAFJG5DNgFEXZo2SRM6n7`, READY, August 20 source `680681049df2c2b5495c8baa7064b091be414827`. This is not the current delivery round.
- Stable alias: `https://antique-trail.vercel.app/`. Other returned aliases: `antique-trail-scott-marquis-projects.vercel.app` and `antique-trail-git-main-scott-marquis-projects.vercel.app`.
- Signed-out in-app browser: direct `/stores` returned hosting `404 NOT_FOUND`; opening `/` started the client app and rendered 12 fictional stores. Browse-to-Blue-Finch-details and account-entry screens worked through client navigation. Account creation was not submitted and is not verified.
- The historical deployment inspect response has empty `vercelConfig`; current repository `vercel.json` contains the SPA fallback rewrite and callback privacy headers. The missing historical rewrite explains the fresh direct-route failure; deployment of the current routing configuration still needs live verification.
- Production environment names exist but `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are empty. Other inventoried application provider credentials are empty. A private ignored environment download was inspected without printing credentials. Do not commit or publish that file.
- GitHub `shared-alpha` has old Cloudflare credential/configuration names and no Vercel credential names. Its public Supabase URL names the old beta. Existing H-01 workflows target signed/protected shared-alpha and are not a generic public-test publish button.

## Live backend evidence

- Supabase CLI 2.115.0 lists one accessible project: `antique-trail-beta`, ref `uaupykgpegbseboklubv`, organization `slrsloizelnsfabjukbn` (Scott Marquis), region `us-east-2`, `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.155.
- Local application environment targets `http://127.0.0.1:54321`; local service success does not prove the hosted beta. The repository link and historical GitHub public URL point to beta but do not authorize its mutation.
- Remote migration history reaches `20260823150000`. It includes remote-only `20260823140000`, absent from the inspected current repository. Migrations from August 24 onward are not present remotely; calculate the exact pending set from the final source SHA before any apply.
- Remote functions list only `account-registration-cleanup` v15 and `public-catalog` v7, last updated in August. Their names/status are inventory, not proof of current source or acceptance.
- Read-only table statistics show an existing 12-store catalog, 7 role grants and approximately 26 active-session rows. These estimates do not establish ownership, disposability or the absence of private data. No rows, account identifiers or credentials were exported to this report.
- The retired assessment project `ykyrvqddgnfmgftjwpts` is not returned in the accessible project inventory. Its ADR0007/0008 scope cannot be reused.
- Backend choice is resolved: the owner delegated implementation choices and the orchestrator selected the existing beta, preserving data. No database, Auth configuration, function deployment, seeding or public capability mutation was performed.

## Required publication sequence

1. Merge the scoped public-test amendment with independent review: free-tier eligibility, exact public frontend, selected backend/data scope, admitted tester accounts, exposed capability inventory, expiry/stop owner, recovery and no-spend boundary. Retain all actual private-data and privileged authorization checks; do not fabricate old release receipts.
2. Prepare one repeatable publication path accepting an exact reviewed source SHA. Build from an isolated clean checkout with locked dependencies and only validated browser-public inputs. Include the current SPA rewrite/privacy headers; exclude local review harnesses and secrets. Retain the artifact digest and prior deployment for rollback.
3. Reconcile the selected beta's remote-only migration from trusted history, preserve existing data and inspect the complete pending migrations before forward-only apply. Never reset or mark unknown migrations applied. Verify schema compatibility, required functions/configuration and account admission through actual hosted requests.
4. Wait for the orchestrator's final source-ready SHA, then run the applicable source/configuration checks and publish the exact artifact. Bind the stable alias to that deployment and record source, artifact, frontend configuration, backend/schema/function identity and rollback coordinates without secrets.
5. Use computer use from a signed-out browser for `/`, direct `/stores`, reload, a direct store-details URL, Browse -> details -> back, and account entry. Verify an authorized real test account separately before claiming registration/sign-in/private saves work. A screen or local fixture does not supply that proof.
6. Return the stable tested URL, current source identity, backend service/target, actual passing paths and any excluded/unavailable paths. Do not call the August deployment the new publication.

## Open prerequisites

Scoped public-test amendment; free-tier eligibility/configuration receipt; final source-ready SHA; backend migration and account configuration; exact-output publication and signed-out deep-link verification. These are separate from already closed implementation tickets.

## Recovered migration-history evidence

Read-only migration fetch recovered `20260823140000_diag_probe_env.sql` verbatim and remote `20260823150000_drop_probe_env.sql`. The repository uses version `20260823150000` for `fix_bind_navigator_device_ambiguity`, so that matching version is a genuine content collision. Keep both originals in the private audit and require explicit forward-only reconciliation. At source c3f74b4a, 55 repository migrations are not present remotely. Initial byte differences in other overlapping files include fetch formatting and are not yet semantic-drift findings. No history was repaired or data modified.
