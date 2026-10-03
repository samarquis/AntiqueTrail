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
