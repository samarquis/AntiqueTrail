# Evidence — #527 curated image routing

## Candidate

- Issue: [#527](https://github.com/samarquis/AntiqueTrail/issues/527).
- Owner: root release lane; delegated source writer owns only the four files below.
- Risk: high; public routing and release artifact validation.
- Baseline SHA: `dddb9cfd1440b9f883a3ebe5451601ce04f822fb` (fast-forward integration of the disjoint #526 source merge).
- Candidate SHA: pending root commit and independent exact-candidate review.
- Worktree/branch: isolated `issue-527-curated-routing`, `codex/issue-527-curated-routing`.
- Evidence captured: 2026-10-04; local source checks only.

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
- Scoped ESLint and Prettier checks passed; `git diff --check` passed. Existing dependencies were reused without installation.
- Build Output fixture uses synthetic public inputs. No client image, private configuration, credential, provider mutation, or deployment was used.

Root independently reran all 77 artifact tests with zero failures or skips. Root installed this worktree's own dependencies with `npm ci`: audit 591 packages, zero vulnerabilities. Native `vercel build --prod --yes` succeeded using the existing project's ten approved public inputs (configuration SHA256 `477787d13efb7d7bccb737624808c9029b770cbe41fa4a293de2b9ae45fc93d0`). Its actual generated `config.json` contains the exact guarded rewrite `^(?:/((?!curated/macvicar/v1(?:/|$)).*))$` after the filesystem phase, with existing global/auth/private/cache headers and error routing preserved. This is native compilation proof, not a hosted 404 response or production acceptance.

## Independent review and unverified

Root must freeze the candidate SHA, obtain independent Standards/Spec/security review, and record native Vercel build and serving-copy proof before closure. Hosted withdrawal, retained deployment/cache handling, canonical route acceptance, and ADR0011 release gates remain separate operator work. This receipt provides no hosted or production acceptance.

## Invalidation

Evidence belongs to the named source baseline plus this uncommitted diff. Any source, emitted route, artifact, or integration change invalidates affected checks and requires a fresh exact-candidate receipt.
