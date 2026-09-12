# Configured trip-partner diagnostic

Run `node scripts/configured-trip-partner.mjs`. The runner owns a disposable local Supabase project, two real GoTrue password identities, loopback ports, a production-configured browser build, and scoped cleanup. It provisions a local-only server-side invitation signing receipt; browser clients receive neither a service credential nor a fabricated shopper JWT.

The desktop and phone suite clicks creator invitation, proves matching-recipient acceptance and independent membership readback, and checks wrong-account and unrelated-trip denial. It cancels one removal, proves a concurrent-write conflict leaves membership intact, retries from authoritative state, removes the accepted partner through the creator UI, and then proves denial of the recipient's next protected read and write. The JSON report records source and local-service identities plus cleanup; credentials and raw tokens remain only in the temporary run directory.

`CONFIGURED_TRIP_PARTNER_WRONG_READBACK=1 node scripts/configured-trip-partner.mjs` deliberately makes the independent membership expectation wrong; it must fail. Missing Docker, malformed Playwright output, setup failure, or cleanup failure is never a pass.

## Acceptance map

| Issue #321 requirement | Diagnostic evidence | Current prerequisite |
| --- | --- | --- |
| Run-owned real Auth identities and normal configured clients over real local transport | `scripts/configured-trip-partner.mjs` records source, schema, function, fixture, config, endpoint and project identities; the browser receives only the anonymous key and real user sessions | Final run must use current `main` after #365 |
| Intended recipient accepts and independent backend readback confirms membership | `configured-trip-partner.e2e.ts` exercises the invitation page with the second GoTrue identity and polls `trip_private.trip_participants` independently | #342 merged the reviewed diagnosis at `6d8478b0`; #365 owns the admitted least-privilege repair |
| Wrong account, unrelated trip and creator-private content remain denied | The suite attempts acceptance as the creator, opens a separate run-owned trip as the partner and queries the creator's private store memory | Joined run remains outstanding |
| Creator removes the accepted partner and the next protected read and write fail with truthful UI feedback | The suite cancels once, exercises a non-mutating stale-version conflict, retries the #343/#344 removal UI, checks independent membership, asserts both RPC denials and reloads the removed partner's route | #343 and #344 merged at `650dba0e` and `07ab85bd`; joined run remains outstanding |
| Desktop and phone results are reported independently | Dedicated Playwright projects plus strict two-result parsing prevent an unexecuted variant from passing | Joined run remains outstanding |
| Setup, malformed output, cleanup and deliberately wrong readback fail truthfully | Runner status/exit code and `CONFIGURED_TRIP_PARTNER_WRONG_READBACK=1` negative control | Final focused contract and negative-control runs remain outstanding |

This document is a readiness map, not completion evidence. The diagnostic integrates the reviewed #342/#343/#344 contracts and closes only after #365 merges and the joined real-local browser run plus negative control pass at the final reviewed source SHA.
