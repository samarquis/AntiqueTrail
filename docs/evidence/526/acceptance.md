# Evidence — #526 catalog credential custody recovery

## Candidate

- Issue: [#526](https://github.com/samarquis/AntiqueTrail/issues/526).
- Owner: root integrates, reviews and performs every provider operation; delegated writer owns only the two scripts and this evidence record.
- Risk: high — privileged configuration read and encrypted secret custody.
- Rework baseline: `dddb9cfd1440b9f883a3ebe5451601ce04f822fb`; original handler candidate `bb0edb2206ab44d0c40fb8cc8773400a1f232434` is preserved.
- Candidate SHA/fingerprint: pending root freeze; this record describes uncommitted source proof.
- Worktree/branch: `issue-526-catalog-custody/AntiqueTrail`, `codex/issue-526-pinned-operator`.
- Captured: 2026-10-04. Assigned checkout was clean; other worktrees preserved.

## Scope

Temporary operator-only source generation, never a permanent application function. `createCatalogCustodyHandler` is self-contained; `generateCatalogCustodySource` validates public configuration and serializes that exact tested factory into `Deno.serve`. No dependencies, provider calls, logging, arbitrary environment selector, configuration mutation or key rotation.

Public configuration is `{ publicJwk, operatorBearerSha256, operationNonce, projectRef, issuedAt, expiresAt }`. The operator hash is required, exactly 64 lowercase hexadecimal characters, and pins SHA-256 of the entire exact UTF-8 `Bearer <operator-selected legacy JWT>` header. Root selects that credential through authenticated Management API access; no token or role claim supplied by a caller can choose the pin. Project is fixed to `uaupykgpegbseboklubv`; nonce is 64 lowercase hexadecimal characters, supplied as `x-catalog-custody-nonce`; epoch-millisecond window is positive, unexpired and at most 30 minutes. Recipient must be public RSA-OAEP/SHA-256, 4096 bits, exponent 65537, canonical base64url modulus; private JWK fields are rejected.

POST without any Origin is required. The supplied authorization header is hashed to SHA-256 and compared to all 32 pinned bytes without an early exit. `SUPABASE_SERVICE_ROLE_KEY` is never read or treated as authority; its runtime value need not equal the selected operator token. `SUPABASE_URL` must match the fixed project's HTTPS origin exactly. These gates precede reads of `PUBLIC_CATALOG_GATEWAY_JWT` and `PUBLIC_CATALOG_RATE_SALT`; each existing string must be nonempty and at most 8192 UTF-8 bytes. Missing, oversized or failed reads produce the same opaque no-store denial.

Every export uses a fresh AES-256-GCM key, 96-bit random IV and 128-bit tag. RSA-OAEP/SHA-256 wraps the raw AES key. Ordered public metadata `{ schemaVersion, algorithm, projectRef, operationNonce, recipientSha256, issuedAt, expiresAt }` is both AES authenticated additional data and RSA-OAEP label. `recipientSha256` hashes UTF-8 JSON `{ kty: "RSA", n, e: "AQAB" }`. Response adds only base64 `wrappedKey`, `iv` and `ciphertext`; encrypted payload contains exactly the two allowed names and unchanged values. No CORS headers are emitted.

## Acceptance and local proof

| Criterion                      | Observable evidence                                                                                                                                                                      | Result                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Authorized export              | Actual handler response decrypts with native WebCrypto to exactly both existing synthetic values; neither value appears in response text                                                 | PASS                          |
| Pinned operator authority      | Distinct injected service key is never read; selected operator succeeds, wrong pin and arbitrary service-role-looking JWT cannot read catalog settings                                   | PASS                          |
| Denied callers                 | Missing/anon/wrong credential, nonce, Origin, methods, project and expired/rollback clock requests return identical denial; spies prove neither catalog setting was read                 | PASS                          |
| Recipient and envelope binding | Wrong RSA private key and alterations to ciphertext, IV, wrapped key or every authenticated metadata field fail decryption                                                               | PASS                          |
| Configuration bounds           | Invalid JWK/private fields, noncanonical modulus, wrong project, bad nonce, future/expired/fractional/nonfinite or excessive deadline fail before environment reads or source generation | PASS                          |
| Setting bounds/read failures   | Both names individually tested missing, empty, excessive ASCII/UTF-8 bytes and exception handling                                                                                        | PASS                          |
| Actual generated source        | VM executes serialized factory with synthetic `Deno.serve`/`Deno.env`, native WebCrypto and real requests; denial gates, authorized decryption and replay denial verified                | PASS — local, not hosted Deno |
| No egress/logging/selectors    | Fetch/log spies remain empty; caller body cannot select additional settings                                                                                                              | PASS                          |
| Replay/concurrency             | Concurrent requests yield one export; later requests in same handler read no environment                                                                                                 | PASS — per isolate only       |

RED observations: deny-only handler returned 403 instead of required encrypted 200; separate deny-only generated stub also failed 200/decryption contract; noncanonical RSA modulus was accepted before canonical validation. Each was followed by focused GREEN.

Pin rework RED: the old handler rejected the required operator-hash configuration. A separate synthetic reproduction using its original five-field configuration returned 403 instead of 200 when the selected operator token differed from the injected runtime service key. GREEN: pinning the selected operator's exact header hash removes that incorrect runtime-key assumption while preserving all denial and encryption gates.

Command: `node --test scripts/catalog-custody-recovery.test.mjs` — **55 passed, zero failed/skipped**, native Node WebCrypto and synthetic settings. This includes serialized actual-factory execution with synthetic `Deno.serve`/`Deno.env`, not hosted Deno. Source checks use existing dependency tools from the #522 worktree; no install. Frozen-SHA lint/format/CI receipts are owned by root.

Scoped ESLint and Prettier checks passed for both scripts and this receipt; `git diff --check` passed. Only these three owned files changed.

## Prior hosted attempt

Root's sanitized `526-invoke-v3-receipt.json` records the original handler's authorized-ciphertext-unavailable failure, zero authorized exports, opaque anon/wrong-nonce denials, and `verify_jwt=true`. Cleanup recorded DELETE 200, independent management GET 404, temporary endpoint absent, original six functions unchanged, and all 21 current secret digests unchanged. Root's subsequent read-only diagnosis compares authenticated Management API key values with reserved Management `/secrets` digest records; it does not directly measure `Deno.env` in an isolate. This writer inspected no actual secret, private key, or protected configuration. That failure is retained; it does not prove successful custody for this amendment.

Sanitized `526-readonly-all-key-parity.json`, observed 2026-10-04 at 19:21:38.419Z, identifies reserved management-record matches: `SUPABASE_SERVICE_ROLE_KEY` matches the existing default key of type `secret`; `SUPABASE_ANON_KEY` matches the existing default key of type `publishable`. Neither reserved digest matches either existing legacy `anon` or `service_role` JWT. Expected project URL digest matches. A runtime key-type mismatch is an inference consistent with the 403 failure, not directly observed runtime identity. The fix removes the equality assumption regardless. The receipt records no provider writes, raw credential logging, or raw credential persistence. Root additionally reports all three attempted requests returned 403 JSON and provider logs classified their roles as anon/service/service. No platform signing-key rotation or weaker JWT enforcement is part of the amendment.

## Independent review and hosted boundary

Independent Standards/Spec review and formal `codex-security:security-diff-scan` are required at the final exact candidate before any deployment. This writer cannot independently review its own changes. Provider `verify_jwt=true` is a mandatory deployment gate, additional to handler credential comparison; local VM execution does not establish it.

The consume guard is atomic within one isolate. Independent Edge isolates cannot share this guard without durable writes, which are excluded. Root must allow exactly one actual authorized invocation and immediately delete the unique task-owned endpoint globally; cleanup applies on success and failure. The guard must never be described as global replay prevention.

Issue admission records the prior sanitized inventory's missing custody of the two current credential values; this writer used that contract, inspected no private bundle and tested synthetic settings only. Source tests do not repair actual custody. Root alone must obtain ciphertext, decrypt in private custody, compare both digests to its prior authenticated snapshot, seal recovery, verify the original six functions unchanged, delete the exact temporary function and independently confirm the endpoint absent. No actual secret, private key or operation nonce belongs in Git or public receipts.

Successful hosted custody, amended-handler deployment/JWT enforcement and cleanup, source merge and closure remain **UNVERIFIED** here. No provider, database, hosted account or canonical production operation was performed by this writer. Source checks are ready for root integration; final acceptance remains open until those receipts and independent reviews exist.

Evidence becomes stale after any relevant source, configuration, fixture or integration change. Native primitives follow the [Web Crypto specification](https://www.w3.org/TR/webcrypto/); deployment authentication is separately governed by [Supabase's Edge authorization documentation](https://supabase.com/docs/guides/functions/auth).
