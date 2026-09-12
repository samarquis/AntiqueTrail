# Issue #342 trip invitation acceptance diagnosis

Date: 2026-09-12

Pull request: [#364](https://github.com/samarquis/AntiqueTrail/pull/364)

Frozen diagnostic source: `d9a31cf6cef6f5be4b84b6ded626880ac72fa273`

## Reproduction

The committed disposable reproduction is:

```powershell
node scripts/diagnose-trip-invitation-acceptance.mjs
```

It creates synthetic Auth, profile, trip, invitation, and key fixtures; invokes the
acceptance RPC first as a verified wrong-recipient control and then as the verified
intended recipient; reads invitation and membership state independently; and removes
only its owned fixtures.

The frozen candidate was also exercised against an already-running disposable local
Supabase service under an explicit cross-ticket service lease. This avoided restarting,
reconfiguring, or stopping the service while retaining the candidate's committed
classification, redaction, and state checks. The service checkout was at
`c2381eef9c16b8b8646b7937d3351224220d5195` and dirty with unrelated issue #343 work,
so this evidence is not a claim about merged service code. The captured identities
were:

- Supabase CLI: `2.115.0`
- schema identity: `883e1aa8d6a99b12e3d5de975fee861ec1c551a1c319e62053760799f15afe73`
- Edge Function source identity: `33be891e87f03acb03eb5c0be37538b69aea73d610064542c053eb1d4df2bfe1`

No token or recipient address is retained in this report.

## Result

Before either call, the intended recipient was independently confirmed verified, the
invitation was `pending`, `accepted_recipient_matches` was false, and membership count
was zero.

Both calls failed at the same infrastructure privilege boundary:

| Call | HTTP | SQLSTATE | Classification |
| --- | ---: | --- | --- |
| Verified wrong-recipient control | 403 | `42501` | execute permission denied for `trip_private.email_hmac` |
| Verified intended recipient | 403 | `42501` | execute permission denied for `trip_private.email_hmac` |

After each call, the invitation remained `pending`,
`accepted_recipient_matches` remained false, and membership count remained zero. The
control therefore did not reach a valid wrong-recipient authorization denial, and the
intended call did not reach acceptance. This run proves neither product correctness nor
the joined acceptance owned by #321.

## Root cause

Catalog readback showed:

- `trip_private.email_hmac(text,text,text,integer)` owner: `identity_service`
- `trip_private.current_verified_email_hmac(text,text,integer)` owner: `postgres`
- `postgres` has `EXECUTE` on `trip_private.email_hmac(...)`: false

The verifier crosses an ungranted function-execution boundary before recipient
comparison. This is a database function privilege-chain defect, not a session-restoration
timeout, generic UI alert, or distinguishing recipient outcome.

The least-privilege repair disposition is tracked separately in
[#365](https://github.com/samarquis/AntiqueTrail/issues/365). That issue is deliberately
not ready for implementation pending scope-authority review.

## Cleanup and evidence boundaries

The run reported `cleanup: removed`; a separate post-run query found zero
`issue342-%@probe.invalid` Auth users. No schema, grant, migration, or service-lifecycle
mutation was made under the lease.

An earlier disposable local run independently produced the same HTTP 403 / SQLSTATE
`42501` failure and completed its cleanup. Clean-candidate evidence used the leased
service because additional cold starts were slow. This is real local Auth/RPC evidence,
not hosted, provider, production, external-participant, email-delivery, or human
acceptance evidence.
