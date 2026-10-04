# Evidence — #532 portal authorization continuity

## Candidate and authority

- Issue: [#532](https://github.com/samarquis/AntiqueTrail/issues/532).
- Owner: root owns integration, independent review, GitHub and all provider operations; delegated source writer owns only these three files.
- Risk: high; shared authenticated Store Portal routing.
- Baseline: `58ded79d2d6681ecd5a7eed4dbf558b3c452c2ad`.
- Candidate SHA/fingerprint: pending root freeze; evidence currently binds the uncommitted diff against that baseline.
- Worktree/branch: isolated `issue-532-portal-continuity/AntiqueTrail`, `codex/issue-532-portal-continuity`.
- Captured: 2026-10-04. Initial checkout was clean; overlapping historical #494 / PR #495 are closed/merged. Root cleared ownership before assignment.

## Scope and governing contract

`PortalRouteGuard` associates scoped authorization proof with all 13 security-bearing `AuthSession` fields instead of the entire session object. Only the explicitly display-only `displayName` and `email` fields are excluded. An unchanged authorization key preserves the existing mounted draft while those display values hydrate. Client, location key, null session or any security-field change invalidates the old proof; controls remain hidden while the new scoped read is pending, and rejected or cancelled stale reads cannot authorize the workspace.

The key includes `userId`, `emailVerified`, `provider`, `role`, `accessToken`, `expiresAt`, `mfaRequired`, `mfaVerified`, `passwordAuthenticatedAt`, `mfaEnrolled`, `mfaVerifiedAt`, `accountState` and `deletionDueAt`. Optional absence and defined values remain distinct. The key remains in component memory; no token or key is logged or persisted. Future authorization-bearing session fields require updating this explicit list and its regression matrix.

Owned changes: `src/app/App.tsx` at the guard, direct tests in existing `src/app/App.test.tsx`, and this receipt. The guard wraps 12 portal routes. Existing auth lifecycle, MFA, expiration, registry validation, scoped RPC/RLS checks, next-command revocation, hours inputs, configured browser expectations/timeouts/retries, dependencies and provider configuration remain unchanged. Own worktree dependencies were installed with `npm ci --no-audit --no-fund`; package manifests and lockfile have no changes.

`SECURITY_AND_TRUST.md` lines 51–63 and `PACKAGE_CONTRACTS.md` line 10 retain server authority, exact scope, MFA and next-request revocation. This is not a broader authorization cache or a client substitute for server checks.

## Test-first proof

The controlled deferred-settings regression was moved into the existing App test seam before the guard changed. Original product behavior failed the same-input-node assertion: expected the node retaining 19:45, received a replacement node with 18:00 after only saved display-name hydration. The earlier external controlled reproduction additionally observed hours reads increasing from one to two with every security field unchanged.

After the correction, the same real App/AuthProvider/hours regression retains its input node and 19:45, performs no additional home/hours reads, and submits 19:45 on the next save. The security-field matrix supplies typed sessions at the existing `useAuth` boundary to isolate guard behavior; real AuthContext expiration and registry tests separately exercise their existing mechanisms.

## Acceptance and local verification

| Criterion                      | Observable proof                                                                                                                    | Result           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Display-name hydration         | Original regression GREEN: same input node, retained 19:45, no extra reads, next save receives 19:45                                | PASS             |
| Display-only email             | Changed email preserves node/value and read counts                                                                                  | PASS             |
| All 13 security fields         | Each independently changed field triggers a new home check; private controls disappear while pending and remain absent after denial | PASS             |
| Optional missing values        | Each of seven optional security fields becoming absent invalidates proof and hides controls                                         | PASS             |
| Cleared session/stale approval | Null session denies; prior delayed success cannot restore private content                                                           | PASS             |
| Client and route               | Replacement client and next portal route recheck; deferred denial exposes no old private controls                                   | PASS             |
| Expiry and revocation          | Real AuthContext expiry timer and inactive registry validation clear session, revoke for the expected reason, and remove workspace  | PASS             |
| Existing component boundaries  | App, AuthContext and portal component suites all pass, including prior scoped-denial/version/error behavior                         | PASS — 118 tests |

Commands:

- `node node_modules/vitest/vitest.mjs run src/app/App.test.tsx src/features/auth/AuthContext.test.tsx src/features/portal/components.test.tsx --maxWorkers=1`: **118 passed**, zero failures/skips/unhandled errors; includes 27 new continuity cases.
- `npm exec eslint -- src/app/App.tsx src/app/App.test.tsx`: PASS.
- `npm run typecheck`: PASS.
- `npm exec prettier -- --check src/app/App.tsx src/app/App.test.tsx docs/evidence/532/acceptance.md`: PASS.
- `git diff --check`: PASS.

An intermediate focused run passed its assertions but exposed a jsdom-only missing IndexedDB cleanup error on account switch; the fixture now uses the existing in-memory trip database, and the final run has no unhandled errors. This intermediate result was not treated as acceptance.

## Independent and environment boundaries

Root must freeze the exact candidate and obtain independent Standards/Spec plus formal security review. The writer cannot independently approve its own patch. Full required CI, original six configured real Auth/MFA desktop/phone cases, database proof and native browser proof are pending root; no browser expectations, target values, budgets, retries or skips were changed.

The controlled product defect is reproduced and corrected. The exact interleaving behind CI 37227923206 remains unattributed. Local jsdom proof does not establish its timing, native browser behavior, hosted acceptance or canonical production behavior. No provider or database operation, GitHub write, commit, deployment or publication was performed by this writer.

## Invalidation

Any relevant source, test, integration or environment change invalidates affected evidence. Root must bind final checks/reviews to the frozen SHA before merge and live ticket closure.
