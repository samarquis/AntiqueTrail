# Configured Administrator exact-scope diagnostic

Run `npm run test:e2e:configured-admin-scope` from a clean candidate checkout. It creates a
unique loopback-only Supabase project through #243's `createLocalService`, builds the ordinary
application with that project's public URL, and uses the browser sign-in and MFA screens for a
fictional Administrator. Node fixture setup creates only fictional identities, two distinct store
scopes, and a shopper; it does not substitute for the browser's Auth, MFA, or server mutation.

The suite records desktop and phone results for: unauthenticated denial, actual password plus
TOTP assurance, exact preview and cancel, reasoned revoke/regrant, independent SQL readback,
stale-preview replay denial, missing-assurance denial, sibling-scope preservation, and the absence
of shopper-private data from the Administrator view. It emits a redacted `report.json` under the
ignored `artifacts` directory. The report includes source, schema/function/fixture/config digests,
loopback endpoint, per-result counts, and ownership-checked cleanup status. Raw Playwright output,
credentials, refresh material, bearer tokens, and the temporary input file remain local.

The runner fails nonzero for unavailable setup, malformed/missing results, any failed case, an
incorrect independent readback, or failed cleanup. It never targets an externally supplied URL.
For the negative control, the stale request uses a consumed/mismatched server preview and a new
idempotency key: a competing authenticated RPC consumes the browser's preview, then the original
browser confirmation must receive a real stale-version rejection. The suite checks the visible error,
confirmation focus, retained reason and scoped record, and unchanged independent mutation/audit counts.
The missing-MFA control first registers its actual AAL1 session, checks that it is active with fresh
password assurance, and requests the current scope version. The same preview input must then succeed
through the MFA-authenticated browser, so an inactive session or stale version cannot explain denial.
This is real-local browser evidence only. It does not
establish a hosted, provider, human, production, launch, or paid-activation gate.

Set `CONFIGURED_ADMIN_SCOPE_WRONG_READBACK=1` for the negative readback control. The suite then
requires an impossible action count and must fail nonzero; remove the variable before the normal
run.
