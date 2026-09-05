# Independent review history — Issue #175

Reviewer: `/root/collision_audit`

Review base: `56584b6229445424240c07adab1b817867e59868`

Scope: complete base-to-head review in two independent lanes: (1) correctness, security, privacy, authorization, data integrity, accessibility, maintainability, blast radius, and evidence quality; and (2) issue reason, plan, every acceptance criterion, dependencies, non-goals, and protection against silent plan changes.

## Review iterations

### Head `6febf317fce817bcb2ccdf31bbfddcb50efa26b3` — changes required

1. **P1 — signed authorization:** inactive approval relied on a self-described authorization without a separately trusted signature boundary, exact canonical config/protocol binding, review prerequisites, or complete time/replay validation.
2. **P1 — atomic submission authorization:** attempt submission did not lock and recheck the active, unexpired authorization and exact configuration, allowing expiry/revocation races between presentation and write.
3. **P1 — incomplete disclosure:** the model and UI omitted cancel/refund, immediate upgrade proration, renewal-time downgrade, 14-day failed-payment grace, and 30-day hidden-photo deletion consequences.
4. **P1 — database/client validation divergence:** database approval accepted malformed Full Gallery JSON, including non-string and non-integer values rejected by the client, permitting unusable immutable packets.
5. **P2 — response-loss retry:** the UI generated a fresh idempotency key for every submission attempt, so an ambiguous response retry was not the same logical operation.

The evidence overclaimed signed authorization and strict packet/disclosure coverage despite findings 1, 3, and 4. Focused pgTAP 32/32, Playwright 9/9, Vitest 38/38, the repository check, security contract, and diff hygiene were considered but did not supersede the semantic failures.

### Head `bc67cbd69888a85ccc48b4fce5c8a0c422a36fce` — changes required

The trusted challenge/signature-receipt seam, locked authorization/config checks, complete lifecycle model/copy, stricter numeric validation, and stable response identity resolved findings 2, 3, and 5 and materially repaired findings 1 and 4.

Two blocking findings remained:

1. **P1 — exact JSON typing:** `jsonb_each_text` coerced numeric, Boolean, object, array, and null Full Gallery disclosure values to text, so database approval could still freeze a packet that the client rejected.
2. **P1 — signature replay:** `provider_verification_id` was not globally unique, so one external provider proof could back receipts for different challenges. Same-challenge consumption tests did not exercise this replay path.

Focused Vitest 39/39, Playwright 9/9, and the security contract passed. The focused database rerun was temporarily unavailable because the shared local database contained Issue #168's schema; this was recorded as unavailable, not passing.

### Head `de47dbf108f7d47d48e210fca9f4ea8887fc5ae2` — approved

The database completeness predicate now requires each Full Gallery disclosure to be an actual nonempty, bounded, control-free JSON string. Tests reject numeric, object, array, Boolean, and null disclosures as well as malformed fractional limits. The signature-receipt table now enforces global uniqueness of `provider_verification_id`, and a cross-challenge insert test proves that one external proof cannot be reused.

All earlier findings remain resolved: a separately owned trusted signature receipt is bound to the exact challenge, canonical configuration, protocol, signer, three qualifying community reviews, and valid time window; submission locks and rechecks authorization, participant, and configuration state; all required lifecycle consequences render; database and client packet validation agree; and ambiguous response retry reuses one logical idempotency key.

Final reviewer reruns passed focused pgTAP 53/53, focused Vitest 39/39, the security contract, and base-to-head diff hygiene. The prior exact browser rerun passed Playwright 9/9, including all lifecycle disclosures, no purchase control/provider traffic, minimized refusal, keyboard use, forced colors, reduced motion, and 320-pixel reflow.

## Verdict and remaining limitations

**APPROVED:** the full diff from `56584b6229445424240c07adab1b817867e59868` through `de47dbf108f7d47d48e210fca9f4ea8887fc5ae2` has no open P0/P1 finding in either review lane.

This source approval does not supply missing human, provider, hosted, merge, or production evidence and does not choose prices or authorize sales. The historical complete pgTAP suite still has unrelated privilege/provisioning failures requiring reconciliation; hosted `database`, `web`, and `plan-governance` checks, final pushed-head PR evidence, merge, and post-merge verification remain required. This review file necessarily follows the reviewed implementation commit, so the PR and issue receipt must bind the documentation commit and final pushed head without claiming a self-referential commit SHA.
