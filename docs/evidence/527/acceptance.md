# Evidence — #527 curated image routing

## Candidate

- Issue: [#527](https://github.com/samarquis/AntiqueTrail/issues/527).
- Owner: root release lane; delegated source writer owns only the four files below.
- Risk: high; public routing and release artifact validation.
- Baseline SHA: `8a28fc6532e960b2ebbaabe8a71a91581d0155e8` (current main with #532 accepted).
- Integrated source commit: `3b8f9d548626cc636decf8192051ffa959a1fd92` (original #527 candidate plus current main).
- Candidate: final #530 PR head, bound by the live PR, required CI, and exact-head review receipts.
- Worktree/branch: managed `issue-527-route-integration`, local `codex/issue-527-route-main-integration-luna`; PR continues on `codex/issue-527-curated-routing`.
- Evidence captured: 2026-10-04; local source and native Build Output checks only.

## Scope

The SPA rewrite excludes the exact `/curated/macvicar/v1` namespace after the filesystem phase. Existing files remain eligible for native filesystem serving; namespace misses cannot select the SPA rewrite. Adjacent `v10` and other SPA deep links retain their fallback.

Owned files: `vercel.json`, `scripts/release-artifact.mjs`, `scripts/release-artifact.test.mjs`, and this receipt. Security/auth headers, route order, optional error handling, approved 51-entry manifest, image bytes, withdrawal metadata, and capabilities remain unchanged. Root owns provider build, deployment, GitHub, and final integration. Initial branch was clean; no unrelated source changes were present.

The authored pattern follows Vercel's [capture-group negative-lookahead syntax](https://vercel.com/docs/project-configuration/vercel-json#negative-lookahead). The artifact guard admits one exact compiled fallback shape, with or without the existing optional error handler. Native compilation must confirm that shape; local fixture equality does not establish provider behavior. [Build Output routing documentation](https://vercel.com/docs/build-output-api/configuration) defines the filesystem phase.

## Acceptance

| Criterion                               | Observable pass condition                                                                                   | Local evidence                                                    | Remaining proof                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Exact namespace excluded                | Bare root, trailing slash, missing hash, and nested miss do not match SPA fallback                          | Authored and emitted-pattern tests                                | Native compiled routes and actual 404 response |
| Existing approved bytes served          | Valid curated files precede fallback and retain bytes                                                       | Existing curated artifact verification and filesystem-first guard | Root native serving-copy byte comparison       |
| Adjacent and SPA routes preserved       | `v10`, `v1-adjacent`, Browse, Details, Photos, and auth deep links match fallback                           | Route boundary tests                                              | Root native response checks                    |
| Guard rejects stale or weakened routing | Old catchall, incomplete boundary, overbroad exclusion, absent filesystem recheck, and wrong order rejected | Public artifact creation negatives                                | Independent exact-candidate review             |
| Existing protections preserved          | Headers and optional error handler stay enforced                                                            | Existing artifact tests plus optional-error omission positive     | Root generated-output confirmation             |

## Verification

- RED before the implementation change: both new tests failed for the intended reasons: bare namespace matched SPA fallback, and the guard accepted the old unrestricted artifact route.
- Focused GREEN after the change: 11 routing/artifact tests passed with zero failures or skips.
- Full artifact tests: 77 passed, zero failures or skips (`node --test scripts/release-artifact.test.mjs`).
- Final focused routing/artifact checks after the explicit Node URL import: 12 passed, zero failures or skips. The import corrected the sole scoped-lint finding.
- Original candidate scoped ESLint and Prettier checks passed; `git diff --check` passed.
- Build Output fixture uses synthetic public inputs. No client image, private configuration, credential, provider mutation, or deployment was used.

On the integrated candidate, `node --test scripts/release-artifact.test.mjs` passed all 77 tests with zero failures or skips. The full `npm run test:release` suite passed 319 tests, failed none, and skipped one platform-dependent case. `npm ci` installed 591 packages with zero reported vulnerabilities. Scoped ESLint, Prettier, and `git diff --check` passed.

Native Vercel CLI 50.25.5 `vercel build --prod` succeeded using only the ten approved public Vite inputs (configuration SHA256 `477787d13efb7d7bccb737624808c9029b770cbe41fa4a293de2b9ae45fc93d0`); no provider write or deployment occurred. The generated `.vercel/output/config.json` passed `assertProductionArtifact(..., 'vercel')`. Its emitted routes place the filesystem handler first, then the exact guarded rewrite `^(?:/((?!curated/macvicar/v1(?:/|$)).*))$` with `check: true`, followed by the existing error route. `static/index.html` exists. This proves native compilation and the local artifact contract, not a hosted 404 response or production acceptance.

## Independent review and unverified

Independent exact-head Standards/Spec and formal security review, plus required CI, must bind to the final PR head after integration. Hosted withdrawal, retained deployment/cache handling, canonical route acceptance, and ADR0011 release gates remain separate operator work. This receipt provides no hosted or production acceptance; #527 remains open until an actual missing/excluded-path HTTP 404 is verified on the admitted deployment.

## Invalidation

Evidence belongs to the named source baseline and final PR head. Any source, emitted route, artifact, or integration change invalidates affected checks and requires a fresh exact-head receipt.
