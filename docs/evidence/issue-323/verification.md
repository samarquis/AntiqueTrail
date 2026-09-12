# Issue #323 verification

Candidate at initial evidence capture: `61d9a675c0daf7fe08723f8681c29f76a76c978e`
Base: `cf1f78dccceeb9bdb9832a755c32b5868200dd9a`
Evidence class: real-local browser diagnostic (not hosted, provider, production, or human evidence).

## Repository checks

- `npm ci`: PASS; 604 packages installed.
- `npm run typecheck`: PASS.
- `npm run format`: PASS.
- `git diff --check`: PASS.
- `npm run lint`: PASS with 13 existing Fast Refresh warnings and no errors.
- `npm run test`: FAIL/INCOMPLETE. Five unrelated component-test failures were observed in candidate extraction and partner-admin components before the run was stopped; no #323 acceptance result is claimed.

## Frozen real-local attempts

1. Run-owned project `probe-6d2d1ebe434c47d98e9fe840`: migrations and seed progressed, then the pinned Supabase CLI stopped at `LegacyHealthCheckTimeoutError` because the run-owned Storage container was unhealthy. Cleanup: `removed`.
2. Run-owned project `probe-9e653e1c0f6b4d1cbbeaa363`: local services started, then Auth MFA enrollment returned redacted `HTTP 400` while establishing Administrator assurance. No browser acceptance case ran. Cleanup: `removed`.

The preserved local artifacts contain no published credentials or bearer traces. These failures leave the required desktop/phone, Auth/MFA, exact-scope, independent readback, stale/replay, and cleanup acceptance unproved; they are not converted into PASS.

## Scope-specific review note

The browser suite captures the authenticated Administrator bearer used for the scope read and attempts `shopper_list_saved` with that token. The server denial is required, so a UI absence alone cannot satisfy the shopper-private criterion. The suite retains separate desktop and phone Administrator identities and does not alter the privileged rate limit.

## Post-repair run

Candidate `2512d41c692178e3760820d1673124a4b805a519` confirmed local fixture emails and reached the browser suite. The authenticated Administrator shopper-private denial assertion failed because `shopper_list_saved` resolved `[]` instead of denying; this is preserved as an application-boundary finding. The sibling readback also initially failed because the test queried the target subject for both stores; candidate `8247a5d406a9ce8090977d1260f76f8d917c9be2` corrects that diagnostic-only query. A fresh run is required for this changed executable head; no pass is claimed.

## Final focused run disposition

Candidate `127d083a30199a9a7985992b12f5aea6aaee3568` reached the browser suite with healthy local services. The populated shopper browser positive control passed, and the authenticated Administrator shopper-private RPC was denied with `HTTP 403 42501 shopper_private_access_denied`. All three desktop scope, stale/replay, and assurance scenarios passed. Phone scenarios were blocked after the shared desktop project consumed the intentional 10-per-exact-target/hour privileged-operation budget; no rate-limit control was weakened. Fresh per-project service/target isolation is required before claiming complete desktop-and-phone acceptance.

The limiter contract in `supabase/migrations/20260822050000_package_7_contract_prerequisites.sql` keys one window by both `actor_user_id` and `target_id`, allowing 30 operations per actor/hour but only 10 per exact target/hour. The desktop and phone projects currently share target store `00000000-0000-4000-8000-000000001001`, so separate Administrator identities do not isolate the target budget. The suite must isolate the target fixture or run-owned service per viewport; increasing or bypassing the limit would violate the contract.

## Current diagnostic checkpoint

The fixture was subsequently isolated with fresh Auth identities, separate desktop/phone Administrator grants, a populated shopper positive control, and viewport-specific target stores. The latest local browser attempts at `34ca6f3f` still fail at the Auth/MFA transition: the UI remains on `Verify your sign-in` and reports `We couldn't verify that code. Try again.` after the setup REST flow successfully enrolled and verified the run-owned factors. The retry was limited to the current code and one fresh code after the next TOTP boundary; it did not resolve the failure. This is an unresolved Auth-factor/session mismatch, not a scope authorization PASS, and no closure is claimed.

On hosted run `34659498734` at `7c9dd254`, the web check failed lint because the newly added sanitized MFA response capture had an empty `catch` block (`no-empty`, `e2e/configured-admin-scope.spec.ts:139`). It now records a non-sensitive `body_unavailable` diagnostic field. The database job on that same run failed before assertions because pulling `public.ecr.aws/supabase/pg_prove:3.36` returned `toomanyrequests` (exit 125); this remains registry infrastructure throttling, not a pgTAP result.

## Auth-only root-cause diagnosis

At `ee49fce7`, the browser MFA verify request returned HTTP 200. The subsequent application session registration failed with `admission_required`. Source confirms `app_public.register_current_session` requires an active global `shopper` role grant; the attempted store-scoped fixture grant was rejected by `role_grants_store_scope` and removed. This proves the Admin-only fixture cannot complete the application's ordinary session-registration path. It does not, by itself, prove a product authorization defect or that an Administrator may not hold a separate shopper role.

The cited requirements are [SECURITY_AND_TRUST.md — Administrator review and Access & Safety security](../../../SECURITY_AND_TRUST.md), which says the Administrator Test Account uses “no shopper-private access,” and specifically that Representative and Administrator Test Accounts “cannot read or modify either Test User's shopper-private data.” The [Administrator experience ADR](../../../docs/adr/0001-split-store-representative-publishing-by-field-risk.md) also says Administrators “never access shopper-private data.” The role table/constraints do not explicitly prohibit role coexistence. The shopper-private RPC predicate requires a global shopper role, while `shopper_list_saved` filters rows to `app_public.request_user_id()`. Therefore the current evidence does not establish cross-user data access by a dual-role account. It does establish that Admin-only session registration fails. This separate admission-path defect is tracked as [issue #351](https://github.com/samarquis/AntiqueTrail/issues/351), as #323 directs for newly reproduced application failures. No application authorization was changed. #323 remains open pending the separate repair, fresh exact-head desktop/phone and wrong-readback diagnostics, independent review, and hosted checks.

## Independent review checkpoint

Independent reviewer Pasteur reviewed `afeae86b188bfb19fdb26ce697af96c91ea89795` against `origin/main` `63cb8faee84eb225f3baeaa696edc899dac33b2d`. Review confirms the MFA-200 then `admission_required` diagnosis from the code path, and that current requirements do not establish role exclusivity or cross-user disclosure from an empty own-user result. It identified a separate phone fixture gap: phone scenarios operate on the sibling Representative, but only the desktop subject had a verified real Auth MFA factor, while regrant checks provider MFA for the target. The runner now provisions and verifies a run-owned factor for the sibling. This executable change invalidates that review for the new candidate; fresh full desktop/phone, wrong-readback and independent review evidence are still required. Recommendation on the reviewed SHA was do not merge.

## Prerequisite repair and integrated acceptance

Issue #351 was repaired separately in PR #352 and merged as `294dc4c2cd9e972ac8333246d7f2b206f186f57a`; GitHub now reports issue #351 CLOSED. The repair admits normal session registration for an active global Administrator or shopper while retaining provider/session binding, active profile, expiry, revocation/epoch and privileged MFA boundaries. Shopper-private RPC role gates were not relaxed. PR #352's hosted database, web, configured-seed-media, and plan-governance checks passed, and an exact-head independent review found no security findings.

The integrated acceptance checkout combined the exact PR #333 source head `655df817e36bfafaae7c20f98c9ac1ac5e479026` and the exact pre-merge PR #352 source head `bbfa31336e669a702a8030d422cbe667b2258406` at `021dea127c2b42b109d1b093550e67a14abf3805`. Its tracked source tree matches the current #323 candidate plus the merged #351 repair. Real-local configured Auth/browser run `9b2ae4ee-668e-45e7-b57b-01a028a30c7b`: PASS, six expected desktop/phone scenarios, zero skipped/unexpected/flaky; actual Auth MFA challenge and verification returned HTTP 200 for both identities; cleanup `removed`. Coverage included denial of populated other-user shopper-private reads, preview/cancel/exact revoke/regrant with independent audited readback, and stale replay/missing-assurance fail-closed behavior with scoped-record and focus preservation.

Negative-control run `90a94301-a56e-4b1c-84de-637a694ce0a2` deliberately corrupted the independent readback. It failed at the intended exact readback assertion (`actions` expected 99, received 2); the other two desktop scenarios passed, while the phone project was skipped by its configured desktop dependency after that expected desktop failure. Runner exit was nonzero as required and cleanup was `removed`. This is positive evidence that the readback assertion detects corruption, not a product failure or an all-green acceptance run.

These are real-local automated checks, not human/store-showcase observations, hosted production evidence, or activation evidence. The #323 branch is preserved; its PR remains open pending the current-candidate hosted checks and fresh exact-head independent review. No production activation is authorized or claimed.
