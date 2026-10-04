# Evidence — issue #516

## Candidate

- Issue/spec: #516, require configured catalog readiness before startup returns
- Owner/chat: single #516 implementation owner; #506 owns serial main integration
- Risk: high — configured shopper harness and session token handling
- Baseline SHA: `b409e7eec387bb2f3782c92a2c2d96ab11f90d67`
- Candidate SHA: `4fd9d50ba4930fe03cac5940ae37a2f2c849212b` (source/test candidate; later report-only commit may change PR HEAD)
- Diff fingerprint: `ceab66f51875e189203d2733668b3020d9df219b`
  - Command: `git diff --binary --full-index b409e7eec387bb2f3782c92a2c2d96ab11f90d67 4fd9d50ba4930fe03cac5940ae37a2f2c849212b -- scripts/configured-shopper-local.mjs scripts/configured-shopper-local.d.mts scripts/configured-shopper-readiness.test.mjs | git hash-object --stdin`
- Worktree/branch: `codex/issue-516-catalog-readiness`
- Evidence captured at: 2026-10-03

## Scope

Changed outcome: configured-user startup now succeeds only after the existing public-catalog request returns an array within the existing 60 attempts. Readiness helper accepts injected request and wait functions; default wait remains one second.

Excluded scope: application/provider authorization, public catalog API, database/Edge code, registration behavior beyond preserving its existing readiness response, retry budget, CI workflow, fixtures, UI, hosted state, and deployment.

Overlapping branches/worktrees checked: adjacent #505, #506, and #507 work remained separately owned; no #516 branch was present. #506 retains sole serial main integration ownership. This candidate was communicated by commit SHA.

Pre-existing failures or unrelated work: #505 recorded one configured-owner-billing 503/other/zero-row failure and one successful same-SHA rerun. The cause remains unknown and is not attributed to this change. Initial local release tests also exposed a missing installed `jsqr` dependency; `npm ci --offline` restored the lockfile-defined dependencies without changing tracked files.

## Acceptance

| Criterion                                                                | Observable pass condition                                                                                                         | Verification method                                                      | Result/evidence                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Configured shopper waits for catalog readiness                           | Startup does not return on rejected or non-array catalog results; any array, including empty, admits readiness within 60 attempts | Deterministic injected request/wait tests; exact-candidate release suite | Pass at `4fd9d50`; 60-attempt and valid-empty cases included                         |
| Catalog probe contract stays intact                                      | Route, key, session token, origin, and body match the existing public-catalog request                                             | Helper test asserts complete route/options; source diff review           | Pass; synthetic token only                                                           |
| Exhaustion and cancellation stay safe                                    | Exhaustion throws the fixed catalog message without raw exception text; abort prevents another request                            | Deterministic exhaustion, sentinel, and abort tests                      | Pass at `4fd9d50` release suite                                                      |
| Registration readiness remains unchanged                                 | No-user startup still admits only the expected blocked result and preserves its fixed exhaustion error                            | Deterministic registration success/exhaustion tests                      | Pass at `4fd9d50` release suite                                                      |
| Startup failure cleanup and output handling remain intact                | Setup failure is surfaced, owned cleanup runs once, and service output remains ignored                                            | Existing configured-shopper probe tests and exact source review          | Pass in exact-candidate repository checks; `stdio: 'ignore'` unchanged               |
| Later probe command failures remain distinct from startup unavailability | Command exceptions classify as failed and do not stop later commands; startup failure classifies checks as unavailable            | Existing runChecks and runProbe tests plus source review                 | Pass at 4fd9d50; no real browser was run, so rendered-browser behavior is unverified |

## Verification

Test-first proof: The original RED run had 5 passing tests and 2 expected failures (Missing expected rejection) after 60 injected attempts.

Historical identity: The pre-fix test file SHA-256 was C5FF9A034B797358C9693C9A797FE5A99BDCE0F2C9EDF40C669580FFF3F4A0DF. The intermediate extraction recorded diff fingerprint 569fa45eb4bd8cc7601ad78202b3e317dd8a3070 for the module and declaration, but its source snapshot was not retained; that fingerprint cannot be recomputed from a named tree.

Isolated recreation: Starting from source and declaration at eec62bdd24dcb709294f541b86bf90c196b9aeab, a separate OS-temp copy restored the original false-readiness behavior by making the catalog-array branch break without setting ready and restoring the exhaustion guard if (!ready && !run.users.length). The copy included the module's two local imports and the original RED tests. Module SHA-256: 450A2FF78C7922E1C0CB76C6F4A8A532758799CA9C1E3650E96AB0E31F4EAB7C; declaration SHA-256: 2E39A1999783AFE70D4F45BAAFE70CF23C30FFFD4F2A3D1707CF4E3AA9E035B7; test SHA-256 matches the original RED file. node --test configured-shopper-readiness.test.mjs in that copy returned 1 as expected: 5 passed, 2 failed, both Missing expected rejection. The first recreation attempt omitted the two local imports and failed before test discovery; the complete isolated copy reproduced the expected RED.

Check history: The first check on eec62bdd found the new test's undeclared Node AbortController global; the follow-up added only its ESLint global comment. The default-sandbox full check on 4fd9d50 then hit Vitest parent-directory access denial. The elevated full check passed at 4fd9d50. A full check also passed at report predecessor ee7d6528d226f3534f115dd9048390c5fb72ef6d before later report-only corrections; source stayed unchanged.

| Layer                      | Command or flow                                                                                       | Result                                                                                                                                                                                                             | Applies to SHA/environment                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Focused tests              | `node --test scripts/configured-shopper-readiness.test.mjs scripts/configured-shopper-probe.test.mjs` | 22/22 passed; this run preceded the follow-up ESLint global comment, with behavior/test logic unchanged                                                                                                            | `eec62bdd24dcb709294f541b86bf90c196b9aeab`, local Node v24.11.1                        |
| Type/lint/format/build     | `npm run check`                                                                                       | Pass: typecheck, format, build, seed-media verification; lint 0 errors and 16 warnings; Vitest 164 files passed/1 skipped, 1116 passed/1 skipped; release tests 172/172; 239 build modules; seed-media errors `[]` | Exact source candidate `4fd9d50ba4930fe03cac5940ae37a2f2c849212b`, local Node v24.11.1 |
| Database/RLS/RPC           | Not applicable; no database or RPC changes                                                            | Not run                                                                                                                                                                                                            | `4fd9d50`                                                                              |
| Desktop/mobile UI          | Not applicable; no UI changes                                                                         | Not run                                                                                                                                                                                                            | `4fd9d50`                                                                              |
| Accessibility/error states | Error and abort states covered by deterministic helper tests; rendered UI not applicable              | Pass for helper tests; no browser run                                                                                                                                                                              | `4fd9d50` / local                                                                      |
| Hosted/provider lifecycle  | Required configured-owner-billing CI job at final PR HEAD                                             | Pending PR creation and exact-head CI                                                                                                                                                                              | GitHub CI; no local provider or Docker run                                             |
| Canonical production route | Not applicable; no deployment authorized or required                                                  | Not run                                                                                                                                                                                                            | Production                                                                             |

## Security and negative proof

- Denied identities/scopes: no identity or authorization policy changed; the configured session token is passed only to the existing local catalog request.
- Failure and timeout behavior: existing 60-attempt budget remains; request failures are suppressed during readiness polling, exhaustion uses a fixed safe message, and abort is checked before each request.
- Secret/PII handling: tests use synthetic values; raw exception and server output remain suppressed; service process uses `stdio: 'ignore'`.
- Security review: local exact-diff review found no security issue in the changed helper, declaration, or tests. The Codex Security workbench's discovery artifact was unavailable to this account; Daybreak access is not granted, so no scanner PASS is claimed.

## Independent review

- Reviewer: Spec reviewer, read-only, exact source candidate `4fd9d50`
- Standards verdict: source review found no code/security standards breach; reviewer requested this acceptance record. Its check-status note predates the elevated exact-candidate `npm run check` pass above.
- Spec verdict: PASS at `4fd9d50`
- Final verdict: pending final PR-head re-review and configured-owner-billing CI
- Findings and disposition: evidence-record request addressed here; exact final-head review remains pending.

## Unverified

- The configured-owner-billing job has not yet run on the final PR HEAD; this remains a required CI gate.
- No provider, Docker, browser, hosted, or production evidence was gathered. Those runtime actions were excluded by the issue contract; hosted and production behavior are not claimed.
- Codex Security protected discovery output was unavailable because account Daybreak access is not granted. Manual source review is recorded separately and is not represented as a scanner result.

## Invalidation

Evidence applies to the source candidate and local environment named above. Any source change invalidates the affected checks and reviews. The final PR HEAD will add this evidence record; exact PR-head CI and independent review results are reported separately.

## Follow-up — bounded catalog readiness diagnostics

### Candidate and scope

- Follow-up baseline: `944eb4747b58f375704952822a507a0ead7acc9d`, the prior PR #518 head.
- Source/test candidate: `b5c36e8b6ccb86e154c1818e7f48a9436b5facd3`, direct child of the prior PR head `944eb4747b58f375704952822a507a0ead7acc9d`.
- Follow-up source/test diff fingerprint: `abf9f38c5968bc7f4fc63110efd2c6f1617417fc`.
- Changed files: `scripts/configured-shopper-local.mjs` and `scripts/configured-shopper-readiness.test.mjs`. The declaration, startup runner, cleanup code, CI workflow, and report writer are unchanged.
- The candidate writes one JSON record to stderr only when configured-user public-catalog readiness exhausts its 60-attempt budget. Success, registration readiness, and cancellation produce no record. The fixed startup errors, request options, 60 attempts, and one-second waits remain unchanged.
- The record contains only a fixed event/probe label, attempt count, counts for five fixed failure categories, and counts of integer HTTP statuses from 100 through 599. Private WeakMaps carry failure categories by error object and trusted response status by request Promise, so primitive JSON results such as `null` retain the actual status. Injected error text, response content, URL, headers, environment, and identity values are not serialized. Spawned function output remains `stdio: 'ignore'`.

### Follow-up acceptance

| Criterion                                        | Observable pass condition                                                                                             | Verification method                                                                                 | Result/evidence                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Exhausted catalog probe is diagnosable           | Exactly one bounded JSON line records 60 attempts, fixed category counts, and only trusted numeric status counts      | Injected 503 response; 60 distinct statuses; primitive `null` status; schema/count/2 KiB assertions | Pass at `b5c36e8`; focused tests                             |
| Diagnostics exclude untrusted content            | Sentinel error text and response bodies never appear; arbitrary request-object status is ignored                      | Fetch, parse, HTTP, invalid-payload, primitive-JSON, and unclassified-error sentinel tests          | Pass at `b5c36e8`; focused tests                             |
| Existing readiness contract stays intact         | Fixed exhaustion messages, route/options, attempts, waits, success, registration, and abort behavior remain unchanged | Existing helper assertions extended with stderr-silence checks                                      | Pass at `b5c36e8`; focused and full local checks             |
| Service cleanup and output isolation stay intact | No runner/cleanup edits; existing cleanup contract remains covered; served function output remains ignored            | Exact diff review and repository release suite                                                      | Pass for unchanged contracts; no local Docker or browser run |

### Follow-up verification

| Layer                                | Command or flow                                                                                      | Result                                                                                                                                                                                                                                                                                                                                                                                 | Applies to SHA/environment                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Focused tests                        | `node --test scripts/configured-shopper-readiness.test.mjs`                                          | 14/14 passed before commit; source/test working tree matched the committed `b5c36e8` blobs exactly                                                                                                                                                                                                                                                                                     | Local Node v24.11.1                            |
| TDD                                  | Same focused test file                                                                               | Primitive-JSON regression RED: 13 passed/1 failed; final GREEN: 14/14. Earlier diagnostic RED runs were 8/4 and 12/1. Runs preceded the source/test commit while HEAD remained at the evidence predecessor; final source/test blobs were verified identical to `b5c36e8`.                                                                                                              | Follow-up source/test change                   |
| Type/lint/format/tests/release/build | `npm run check`                                                                                      | Pass before commit; tested source/test blobs match `b5c36e8`. Typecheck clean; lint 0 errors/16 warnings; Prettier clean; Vitest 164 files passed/1 skipped and 1,116 tests passed/1 skipped; release tests 179/179; build transformed 239 modules; seed-media verification returned `errors: []`. Required parent-directory access for Vitest/esbuild was granted for this local run. | Local Node v24.11.1                            |
| Patch integrity                      | `git diff --check 944eb4747b58f375704952822a507a0ead7acc9d b5c36e8b6ccb86e154c1818e7f48a9436b5facd3` | Pass; exact two-file source/test diff                                                                                                                                                                                                                                                                                                                                                  | `944eb47..b5c36e8`                             |
| Database/RLS/RPC                     | Not applicable                                                                                       | Not run                                                                                                                                                                                                                                                                                                                                                                                | No database changes                            |
| Browser/provider/Docker              | Not required for this diagnostic change                                                              | Not run                                                                                                                                                                                                                                                                                                                                                                                | No hosted runtime claim                        |
| Hosted CI                            | PR #518's existing run `37172979247`, job `111350146714`                                             | The prior head `944eb47` failed at “Run configured Representative and Owner browser proofs.” Read-only log review found no per-attempt/provider diagnostic or numeric HTTP status. No CI result exists yet for `b5c36e8`; the authorized push will trigger fresh CI after the exact-candidate review gate.                                                                             | Prior head only; failure cause remains unknown |
| Production                           | Not applicable                                                                                       | Not run                                                                                                                                                                                                                                                                                                                                                                                | No deployment authorized or performed          |

At follow-up start, PR #518 was open/draft at `944eb4747b58f375704952822a507a0ead7acc9d`. Its failing test merge source was `d62109ef2fd76c463678cc282799f9be4532bd29`, with parents matching the prior base and PR head. The reported artifact showed `status=unavailable` and `cleanup=removed`; it did not establish why readiness failed. No causal claim is made about #505.

Codex Security diff scan `64a3eef5-407e-4b77-8d57-cfd0eabf53c9` covered the exact source/test range `944eb4747b58f375704952822a507a0ead7acc9d..b5c36e8b6ccb86e154c1818e7f48a9436b5facd3`: complete coverage across two files and three review surfaces, zero reportable findings. Report SHA-256: `5bab7bcaebf2d357da27f5fc1cad9316bdead8f995e503b8fa782efeeae93501`. Canonical findings and coverage SHA-256 values: `d01f2a5173073766a54cf6568a7c72f3ffddc7b554484b7093921e6ab42b093f` and `7f498982b51e154260c891656a068c20ccea83e3b79a7cc7f1748edeb3e22455`. Retained limitation: `response.json()` materializes the response without an explicit byte-size limit; this predates the diff. The reviewed request path is loopback-only; no remote or deployed exposure was established. Daybreak access was `not_granted`; the scan completed without that advisory. The exact evidence-bearing candidate is held to Standards, Spec, and security review before push. Keep PR #518 draft.

### Follow-up invalidation

The checks above apply to source/test commit `b5c36e8b6ccb86e154c1818e7f48a9436b5facd3`. The Codex Security diff scan covers that exact source/test range; the evidence commit adds documentation only. Any change to either source/test file invalidates focused/full checks and security review; do not treat the prior CI failure as evidence for the follow-up candidate. The evidence commit remains local until the exact candidate passes review.
