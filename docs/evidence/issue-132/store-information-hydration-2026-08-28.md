# Issue #132 Store Information hydration evidence — 2026-08-28

## Change

`portal_get_home` now returns a `managedFields` object with the scoped store's approved phone, website, and description. `PortalManagedFieldsPage` waits for that snapshot before it renders editable inputs; a missing or failed read presents the existing generic Portal error and no editable fields. A partial edit therefore submits the hydrated values for the untouched fields, and Portal navigation now exposes **Store information** and **Pending changes**.

The migration retains `portal_private.require_portal_scope()` by replacing the existing scoped home function only. It explicitly revokes `PUBLIC` and `anon` execution and grants `authenticated`, matching the prior access boundary.

## Focused checks

- `npm test -- --run src/features/portal/portalClient.test.ts`: 1 file / 5 tests passed.
- `npm test -- --run src/features/portal/components.test.tsx`: 1 file / 12 tests passed.
- `npm test -- --run src/review-harness/clients.test.ts src/features/portal/components.test.tsx`: 2 files / 28 tests passed. The harness first reads the approved object, changes only phone, then verifies phone, website, and description on the public-listing preview.
- `npm run typecheck`: passed after the portal contract change; later shared-worktree typecheck results include concurrent ticket work and must be evaluated separately.

## Remaining verification

The local Docker engine was unavailable on this Windows host (`docker` could not reach `//./pipe/dockerDesktopLinuxEngine`; starting the Windows service requires unavailable elevation), so the pgTAP contract command in `gates/issue-132.md` has not run locally. Hosted database CI must pass that contract before the issue is closed.
