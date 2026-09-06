# Issue 179: paid-sales transition verification

## Contract and scope

`PACKAGE_CONTRACTS.md`, Package 13, Sales-state commands and proof (blocking acceptance), controls pause, finality-checked close, and event-bound reopen. The implementation base is `de7a437` (merged #178 / PR #220); #180 owns activation and resume. No protected plan changes, provider activation, deployment, or actual provider receipts are included.

## Acceptance mapping

- Signed pause, CAS, generation fencing, exact Checkout/pending-change snapshot, and initial-purchase cancellation/full-refund: `0088_issue_179_sales_transitions.sql`; the existing `0082_issue_177_paid_checkout.sql` and `0087_issue_178_paid_servicing.sql` retain provider-confirmed refund and existing-subscription compensation coverage.
- Servicing-only command restrictions and preservation of valid existing subscriptions: the existing paid Checkout/servicing suites plus `test-paid-transitions-concurrency.mjs` run the real signed pause against concurrent paid-change dispatch.
- Closure requires explicit zeroes for every provider obligation category, complete historical charges, settled balance, all four ended provider horizons, matching locked inventory, and a provider observation no older than one minute. The SQL tests cover nonzero/unknown/incomplete evidence, stale observation, refundable charges, pending compensation, and crash/replay.
- Signature-verified inbound events are journaled before business/provider work; off-state capture makes no business-state change or provider call. Unhandled types remain reconciliation obligations. Event resolution denies while off, and signed reopening commits before resolution can succeed. Runtime Edge tests and real competing database transactions cover these boundaries.
- Resume always denies until #180. New receipt tables are FORCE-RLS, append-only, and unavailable to browser and generic service roles; deployment cannot insert signatures or finality evidence.

## Operational trust boundaries

The no-login `billing_signature_service` is the isolated provider verifier, matching the existing commercial-research signature boundary: it must verify signer identity and responsibility (Operations plus Security for stop/reopen; Operations plus Product Owner for close) against the exact `billing_transition_payload` digest before recording unique provider verification IDs. `billing_transition_service` can stage authorizations and execute signed commands but cannot attest signatures or provider finality. These credentials are not provisioned or exposed by this change.

`billing_finality_service` must reconcile the complete provider account and historical charge set, not merely the local mirror; its immutable evidence binds the exact local inventory digest, observed time, provider account/finality digests, provider horizon policy version, all four horizon ends, complete history and settled balance, and explicit obligation counts. Unknown provider facts must remain unknown and deny closure. The one-minute observation freshness bound is deliberately conservative.

The minimized journal stores event identity, kind, body digest, capture version/time and resolution evidence, never webhook payloads. Quarantined/unsupported events require signed reopening followed by verified provider redelivery/reconciliation in servicing-only. The mirror worker resolves an event only after verified application or provider reconciliation, passing its evidence digest to `billing_resolve_verified_event`; a crash leaves it unresolved and blocks closure. No automatic replay or outbound provider work happens while off.

## Verification record

Local verification results and the independent exact-source-SHA verdict are recorded on the pull request before landing. Synthetic finality fixtures prove repository behavior only; they are not production finality, signature-provider acceptance, or activation receipts.
