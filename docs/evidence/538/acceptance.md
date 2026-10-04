# Evidence — #538 recovery email HMAC custody source

## Candidate and ownership

- Issue: [#538](https://github.com/samarquis/AntiqueTrail/issues/538).
- Source baseline: `fa1fbe4e7fb28596c3418293df043fa78b32a76b`.
- Candidate SHA/fingerprint: pending root freeze; current evidence applies to the uncommitted three new files against that baseline.
- Worktree/branch: isolated `issue-538-email-custody/AntiqueTrail`, `codex/issue-538-email-custody`; started clean and detached.
- Source writer owns only the new generator, its native test file and this receipt. Root owns commits, integration, independent review, protected credentials, provider operations, recovery custody and closure.
- Risk: high, temporary privileged export. No credentials, provider settings, hosted data or database were accessed or modified by the source writer.
- Governing contracts: issue READY acceptance, `SECURITY_AND_TRUST.md`, ADR0010 matching configuration recovery and ADR0011 preserved custody. The public generator and generated handler are the authorized test seams.

## Source scope

`generateRecoveryEmailHmacCustodySource(config)` calls the existing catalog source generator to validate the unchanged strict six-key public configuration. It applies exactly three fixed compile-time transformations: replace the two-setting list with `RECOVERY_EMAIL_HMAC_SECRET`, replace the nonce header with `x-recovery-email-hmac-custody-nonce`, and insert fixed `purpose: 'recovery-email-hmac-custody'` immediately after `schemaVersion` in metadata. Missing or duplicate transformation markers fail closed. No caller-selected environment name, operation or purpose is accepted.

The generated source is self-contained and retains the existing pinned bearer SHA-256 comparison, project URL guard, RSA-OAEP-4096/SHA-256 recipient wrapping, AES-256-GCM, authenticated metadata and RSA label, fresh key/IV, thirty-minute ceiling, POST/no-Origin gate, exact nonce, uniform 403 denial, value byte bounds, isolate consumption and plaintext/key buffer cleanup. Purpose participates in the existing metadata AAD and RSA label; no cryptography was reimplemented. Runtime environment reads are limited to the fixed project URL and one fixed HMAC setting.

The original catalog factory/generator and tests remain byte-identical to baseline. It still exports exactly the original two catalog settings using its original nonce protocol and metadata. No dependency, build/profile, original handler, Auth, mail, account, rotation, provider, database or publication changes belong to this patch.

## Test-first source proof

Before adding the new generator, the generated-handler acceptance ran against the existing catalog generator. A correctly authenticated email-protocol request returned 403 instead of the required 200, demonstrating the missing distinct capability. The first missing-export assertion was an initial interface probe; the retained RED log is the behavioral protocol failure, not an import/setup failure. After adding the fixed transformations, the same native generated-source VM test returned encrypted fixed-one payload with the required authenticated purpose.

All new runtime tests execute actual generated `Deno.serve` source in a VM with native WebCrypto and synthetic environment values. No separate handler template or cryptography mock substitutes for the emitted handler. The compiler-shape negative test evaluates the actual compiler with a simulated upstream source boundary to prove missing/duplicated fixed markers reject.

## Acceptance and local verification

| Criterion                        | Observable evidence                                                                                                                                       | Status  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Fixed-one ciphertext             | Native RSA/AES decrypts exactly one HMAC setting; no plaintext in response, unrelated runtime reads, logs or egress                                       | PASS    |
| Fixed authenticated purpose      | Exact metadata order; wrong/missing purpose, all other metadata tampering, ciphertext/key/IV tampering and wrong recipient fail decryption                | PASS    |
| Authorization boundaries         | Missing/anon/wrong/scheme/oversized/role-claim bearer, distinct pin, wrong/missing/old nonce, Origin and non-POST denied before HMAC reads                | PASS    |
| Configuration                    | Six required fields, no extra secret/purpose selector, pinned project, nonce/hash format, time window and strict public RSA JWK reject invalid inputs     | PASS    |
| Time/value boundaries            | Before issuance, expiry during authorization/read, nonfinite clock, missing/empty/nonstring/oversized UTF-8 values denied; exact 8192-byte value succeeds | PASS    |
| Replay and read failures         | Concurrent requests release at most one ciphertext per isolate; replay/read errors remain opaque with no subsequent reads or logs                         | PASS    |
| Original fixed-two compatibility | Existing native tests plus direct generated catalog VM preserve original two settings and protocol; baseline file byte hashes unchanged                   | PASS    |
| Exact-head review/CI/main        | Root freezes source and obtains independent Standards/Spec/security review and required CI                                                                | PENDING |
| Actual custody/cleanup           | Root performs pinned authorized fixed-one export, endpoint removal/independent 404, provider digest match and sealed-custody round trip                   | PENDING |

Final bounded source checks before requested handoff:

- `node --test scripts/catalog-custody-recovery.test.mjs scripts/recovery-email-hmac-custody.test.mjs`: **121 passed** (55 original, 66 new), zero failures/skips/cancellations; actual native WebCrypto and generated VM.
- Scoped ESLint for both new scripts: PASS. Existing installed tooling was invoked from the #532 worktree; its ESLint configuration Git blob exactly matches this worktree (`a335f94aea848ec6188f4760cf922df314d95479`). No dependencies were installed or shared files mutated.
- Prettier check of all three new files: PASS before this documentation-only final count update; root should recheck the final receipt after staging.
- Original file SHA-256 remains unchanged: factory/generator `0ab12da01ee0e8db0a163aa91320373c4af008cefe24720b90b0b09b48519da7`; original tests `38ed43ec6edbc37f3f6917b6547668987fe6806b407e19b9d7f97013e51a7459`.
- Tracked `git diff --check`: PASS; all three new files remain untracked, so root must stage and check their exact diff before committing. No source commit or push was performed by the writer.
- Root-local retained logs: `538-generator-red.log` (behavioral protocol failure) and `538-generator-green.log` (121-pass final run).

Source proof does not establish hosted provider JWT verification, actual secret recovery, endpoint deletion, preservation of the original six functions/all 21 digests, protected recipient custody, disaster recovery or publication acceptance.

## Operational limits

Consumption is per isolate, not a global replay guarantee. Root must invoke exactly once and delete the temporary endpoint globally, independently confirm absence before decrypting, and retain immutable safe receipts and separately keyed encrypted custody. Provider `verify_jwt: true` remains mandatory in addition to the pinned bearer; the source cannot prove provider enforcement. Runtime strings and native CryptoKey memory remain subject to platform limits; explicit encoded plaintext and raw key buffers retain the existing cleanup behavior.

No real secret value, operation nonce, recipient private key, actual generated operator configuration or decrypted export was placed in Git or public evidence. Tests use synthetic secrets and an ephemeral in-memory RSA recipient.

## Invalidation and completion boundary

Any relevant source, fixture, compiler upstream or integration change invalidates affected exact-head proof. The source author cannot independently approve this patch. #538 remains open until source merge and independent acceptance of actual custody/cleanup; source tests, a merge, encrypted file or deployment alone cannot close it. Parent #511 recovery and canonical publication acceptance remain separate.
