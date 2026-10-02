# Store Owner paid servicing — cancellation contract

**Decision:** Product Owner approved on 2026-10-01 for [#426](https://github.com/samarquis/AntiqueTrail/issues/426). Approval in the originating chat: “this looks good to me. Make sure this is documented in our system so I can have a deeper review later on.” This records approved product rules, not implementation completion or provider acceptance.

## Scope and actor

One action: cancel renewal at the current paid period's end. Retain valid paid entitlement through that boundary. No immediate termination, new charge, upgrade, refund, or new subscription acquisition is included. Existing scheduled changes cannot restore renewal after accepted cancellation; opening billing or abandoning confirmation must not alter a schedule.

Only the currently approved primary Store Owner may request this action for the exact owned store. Co-Owner, Full Store Access, Listing Editor, anonymous users, and revoked Owners cannot execute it. Their existing approved billing visibility and existing Representative servicing permissions remain unchanged.

Approval covers isolated synthetic local testing with a fake provider only. Fixtures may exercise `sales_open` and `servicing_only`; `off_prelaunch` denies the action. Real external Owners, real-store data, actual provider calls, public rollout, and live billing retain their separate gates. The deployed billing view remains read-only until separately authorized release.

Require an existing exact-store subscription with a bound provider identity and an eligible `active`, `past_due`, or `grace` state. Deny absent, canceled, and other subscription states. Unresolved in-flight changes block a new request until reconciled.

## Authentication, consent, and versions

Require verified email, active session, MFA, and password-plus-MFA authentication within 10 minutes. Confirmation creates an immutable receipt valid for 15 minutes, bound to actor, store, subscription identity/version, paid tier/version, period end, current/future schedule version, cancellation action, displayed terms version/digest, and stage generation.

Before confirmation, show the exact store, cancellation date, retained access, renewal consequence, and any scheduled target being superseded. Before committing intent, transactionally recheck authorization, authentication, stage, consent, and all expected versions. A stale or mismatched receipt denies without provider work.

An identical idempotency key returns the existing authorized result without another effect. Changed input or reuse of consumed consent for a different request denies. Revoked access denies even an otherwise valid replay. Client-selected user, role, store, or stage values never establish authority.

## Dispatch, reconciliation, and outcome

Commit immutable audit and a durable provider obligation before dispatch. Use one provider idempotency key bound to the intent. The existing billing worker owns dispatch and reconciliation. Timeout, lost response, duplicate/concurrent events, and worker restart cannot produce a second effect or false success. Only verified provider state establishes the outcome.

Pending reconciliation remains visible and blocks conflicting actions. Revocation prevents new intent; a service worker must still reconcile an already dispatched obligation. Preserve unresolved obligations until verified finality; retry or operator reconciliation owns failure recovery.

Observable UI states:

| State | Meaning |
| --- | --- |
| `pending` | Intent durably recorded; no verified success yet. |
| `reconciliation_pending` | Provider effect is unknown; durable reconciliation remains required. |
| `scheduled` | Provider verifies cancellation at period end; current entitlement continues. |
| `completed` | Provider verifies the paid subscription ended. |
| `denied` | Authorization, authentication, consent, stage, or expected-state gate rejected the request. |
| `failed` | Verified terminal no-effect outcome; an unknown provider result cannot use this state. |

These are semantic states. Exact storage mappings, RPC signatures, and typed errors must be pinned before implementation; workers cannot infer them from this table.

## Acceptance and review map

1. Server intent: exact-store Owner authorization, current consent/authentication/version checks, immutable audit and idempotency; no provider mutation in this leaf.
2. Local fake-provider execution: success, response loss, duplicate/concurrent events, schedule races, and restart recovery for the same frozen intent.
3. UI: exact consequence preview, pending versus verified success, stale/revoked denial, retry/recovery, keyboard accessibility and mobile rendering.

Database and provider tests must cover wrong store/account/role, absent subscription, revoked access, stale authentication/consent/version, disabled stage, replay, concurrent change, response loss, duplicated events, schedule races, and worker restart. Test fixtures must prove both allowed and denied flows without activating payments.

Implementation readiness still requires separately scoped leaf contracts with exact files/interfaces, runnable commands, deterministic fixtures, and a working local provider/database harness. Existing `assert_servicing_actor` uses legacy Representative grants and a 15-minute authentication window; existing cancellation rejects non-null consent. Exposing those commands to Owner without action-specific adaptation does not satisfy this contract.

#426 closes only after exact-candidate standards, acceptance, and security review; applicable local database/provider/browser proof; required CI; merge; verified resulting main; and criterion-level closure evidence. This document alone does not close #426. Actual Stripe/provider acceptance and deployment remain separate, unproved gates.
