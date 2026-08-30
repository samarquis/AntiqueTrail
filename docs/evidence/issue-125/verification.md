# Issue #125 verification receipt

Date: 2026-08-30

Base: `265306b35c71f851ecdd5998903f93508078265e`

Initial minimization candidate: `2d20d924e22ac32baf314c316688d44a4b5eab1e`

Authorization repair candidate: `d16b021702e8976f8b2b77f5e51343d1e9ca4641`

Final migration-ownership candidate: `9170707220f28f6dfc96485ac53a566f29955834`

## Criterion evidence

| Criterion | Evidence |
| --- | --- |
| Six-field response only | Forward-only migration `20260830190000_minimize_portal_media_history_response.sql` projects only `uploadId`, `kind`, `state`, `altText`, `submittedAt`, and `rejectionReason`. `0076_portal_media_history.sql` passed 21 assertions, including exact JSON-key equality and forbidden-field absence. |
| Client and runtime agreement | `PortalMediaUpload` makes all six fields required (with `rejectionReason: string \| null`); the configured client exact-key decodes untrusted RPC data and maps every malformed/extra response to the generic Portal error. Focused Portal tests passed 2 files / 20 tests. |
| Authorization and continuity | The shared `portal_private.require_portal_scope()` now has a valid exact-one grant test (`count(*)=1`) and preserves active session, provider-MFA, recent-auth, consent, partnership, revocation, and stage/audience checks. The migration temporarily grants schema CREATE separately for the helper replacement and public-RPC ownership transfer, revoking each grant before the migration completes; the ACL/comment statements then execute as final owner `identity_service`. pgTAP proves the caller session/MFA/freshness, own-store-only results, a separately authorized other-store representative's one-record response, anonymous denial, and generic no-grant denial. `uploadId`, `kind`, and rejection reason remain present for #123. |
| Regression resistance | Client tests reject reintroduced `originalObjectKey` and `derivativeWidth`; pgTAP rejects a non-six-key server payload. |

## Commands and results

| Command | Result |
| --- | --- |
| `npx supabase@2.115.0 db reset --local` | Passed after the final ownership repair; applied the forward-only minimization migration without ownership errors. |
| `npx supabase@2.115.0 test db supabase/tests/0076_portal_media_history.sql` | Passed: 1 file / 26 assertions after the final ownership repair. |
| Hosted-equivalent local pgTAP runner after CI's explicit ephemeral-role grant | The 76-file run identified the pre-existing `min(uuid)` scope-helper defect; after the repair, its formerly failing Package 6B contract plus the target suite passed: 2 files / 81 assertions. Hosted database CI remains the required complete-suite receipt. |
| `npm test -- --run src/features/portal` | Passed: 2 files / 20 tests. |
| `npm run security:contract` | Passed. |
| `node --test scripts/plan-governance-contract.test.mjs` | Passed: 7 tests. |
| `npm run check` | Passed: 88 files / 601 unit tests; 65 release contracts; production build. |
| `git diff --check` | Passed. |

Running the bare all-suite `npx supabase@2.115.0 test db` immediately after reset uses an unprivileged local runner and fails unrelated role/privilege suites before they execute. The hosted database job and the equivalent local runner explicitly create and use `antique_trail_test_runner`; the latter was used for the repaired Package 6B and target contracts above. This is a local-runner limitation, not a substitute for the required hosted database check.
