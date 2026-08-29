# Issue #133 revoke-preview contract evidence — 2026-08-28

## Contract repaired

The browser now calls `admin_preview_store_scope_change` with an explicit `revoke` or `regrant` operation before either exact scope mutation. The forward migration replaces the obsolete three-argument preview RPC, permits `active` or `reconsent_required` only for a revoke preview and `revoked` only for a regrant preview, and hashes the operation with the exact subject, store, grant, and grant version.

`admin_change_store_scope` now requires a server preview for both paths. It rejects a missing, expired, consumed, wrong-user/store/grant/version, or operation-mismatched preview before mutating authority, then consumes the preview after the successful mutation.

## Local checks

- `npm test -- --run src/features/admin/adminClient.test.ts src/features/admin/components.test.tsx`: 2 files / 10 tests passed. The tests prove the active scope revoke sequence calls an operation-bound preview first and sends that preview ID to the exact revoke mutation; the revoked regrant path uses `regrant`.
- `npx prettier --check` over the changed Admin and review-harness TypeScript files: passed.
- `git diff --check`: passed.

## Remaining hosted check

The local Docker engine was unavailable (`dockerDesktopLinuxEngine` named pipe missing), so pgTAP could not run here. `supabase/tests/0060_package_7_operational_admin.sql` adds its public-RPC contract assertions; database CI must apply the forward migration and run the suite before issue closure.
