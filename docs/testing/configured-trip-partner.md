# Configured trip-partner diagnostic

Run `node scripts/configured-trip-partner.mjs`. The runner owns a disposable local Supabase project, two real GoTrue password identities, loopback ports, a production-configured browser build, and scoped cleanup. It provisions a local-only server-side invitation signing receipt; browser clients receive neither a service credential nor a fabricated shopper JWT.

The desktop and phone suite clicks creator invitation, proves matching-recipient acceptance and independent membership readback, and checks wrong-account and unrelated-trip denial. Its final assertion requires a creator-side accepted-partner revocation control and therefore truthfully fails until the product exposes one that causes the recipient's next protected read/write to be denied. The JSON report records source and local-service identities plus cleanup; credentials and raw tokens remain only in the temporary run directory.

`CONFIGURED_TRIP_PARTNER_WRONG_READBACK=1 node scripts/configured-trip-partner.mjs` deliberately makes the independent membership expectation wrong; it must fail. Missing Docker, malformed Playwright output, setup failure, or cleanup failure is never a pass.
