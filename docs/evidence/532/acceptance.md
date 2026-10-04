# Evidence — #532 portal authorization continuity

## Candidate and authority

- Issue: [#532](https://github.com/samarquis/AntiqueTrail/issues/532).
- Owner: root owns integration, independent review, GitHub and all provider operations; delegated source writer owns only these three files.
- Risk: high; shared authenticated Store Portal routing.
- Baseline: `58ded79d2d6681ecd5a7eed4dbf558b3c452c2ad`.
- Rework baseline: `9ea855bdcb738593edefc947c6ee581474575eac`; independent review rejected its historical-proof return behavior.
- Candidate SHA/fingerprint: pending root freeze; current rework evidence binds the uncommitted three-file diff against `9ea855bd`.
- Worktree/branch: isolated `issue-532-portal-continuity/AntiqueTrail`, `codex/issue-532-portal-continuity`.
- Captured: 2026-10-04. Initial checkout was clean; overlapping historical #494 / PR #495 are closed/merged. Root cleared ownership before assignment.

## Scope and governing contract

`PortalRouteGuard` associates scoped authorization proof with all 13 security-bearing `AuthSession` fields instead of the entire session object. Only the explicitly display-only `displayName` and `email` fields are excluded. An unchanged authorization key preserves the existing mounted draft while those display values hydrate. Client, location key, null session or any security-field change invalidates the old proof; controls remain hidden while the new scoped read is pending, and rejected or cancelled stale reads cannot authorize the workspace.

Each new authorization effect clears the stored proof before starting its scoped read. A return to a previously authorized security key, exact client object or history location key therefore requires fresh success. Display-only updates leave the effect dependencies unchanged, preserving the mounted draft.

The key includes `userId`, `emailVerified`, `provider`, `role`, `accessToken`, `expiresAt`, `mfaRequired`, `mfaVerified`, `passwordAuthenticatedAt`, `mfaEnrolled`, `mfaVerifiedAt`, `accountState` and `deletionDueAt`. Optional absence and defined values remain distinct. The key remains in component memory; no token or key is logged or persisted. Future authorization-bearing session fields require updating this explicit list and its regression matrix.

Owned changes: `src/app/App.tsx` at the guard, direct tests in existing `src/app/App.test.tsx`, and this receipt. The guard wraps 12 portal routes. Existing auth lifecycle, MFA, expiration, registry validation, scoped RPC/RLS checks, next-command revocation, hours inputs, configured browser expectations/timeouts/retries, dependencies and provider configuration remain unchanged. Own worktree dependencies were installed with `npm ci --no-audit --no-fund`; package manifests and lockfile have no changes.

`SECURITY_AND_TRUST.md` lines 51–63 and `PACKAGE_CONTRACTS.md` line 10 retain server authority, exact scope, MFA and next-request revocation. This is not a broader authorization cache or a client substitute for server checks.

## Test-first proof

The controlled deferred-settings regression was moved into the existing App test seam before the guard changed. Original product behavior failed the same-input-node assertion: expected the node retaining 19:45, received a replacement node with 18:00 after only saved display-name hydration. The earlier external controlled reproduction additionally observed hours reads increasing from one to two with every security field unchanged.

After the correction, the same real App/AuthProvider/hours regression retains its input node and 19:45, performs no additional home/hours reads, and submits 19:45 on the next save. The security-field matrix supplies typed sessions at the existing `useAuth` boundary to isolate guard behavior; real AuthContext expiration and registry tests separately exercise their existing mechanisms.

Independent review of frozen `9ea855bd` found that historical allowed A proof could match again after pending changed/null B returned to a fresh copy of A. Six added regression cases were run against that unchanged production guard before repair: all six failed the absence assertion, finding seven private closing inputs while current authorization remained pending. These cover changed-token and cleared-session returns with current success or denial, exact original client return, and router history-back to the original location key. The first diagnostic assertion used a single-element query against repeated labels; it was corrected to an explicit zero-length query before the retained RED run.

The one-line production repair clears proof at new-effect start. All six cases then pass: cancelled B success cannot restore controls; denied current A leaves controls absent; successful current A allows controls only after its fresh response. Client identity is the exact original object and route identity is the original history key, avoiding weaker fresh-object/fresh-push tests. Retained RED and GREEN logs are root-local `532-authorization-return-red.log` and `532-authorization-return-green.log`; no tokens or private data were logged.

## Acceptance and local verification

| Criterion                      | Observable proof                                                                                                                    | Result           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Display-name hydration         | Original regression GREEN: same input node, retained 19:45, no extra reads, next save receives 19:45                                | PASS             |
| Display-only email             | Changed email preserves node/value and read counts                                                                                  | PASS             |
| All 13 security fields         | Each independently changed field triggers a new home check; private controls disappear while pending and remain absent after denial | PASS             |
| Optional missing values        | Each of seven optional security fields becoming absent invalidates proof and hides controls                                         | PASS             |
| Cleared session/stale approval | Null session denies; prior delayed success cannot restore private content                                                           | PASS             |
| Client and route               | Replacement client and next portal route recheck; deferred denial exposes no old private controls                                   | PASS             |
| Historical-proof return        | Six return cases require fresh success; pending and denied checks expose no controls, and cancelled B approval remains ignored      | PASS             |
| Expiry and revocation          | Real AuthContext expiry timer and inactive registry validation clear session, revoke for the expected reason, and remove workspace  | PASS             |
| Existing component boundaries  | App, AuthContext and portal component suites all pass, including prior scoped-denial/version/error behavior                         | PASS — 124 tests |

Commands:

- RED: `node node_modules/vitest/vitest.mjs run src/app/App.test.tsx --maxWorkers=1 -t 'requires fresh authorization'` against unchanged `9ea855bd` guard: **6 failed at the intended private-input absence assertion**, 71 unrelated tests filtered out; no unhandled errors.
- GREEN: `node node_modules/vitest/vitest.mjs run src/app/App.test.tsx src/features/auth/AuthContext.test.tsx src/features/portal/components.test.tsx --maxWorkers=1`: **124 passed**, zero failures/skips/unhandled errors; includes 33 new continuity cases and all previous 27.
- `node node_modules/eslint/bin/eslint.js src/app/App.tsx src/app/App.test.tsx`: PASS.
- `npm run typecheck`: PASS.
- `npm exec prettier -- --check src/app/App.tsx src/app/App.test.tsx docs/evidence/532/acceptance.md`: PASS.
- `git diff --check`: PASS.

An intermediate focused run passed its assertions but exposed a jsdom-only missing IndexedDB cleanup error on account switch; the fixture now uses the existing in-memory trip database, and the final run has no unhandled errors. This intermediate result was not treated as acceptance.

## Independent and environment boundaries

Root must freeze this corrected candidate and obtain fresh independent Standards/Spec plus formal security review. The frozen `9ea855bd` review was sealed REWORK; its manual review covered three files but server coverage remained PARTIAL. Root reports all three required CI jobs passed for that old candidate; those results do not accept its security finding or this changed source. The writer cannot independently approve its own patch. Fresh required CI, original six configured real Auth/MFA desktop/phone cases, database proof and native browser proof are pending root; no browser expectations, target values, budgets, retries or skips were changed.

The controlled product defect is reproduced and corrected. The exact interleaving behind CI 37227923206 remains unattributed. Local jsdom proof does not establish its timing, native browser behavior, hosted acceptance or canonical production behavior. No provider or database operation, GitHub write, commit, deployment or publication was performed by this writer.

## Invalidation

Any relevant source, test, integration or environment change invalidates affected evidence. Root must bind final checks/reviews to the frozen SHA before merge and live ticket closure.
