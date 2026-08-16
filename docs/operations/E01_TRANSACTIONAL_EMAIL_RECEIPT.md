# E-01 transactional email provider receipt

Status: **UNACCEPTED / NO-GO**. No transactional provider is selected or
enabled by this repository change. Real invitation, verification, and recovery
delivery stays disabled; local review uses synthetic fixtures only.

## Implemented fail-closed boundary

- `partner-provider-command` accepts only `synthetic=true`; real identity
  binding returns the published E-01 unavailable message.
- Recovery reserves an idempotent operation using only a recipient HMAC, then
  settles `sent`, `failed`, or `reconciliation_required`; callers receive the
  same response regardless of account existence.
- Missing endpoint, secret, or malformed provider result is unavailable. It
  never claims a delivery, token state, or account lookup.
- The provider smoke script proves public signup is disabled and deletes its
  generated synthetic user; it prints no token or secret.

## Required external receipt before activation

Record provider/legal evidence outside source control: provider/version, region,
retention/subprocessors, authenticated domain, exact quota and hard spend cap,
no auto-overage, timeout/retry/idempotency/reconciliation behavior, outage
fallback, cancellation/export/deletion path, and named Product/Security/Privacy
acceptance. Verification, recovery, invitation, and receipt messages must have
tracking, click rewriting, open pixels, and prefetch disabled.

Then witness: a delivery allow case; timeout and lost-response reconciliation;
duplicate idempotency; disabled-account-existence disclosure; link scanner and
prefetch resistance; rotation/revocation; and provider outage. Do not store an
email address, message body, raw token, delivery event, or secret in the
receipt.

## Exact unblock procedure

1. Product Owner selects a provider and names a security/privacy reviewer.
2. Configure provider credentials only in protected deployment secrets and
   keep public signup disabled.
3. Run `npm run auth:provider-smoke` against the protected stage, retain the
   redacted output, and remove the generated user.
4. Record the witnessed evidence above in the approved external gate service;
   only then enable the deployment-owned E-01 capability and retest the real
   delivery path.

Until then, `npm run auth:provider-smoke` without secrets must fail closed and
the UI must continue to show the E-01 honest gate.
