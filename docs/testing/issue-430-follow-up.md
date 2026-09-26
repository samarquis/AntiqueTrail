# PR #442 follow-up: media acceptance and canonical account names

Scope: #430, #418, #419, #420 only. No deployment, hosted mutation, or new ticket.

## Reproduced media failure

On clean `5a05ed9e3be9bc5f413db11e60dfd4bbfc3054e9`, run:

```sh
node scripts/configured-free-shopper.mjs --media-only
```

Local run `configured-shopper-a8dfe0cf-55e5-4291-816d-70dc20c59a50`
reproduced both CI failures: the assertion at the original
`e2e/configured-free-shopper.spec.ts:155` expected an empty Sign in submit
button to be disabled, but it was enabled. Both tests stopped before catalog
or media assertions. The run recorded `sourceDirty=false`, two unexpected
results, and `cleanup=removed`.

The exact main base `e4adc310457688a4ecdf90e23b8c689a2f1e2e2a` has the
same SignInPage behavior: submit stays enabled, empty credentials produce
a focused validation error, and the provider is not called. This agrees
with DESIGN_SYSTEM.md's validation-error contract. The replacement test
asserts empty field values, zero auth-token requests, the explicit focused
error, and remaining on sign-in. It retains the photo load, gallery,
lightbox/focus, saved-store persistence, and two-store trip assertions.

## Display-name authority

Settings previously wrote provider metadata before the settings RPC. If
that RPC and the compensating provider rollback failed, the next login
could greet the user with a name that was never saved in account settings.

Account settings now own the display name. Saving uses one settings RPC;
session hydration reads that authority, including an explicitly cleared
name. Provider metadata is not rewritten by settings saves. An unavailable
settings read leaves the authenticated session intact without using stale
provider-name metadata. Late responses cannot change a different account
or overwrite a newer local settings save. No authorization role is derived
from the display name.

Regression tests first failed for the two provider writes, stale saved/null
names, and stale metadata during an outage, then passed after the fix.
The configured account journey additionally forces a settings RPC failure,
asserts no provider-user writes, checks unchanged authoritative values,
and verifies the saved name and address after a fresh login.

Repeat the real-provider proof with:

```sh
node scripts/configured-free-shopper.mjs --account-settings
```

Precommit working-tree proof: media run
`configured-shopper-0fccbfb6-362d-4837-af02-939589eaa172` and settings run
`configured-shopper-7e1255f8-bd8d-4048-9332-9e99c721b91c` each passed desktop
and phone with two expected results, no unexpected/skipped/flaky results,
and run-owned cleanup removed. These receipts intentionally record dirty
source; the PR carries the later committed-head CI and local proof.
Focused account/auth/App tests, typecheck, changed-file formatting, and
lint passed; repository lint retains 14 existing warnings and no errors.

## Unresolved merge blocker

Further exact-head review at `3718ea60` identified three #420 defects:
unversioned last-write-wins updates, saving unknown blank defaults after a
failed initial read, and a late save changing a subsequently signed-in
account's greeting. Follow-up regressions reproduce each applicable seam.
The forward migration `20260926211513_account_settings_concurrency.sql`
adds owner-row locking, expected version, bounded account-scoped retry keys,
and content-free digest/version receipts. Exact replay returns the prior
success reconstructed from the verified request without restoring old
values. Stale versions or mismatched key reuse return current-version
conflicts without mutation. UI retries preserve the attempt key until
success or authoritative reload; failed/partial reads block Save and offer
retry. Every successful mutation/replay is followed by an authoritative read
before updating fields or greeting, so historical success cannot restore a
later-cleared address. Account-lifetime revision and user identity reject
obsolete save completions while permitting same-account token refresh.

Final precommit settings run `configured-shopper-42c83ca4-7264-42ed-ab7b-76e0d1632294`
and media run `configured-shopper-84302009-8dfb-4475-b1f5-022679e1bda2` each
passed desktop and phone, with two expected results, no failures/skips/flakes,
and cleanup removed. Runtime source stayed unchanged throughout both runs.
Settings additionally proves failed-load retry, stale-tab conflict, and a
lost write response followed by another tab clearing the address before
replay. Pending-save token refresh and cross-account completion guards have
deterministic unit coverage, not browser evidence. Full migration-chain
apply and pgTAP 0129/0130/0131 passed; replay checks cover both before and
after a later write. Build, affected lint, and repository formatting passed.

Release compatibility requires explicit migration/frontend sequencing:
the migration drops the old two-argument writer, and the new frontend uses
four arguments. Old clients must fail closed and reload; do not retain an
unversioned bypass. A release plan must coordinate migration, schema-cache
readiness, frontend publication/reload, and verification before enabling
settings writes, per PACKAGE_CONTRACTS.md:16. Source merge is not deployment
authority. No hosted migration, publication, or provider change occurs here.

Issue #420 explicitly requires a persistent private account starting
address across save, fresh login, export, and deletion. DESIGN.md:97–98
requires starting location to remain private per trip and prohibits a saved
Home field. README.md assigns interaction rules to DESIGN.md. No established
precedence makes the issue override that source. The owner must reconcile
this conflict; this follow-up changes neither the address feature nor the
plan. Passing engineering checks does not make this PR merge-ready.

PR #409 remains open on `codex/account-backend-live-20260923` at
`f42b087eeeb43bdde7235b795596dfd472a08e7f`, targeting
`codex/review-mockup-publish`. Its recorded deployed commit is
`c62850ff2091b1013fe9e5bbe3c538db28e64fbe`; deployment was not reverified or
changed here. PR #442 remains the account-only integration into main.
