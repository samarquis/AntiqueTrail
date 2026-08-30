# Issue #125 verification receipt

Date: 2026-08-30

Base: `265306b35c71f851ecdd5998903f93508078265e`

Source candidate: `2d20d924e22ac32baf314c316688d44a4b5eab1e`

## Criterion evidence

| Criterion | Evidence |
| --- | --- |
| Six-field response only | Forward-only migration `20260830190000_minimize_portal_media_history_response.sql` projects only `uploadId`, `kind`, `state`, `altText`, `submittedAt`, and `rejectionReason`. `0076_portal_media_history.sql` passed 21 assertions, including exact JSON-key equality and forbidden-field absence. |
| Client and runtime agreement | `PortalMediaUpload` makes all six fields required (with `rejectionReason: string \| null`); the configured client exact-key decodes untrusted RPC data and maps every malformed/extra response to the generic Portal error. Focused Portal tests passed 2 files / 20 tests. |
| Authorization and continuity | pgTAP proves own-store-only results, deterministic `submittedAt DESC, uploadId DESC` ordering, anonymous execute denial, and identical no-grant denial. `uploadId`, `kind`, and rejection reason remain present for #123. |
| Regression resistance | Client tests reject reintroduced `originalObjectKey` and `derivativeWidth`; pgTAP rejects a non-six-key server payload. |

## Commands and results

| Command | Result |
| --- | --- |
| `npx supabase@2.115.0 db reset --local` | Passed; applied the forward-only minimization migration. |
| `npx supabase@2.115.0 test db supabase/tests/0076_portal_media_history.sql` | Passed: 1 file / 21 assertions. |
| Hosted-equivalent local pgTAP runner after CI's explicit ephemeral-role grant | Passed: 76 files / 2,099 assertions. |
| `npm test -- --run src/features/portal` | Passed: 2 files / 20 tests. |
| `npm run security:contract` | Passed. |
| `node --test scripts/plan-governance-contract.test.mjs` | Passed: 7 tests. |
| `npm run check` | Passed: 88 files / 601 unit tests; 65 release contracts; production build. |
| `git diff --check` | Passed. |

Running the bare all-suite `npx supabase@2.115.0 test db` immediately after reset uses an unprivileged local runner and fails unrelated role/privilege suites before they execute. The hosted database job and the equivalent local runner explicitly create and use `antique_trail_test_runner`; that runner passed the complete 76-file suite above. This is a local-runner limitation, not a substitute for the required hosted database check.
