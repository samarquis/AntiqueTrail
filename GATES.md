# Issue #122 — completion gates

Status: historical, issue-specific completion ledger. Issue #122 closed on 2026-08-27. This file is not a global project or release gate; use the relevant `gates/*.md`, GitHub issue, `PROJECT_STATE.md`, and #56 release ledger for current state.

Contract source: GitHub issue #122, “[BUG][P0] Restore PortalClient type safety after media-history API additions”, read 2026-08-26.

- [x] G1. Issue contract and current failure are recorded.
  EVIDENCE: GitHub issue #122 read 2026-08-26; baseline 8b5ba78 and three named TypeScript/interface failures confirmed.
- [x] G2. Eight bounded agent workstreams complete with evidence.
  EVIDENCE: 8 agents dispatched: implementation, root-cause, test coverage, interface audit, verification, adversarial review, scope review, final acceptance; 6 returned completed evidence and the remaining 2 completed their checks before being asked to stop, with no unreviewed implementation change.
- [x] G3. PortalClient imports and uses shared resubmit input/receipt types; resubmit is async and returns the required Promise.
  EVIDENCE: src/features/portal/portalClient.ts imports PortalMediaResubmitInput/PortalMediaResubmitReceipt and defines async resubmitMedia with explicit Promise return.
- [x] G4. unavailablePortalClient implements listMediaUploads and resubmitMedia by rejecting with GENERIC_PORTAL_ERROR; no optional interface weakening, any, or ts-ignore.
  EVIDENCE: unavailablePortalClient maps both methods to unavailable<T>(); source scan found no new any, @ts-ignore, or optional interface change.
- [x] G5. All PortalClient test doubles implement the complete interface and unit tests cover configured and unavailable behavior.
  EVIDENCE: components fixture implements both methods; portalClient.test.ts covers configured calls and unavailable rejections; focused run reports 2 files and 13 tests passed.
- [x] G6. Typecheck passes.
  CHECK: npm run typecheck
  EXPECT: tsc -b
  EVIDENCE: npm run typecheck exited 0 in verification run.
- [x] G7. Lint passes.
  CHECK: npm run lint
  EXPECT: eslint .
  EVIDENCE: npm run lint exited 0 in verification run.
- [x] G8. Format passes.
  CHECK: npm run format
  EXPECT: All matched files use Prettier code style!
  EVIDENCE: npm run format reported all matched files use Prettier code style.
- [x] G9. Issue-focused unit tests pass.
  CHECK: npm test -- --run src/features/portal/portalClient.test.ts src/features/portal/components.test.tsx
  EXPECT: Test Files  2 passed
  EVIDENCE: 2 test files passed, 13 tests passed.
- [x] G10. Build passes.
  CHECK: npm run build
  EXPECT: built in
  EVIDENCE: Vite production build completed; 172 modules transformed and built in 17.55s.
- [x] G11. Final diff is minimal and limited to #122.
  CHECK: git status --short
  EXPECT: output is reviewed and no unrelated changes are included
  EVIDENCE: Issue changes are limited to portalClient.ts, portalClient.test.ts, components.test.tsx, and formatting in types.ts; pre-existing user worktree changes remain untouched.

## Known non-gate observation

The unfiltered full `npm test` run produced unrelated timeout/UI failures under concurrent agent load and was interrupted; it is not represented as a passing full-suite gate. The issue-focused suite passed independently.

## Caveat-repair evidence (2026-08-26)

- [x] C1. Fresh local Supabase reset applies every migration through the portal-history repair migration.
  EVIDENCE: `npx supabase@2.115.0 db reset --local` completed successfully after repairing migration ordering, policy syntax, the billing rollback block, and media-cap variable typing.
- [x] C2. Portal history SQL uses existing media columns and returns the typed `{ uploads }` camelCase contract.
  EVIDENCE: `20260825120000_portal_media_history.sql` and `20260826100000_repair_portal_media_history_contract.sql` both define the corrected projection and grants.
- [x] C3. Resubmit preserves store, kind, and original-upload context at the HTTP transport boundary.
  EVIDENCE: `portalClient.ts` forwards all three values; focused portal suite remains green (2 files, 13 tests).
- [x] C4. Typecheck, lint, and focused portal tests pass after caveat repairs.
  EVIDENCE: `npm run typecheck`, `npm run lint`, and the focused Vitest command completed successfully; `git diff --check` reported no whitespace errors.
- [x] C5. GitHub CLI authentication is repaired and issue #122 is reachable.
  EVIDENCE: Removed the stale user-level `GITHUB_TOKEN` override, activated the valid keyring account `samarquis`, and `gh issue view 122 --json number,state,title,url` returns the open issue.

## Caveat-repair observations

The complete Supabase pgTAP run still reports pre-existing unrelated test-fixture/authorization failures, including protected portal RPC tests invoked without an authenticated partner fixture. It is not represented as a passing full-suite gate.
