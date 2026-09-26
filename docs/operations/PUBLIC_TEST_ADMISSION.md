# Public test admission

Conforming implementation of [ADR0010](../adr/0010-free-public-test-publication.md),
[public-test security](../../SECURITY_AND_TRUST.md#public-test-boundary), and
[the execution contract](../../PACKAGE_CONTRACTS.md#public-test-execution-contract).
This document is not an acceptance receipt or activation authority. First-time
operators walk the ordered phases in [PUBLIC_TEST_OPERATOR_RUNBOOK.md](./PUBLIC_TEST_OPERATOR_RUNBOOK.md).

The migration installs an inactive operator registry in `public_test_private`.
Only the database operator can prepare, activate or revoke it; application
service credentials cannot mint their own scope. Existing function OIDs and
owners remain intact so compiled row policies continue to call the new guards.
Ordinary stages retain their existing admission before this test first starts.
After the first test activation, registration stays bounded to this registry,
including after stop or expiry.

## Prepare and activate

Use the preserved beta project `uaupykgpegbseboklubv` and the stable origin
`https://antique-trail.vercel.app`. Complete the final-source recovery rehearsal,
independent review and hosting acceptance before activation. Actual mail-provider
acceptance is also required before exposing registration or enrolling testers;
the catalog-only milestone leaves both closed. Do not interpret syntactically valid digests as evidence that those
checks passed.

Keep the operator specification private. It contains `backendRef`, `origin`,
`sourceSha`, SHA-256 `artifactDigest`, `configurationDigest`, `schemaDigest` and
`evidenceDigest`, plus `decisionRef`, the reviewed `reviewRef` GitHub PR address,
`operatorRef`, `stopOwner`, `startsAt`, `expiresAt`, `storeIds`, `capabilities`
and `testers`. Capabilities are limited to `catalog`, `registration` and `saved`.
Inventory the exact twelve fictional store UUIDs. Tester entries contain a
normalized `email` and its 64-character `emailHmac`, derived using the same
private registration HMAC configuration as the Edge function. Never put emails,
keys or the private specification in a public issue or tracked artifact.

Call `public_test_private.prepare(spec, request_id, expected_runtime_version)`
as the operator, record the returned binding UUID, then call
`public_test_private.activate(binding_id, expected_runtime_version)` only when
the immutable acceptance evidence is approved. Identical preparation/activation
retries preserve identity and lifetime. Wrong targets, stale versions, changed
retries and revoked bindings fail. Expiry cannot exceed thirty days from first
activation. Never schedule renewal.

## Runtime configuration

For the first catalog-only milestone, build with
`VITE_PUBLIC_TEST_CATALOG_ONLY=true`, prepare only the `catalog` capability and
leave `testers` empty. Registration remains closed. The display flag reuses the
existing **Account setup paused** state for new account entry, registration,
non-lifecycle private entry and catalog save controls; it cannot grant backend access.
Previously admitted users retain provider sign-in with an exact lifecycle return
path, account status, privacy/export/download/deletion/cancellation and local
sign-out. Existing hydration, expiry, role and cancellation-only checks still
apply; the display flag never admits an identity or reopens saves or trips. Anonymous and
authenticated shells keep `Browse | Saved stores | More`; this stage never adds `My Trip`.
Direct trip routes remain behind the same display restriction, while the compile-time local
review harness remains available outside public-test builds. Record the literal build setting in
the accepted configuration/artifact binding. Turn it off only
when actual account/provider acceptance and the next reviewed binding are ready.
Do not use this display restriction as a stop mechanism after human accounts
have been admitted: their authorized lifecycle entry must remain available.

Deploy reviewed `public-catalog`, `account-registration` and
`account-registration-callback` functions and their required reconciliation
functions to that exact backend. The catalog, registration and callback Edge
functions enforce this target with server-only `PUBLIC_TEST_MODE=true`. The catalog needs the
existing constrained `PUBLIC_CATALOG_GATEWAY_JWT`, rate salt and
`PUBLIC_APP_ORIGIN`; no service-role credential is exposed to a browser.
Registration also requires the exact approved application/Supabase/mail
endpoints, email HMAC configuration and real delivery transport. The normal
provider identity, delivery finality and cleanup protocol remains required.
Set the hosted Auth site URL and approved callback redirect to the stable domain;
disable direct provider signup. Do not auto-confirm human accounts.

Only a provider-verified UUID with a confirmed intended email and its exact
reserved receipt can become an ordinary shopper. Caller-editable metadata is
not an admission credential. Session admission and direct PostgREST requests
retain the original role/session checks and additionally permit only the scoped
saved-store actions. Trips, corrections, maps and privileged operations are
outside this scope. Saved stores are limited to the inventoried catalog.

## Stop and evidence

Call `public_test_private.revoke(binding_id, current_runtime_version)` to close
catalog admission, invalidate registration configuration and revoke the named
test sessions. Clock expiry denies catalog, save admission and new
provider operations without relying on a browser flag. Necessary account
lifecycle access remains available under its original authorization: a previously
admitted identity may establish a fresh provider session for account export or
deletion, including unchanged privacy reauthentication. That session cannot
resume saved-store or omitted test operations. Preserve
historical users and data; callback denial never deletes an already admitted
human account. Pending provider work remains subject to reconciliation/cleanup.

The real lifecycle regression also required three narrow repairs: the existing
export definer gains its missing UPDATE permission on its job table; deletion
keeps the established null revocation timestamp for cancellation-only sessions;
and cancellation uses an unambiguous local session identifier. No browser table
mutation, role ownership or privacy-reauthentication requirement changes.

Withdraw the frontend test using the ADR0010 retained maintenance artifact and
verify the stable alias. Record exact deployed source/function/config/schema
identities, expiry, stop owner and recovery evidence. The isolated SQL and mocked
transport tests prove code behavior only. Completion still requires actual
hosted mail/Auth/private-save evidence and signed-out computer-use checks of
root, direct stores/details routes, reload, back navigation and account entry.
