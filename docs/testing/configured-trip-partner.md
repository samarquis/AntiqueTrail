# Configured trip-partner diagnostic

Run `node scripts/configured-trip-partner.mjs`. The runner owns a disposable local Supabase project, two real GoTrue password identities, loopback ports, a production-configured browser build, and scoped cleanup. It provisions a local-only server-side invitation signing receipt; browser clients receive neither a service credential nor a fabricated shopper JWT.

The desktop and phone suite clicks creator invitation, proves matching-recipient acceptance and independent membership readback, and checks wrong-account and unrelated-trip denial. Its final assertions require the creator-side accepted-partner removal supplied by #343 and #344, followed by denial of the recipient's next protected read and write. The JSON report records source and local-service identities plus cleanup; credentials and raw tokens remain only in the temporary run directory.

`CONFIGURED_TRIP_PARTNER_WRONG_READBACK=1 node scripts/configured-trip-partner.mjs` deliberately makes the independent membership expectation wrong; it must fail. Missing Docker, malformed Playwright output, setup failure, or cleanup failure is never a pass.

## Acceptance map

| Issue #321 requirement | Diagnostic evidence | Current prerequisite |
| --- | --- | --- |
| Run-owned real Auth identities and normal configured clients over real local transport | `scripts/configured-trip-partner.mjs` records source, schema, function, fixture, config, endpoint and project identities; the browser receives only the anonymous key and real user sessions | Final run must use the merged #342 diagnosis and current `main` |
| Intended recipient accepts and independent backend readback confirms membership | `configured-trip-partner.e2e.ts` exercises the invitation page with the second GoTrue identity and polls `trip_private.trip_participants` independently | #342 must supply reviewed acceptance diagnosis/evidence |
| Wrong account, unrelated trip and creator-private content remain denied | The suite attempts acceptance as the creator, opens a separate run-owned trip as the partner and queries the creator's private store memory | Joined run remains outstanding |
| Creator removes the accepted partner and the next protected read and write fail with truthful UI feedback | The suite will invoke the reviewed removal UI and then check both RPC denial and the rendered unavailable/error state | #343 server command, then #344 client/UI action |
| Desktop and phone results are reported independently | Dedicated Playwright projects plus strict two-result parsing prevent an unexecuted variant from passing | Joined run remains outstanding |
| Setup, malformed output, cleanup and deliberately wrong readback fail truthfully | Runner status/exit code and `CONFIGURED_TRIP_PARTNER_WRONG_READBACK=1` negative control | Final focused contract and negative-control runs remain outstanding |

This document is a readiness map, not completion evidence. #342 and #343 may close independently; #344 follows #343; this diagnostic integrates their reviewed contracts and closes only after the joined real-local browser run passes at the final reviewed source SHA.
