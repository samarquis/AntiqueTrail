# Evidence — #526 catalog credential custody recovery

## Candidate

- Issue: [#526](https://github.com/samarquis/AntiqueTrail/issues/526).
- Owner: root integrates, reviews and performs every provider operation; delegated writer owns only the two scripts and this evidence record.
- Risk: high — privileged configuration read and encrypted secret custody.
- Baseline: `bde9813e8f75605a9e8adfa22c46fb15ba1f1eff`.
- Candidate SHA/fingerprint: pending root freeze; this record initially describes uncommitted source proof.
- Worktree/branch: `issue-526-catalog-custody/AntiqueTrail`, `codex/issue-526-catalog-custody`.
- Captured: 2026-10-04. Assigned checkout was clean; other worktrees preserved.

## Scope

Temporary operator-only source generation, never a permanent application function. `createCatalogCustodyHandler` is self-contained; `generateCatalogCustodySource` validates public configuration and serializes that exact tested factory into `Deno.serve`. No dependencies, provider calls, logging, arbitrary environment selector, configuration mutation or key rotation.

Public configuration is `{ publicJwk, operationNonce, projectRef, issuedAt, expiresAt }`. Project is fixed to `uaupykgpegbseboklubv`; nonce is 64 lowercase hexadecimal characters, supplied as `x-catalog-custody-nonce`; epoch-millisecond window is positive, unexpired and at most 30 minutes. Recipient must be public RSA-OAEP/SHA-256, 4096 bits, exponent 65537, canonical base64url modulus; private JWK fields are rejected.

POST without any Origin is required. Exact `Bearer SUPABASE_SERVICE_ROLE_KEY` comparison hashes both credentials to SHA-256 and compares all 32 bytes without an early exit. `SUPABASE_URL` must match the fixed project's HTTPS origin exactly. These gates precede reads of `PUBLIC_CATALOG_GATEWAY_JWT` and `PUBLIC_CATALOG_RATE_SALT`; each existing string must be nonempty and at most 8192 UTF-8 bytes. Missing, oversized or failed reads produce the same opaque no-store denial.

Every export uses a fresh AES-256-GCM key, 96-bit random IV and 128-bit tag. RSA-OAEP/SHA-256 wraps the raw AES key. Ordered public metadata `{ schemaVersion, algorithm, projectRef, operationNonce, recipientSha256, issuedAt, expiresAt }` is both AES authenticated additional data and RSA-OAEP label. `recipientSha256` hashes UTF-8 JSON `{ kty: "RSA", n, e: "AQAB" }`. Response adds only base64 `wrappedKey`, `iv` and `ciphertext`; encrypted payload contains exactly the two allowed names and unchanged values. No CORS headers are emitted.

## Acceptance and local proof

| Criterion                      | Observable evidence                                                                                                                                                                      | Result                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Authorized export              | Actual handler response decrypts with native WebCrypto to exactly both existing synthetic values; neither value appears in response text                                                 | PASS                          |
| Denied callers                 | Missing/anon/wrong credential, nonce, Origin, methods, project and expired/rollback clock requests return identical denial; spies prove neither catalog setting was read                 | PASS                          |
| Recipient and envelope binding | Wrong RSA private key and alterations to ciphertext, IV, wrapped key or every authenticated metadata field fail decryption                                                               | PASS                          |
| Configuration bounds           | Invalid JWK/private fields, noncanonical modulus, wrong project, bad nonce, future/expired/fractional/nonfinite or excessive deadline fail before environment reads or source generation | PASS                          |
| Setting bounds/read failures   | Both names individually tested missing, empty, excessive ASCII/UTF-8 bytes and exception handling                                                                                        | PASS                          |
| Actual generated source        | VM executes serialized factory with synthetic `Deno.serve`/`Deno.env`, native WebCrypto and real requests; denial gates, authorized decryption and replay denial verified                | PASS — local, not hosted Deno |
| No egress/logging/selectors    | Fetch/log spies remain empty; caller body cannot select additional settings                                                                                                              | PASS                          |
| Replay/concurrency             | Concurrent requests yield one export; later requests in same handler read no environment                                                                                                 | PASS — per isolate only       |

RED observations: deny-only handler returned 403 instead of required encrypted 200; separate deny-only generated stub also failed 200/decryption contract; noncanonical RSA modulus was accepted before canonical validation. Each was followed by focused GREEN.

Command: `node --test scripts/catalog-custody-recovery.test.mjs` — **48 passed, zero failed/skipped**, native Node WebCrypto and synthetic settings. Source checks use existing dependency tools from the #522 worktree; no install. Frozen-SHA lint/format/CI receipts are owned by root.

## Independent review and hosted boundary

Independent Standards/Spec review and formal `codex-security:security-diff-scan` are required at the final exact candidate before any deployment. This writer cannot independently review its own changes. Provider `verify_jwt=true` is a mandatory deployment gate, additional to handler credential comparison; local VM execution does not establish it.

The consume guard is atomic within one isolate. Independent Edge isolates cannot share this guard without durable writes, which are excluded. Root must allow exactly one actual authorized invocation and immediately delete the unique task-owned endpoint globally; cleanup applies on success and failure. The guard must never be described as global replay prevention.

Issue admission records the prior sanitized inventory's missing custody of the two current credential values; this writer used that contract, inspected no private bundle and tested synthetic settings only. Source tests do not repair actual custody. Root alone must obtain ciphertext, decrypt in private custody, compare both digests to its prior authenticated snapshot, seal recovery, verify the original six functions unchanged, delete the exact temporary function and independently confirm the endpoint absent. No actual secret, private key or operation nonce belongs in Git or public receipts.

Hosted custody/cleanup, deployment JWT enforcement, source merge and closure remain **UNVERIFIED** here. No provider, database, hosted account or canonical production operation was performed. Source checks are ready for root integration; final acceptance remains open until those receipts and independent reviews exist.

Evidence becomes stale after any relevant source, configuration, fixture or integration change. Native primitives follow the [Web Crypto specification](https://www.w3.org/TR/webcrypto/); deployment authentication is separately governed by [Supabase's Edge authorization documentation](https://supabase.com/docs/guides/functions/auth).
