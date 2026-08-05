# RG-01 operational runbook

Status: **NO-GO / disabled by default**. Code and synthetic tests are not Product Owner approval, signing-provider verification, live-source evidence, or authorization to expand geography.

Enable collection only after the Topeka release is active and the live source projection has been verified. `RG01_OPERATIONS_ENABLED` and `RG01_LIFECYCLE_WATCHDOG_ENABLED` remain false until the corresponding protected identities, exact HTTPS endpoints, secrets, reviewed `RG01_SIGNING_TIMEOUT_MS`, monitoring, and recovery procedures are deployed.

The operational surface accepts only server calculation inputs: run ID, window timestamps, optional prior receipt ID, decision, challenge ID, payload digest, and idempotency key. Counts, denominators, exclusions, failed predicates, signatures, and subject or trip content are never browser inputs. Begin enforces a maximum 180-day window. Freeze derives the live source cutoff, manifest, exclusions, all-trip support denominator, metrics, blockers, and claim report from authoritative records.

Only an MFA-backed, recently authenticated active Product Owner may request a one-use decision challenge. Passing is impossible with blockers or a stale source head. The browser cannot submit a signature. The Edge boundary sends only challenge ID and payload digest to the configured verification ceremony, then the signature-service identity consumes the verified digest and provider receipt. A receipt never activates a community; Package 12 separately requires the current unsuperseded RG-01 PASS receipt.

Replays use the same idempotency key. Reusing a key with different inputs fails. Begin, freeze, challenge, consume, and verified purge return their prior content-free result after a lost response. Command receipts exclude subject linkage, trip contents, notes, reviews, support content, claim evidence, defect text, and signatures.

After signing or rejection, linkage is due for purge within 30 days. The watchdog records content-free due/overdue receipts and fails when overdue; it never fabricates a key-destruction receipt or purges automatically. Complete purge only after the authorized lifecycle service verifies the real key-destruction outcome and calls `rg01_complete_verified_purge`. A successor run must link the current receipt and cannot begin until prior linkage has a purge receipt. Aggregate metrics, hashes, formulas, exclusions, supersession links, and signed receipts retain under their existing policy.
