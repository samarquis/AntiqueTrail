# L-01 Audit Anchor Runbook

L-01 is fail-closed and is **not accepted or enabled by this repository change**. The database defaults to `local` plus `disabled`, which permits only local Synthetic-only privileged work. Shared Alpha, Private Beta, and Regional Public privileged mutations remain closed until the Product Owner accepts a separately administered append-only sink and records the provider contract receipt.

## External facts still required

Before setting `L01_ANCHOR_ENABLED=true` or opening the database capability, record dated evidence for:

- a sink administered outside the Supabase project and its backup/restore domain;
- append-only retention, independent access control, export, cancellation, and replacement;
- `$0` quota and hard no-charge behavior for the intended startup stage;
- provider API/version, exact HTTPS endpoint, credential creation and rotation, timeout behavior, and idempotency semantics;
- proof that repeated use of one idempotency key creates one durable acknowledgement;
- outage, response-loss, delayed acknowledgement, replay, quota exhaustion, and restore exercises;
- proof that the sink receives exactly `environment`, `schema`, `sequence`, `root`, and `idempotencyKey`—never an actor, target, private payload, token, challenge, or secret;
- a witnessed 24-hour missed-root denial and successful recovery rehearsal.

Until those facts pass, leave the capability disabled. No provider is selected by this implementation.

## Secrets and configuration

Supabase Edge Function secrets:

- `AUDIT_ANCHOR_URL`: accepted append-only sink endpoint.
- `AUDIT_ANCHOR_BEARER_TOKEN`: sink credential held only by the Edge Function.
- `AUDIT_ANCHOR_WORKER_SECRET`: independent random scheduler-to-worker credential.

GitHub Actions repository secrets:

- `SUPABASE_AUDIT_ANCHOR_FUNCTION_URL`: full deployed Edge Function URL.
- `AUDIT_ANCHOR_WORKER_SECRET`: the matching scheduler credential.

The GitHub repository variable `L01_ANCHOR_ENABLED` must be absent or `false` until the acceptance evidence is approved. Setting it to `true` activates the 15-minute watchdog invocation. A configured run that cannot reach or authenticate to the worker fails visibly; it does not weaken the database gate.

## Activation

1. Deploy migration `20260821600000_audit_root_anchoring.sql` and the `audit-anchor-worker` Edge Function.
2. Run `supabase/tests/0055_audit_root_anchoring.sql` against the hosted target and retain the result.
3. Configure the three Edge Function secrets and the two GitHub repository secrets without copying values into logs, issues, receipts, or the database.
4. In a reviewed operator migration, update the singleton `app_private.audit_anchor_capability` row with the exact shared environment, accepted provider key/version, contract receipt ID, `state='open'`, a new `changed_at`, and an incremented version.
5. Manually dispatch the workflow. Confirm the sink acknowledgement and that `app_private.privileged_anchor_is_current()` becomes true only after the local audit high-water is acknowledged.
6. Set `L01_ANCHOR_ENABLED=true`, then witness a scheduled run.
7. Exercise one Synthetic privileged mutation, confirm the gate closes while its new root is pending, run the worker, and confirm the gate reopens only after acknowledgement.

## Failure and recovery

- A missing or negative provider acknowledgement is recorded as `retry_wait`; the same content-free envelope and idempotency key are replayed after bounded backoff.
- A lost two-minute worker lease may be reclaimed. It never creates a new idempotency key.
- Any audit event beyond the acknowledged high-water closes representative and administrator role checks immediately.
- An acknowledgement older than 24 hours makes the watchdog stale and closes shared privileged role checks.
- Do not edit outbox state or advance the high-water manually. Restore provider access, let the worker replay, inspect the external append-only acknowledgement, and rerun pgTAP.
- If provider finality is unknown, keep the capability open only for replay while privileged mutations remain closed by the stale/high-water gate. Disable the capability if credentials or sink integrity are suspect.
- Local Synthetic-only fallback requires `deployment_environment='local'`, `state='disabled'`, and the application `synthetic_alpha` stage. It is not evidence for a shared stage.
