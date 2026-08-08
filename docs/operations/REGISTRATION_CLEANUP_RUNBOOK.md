# Registration cleanup worker

The registration callback records every blocked provider identity in
`app_private.registration_cleanup_tickets`. The ticket is keyed by the exact provider user UUID
and remains claimable even when admission metadata is missing, malformed, nonexistent, or does
not match a receipt.

## Deployment configuration

Configure the Edge functions with `APP_ORIGIN`, `REGISTRATION_APPROVED_APP_ORIGIN`,
`REGISTRATION_APPROVED_SUPABASE_ORIGIN`, `REGISTRATION_APPROVED_MAIL_ENDPOINT`, and a random
`REGISTRATION_CLEANUP_SCHEDULER_SECRET` containing at least 32 characters. Keep the service-role
key only in Supabase-managed function secrets.

Configure the GitHub environment with:

- variable `REGISTRATION_CLEANUP_URL`: the exact cleanup Edge function URL;
- secret `REGISTRATION_CLEANUP_INVOKE_JWT`: a constrained Supabase invocation JWT;
- secret `REGISTRATION_CLEANUP_SCHEDULER_SECRET`: the same independent scheduler secret.

The workflow invokes one bounded ticket every 15 minutes. Provider deletion attempts use
exponential delays of 1, 2, 4, 8, 16, then 32 minutes, capped at one hour. Six failed attempts
create an immutable operator case and keep registration closed.

## Operator recovery

Inspect the exact cleanup ticket and provider UUID. Operators may only call
`resolve_registration_cleanup_operator_case(ticket, provider, 'retry')` after repairing the
provider failure; this resets the bounded attempt series. There is deliberately no manual
“confirmed absent” override. Only the worker's exact provider-ID lookup can terminalize a ticket
after it observes provider absence. Registration reopens automatically only when no cleanup ticket
remains unresolved.
