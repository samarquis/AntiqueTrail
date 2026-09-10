# Issue #320 — synthetic accepted-partner fixture

This is an executable, local-only Review Harness scenario. It proves a
synthetic UI fixture; it does not prove real accounts, email delivery, Auth,
Edge Functions, RPCs, database authorization, or production sharing rules.

## Deterministic creator and recipient setup

Each browser page constructs a new in-memory `tripClient`. There is no browser
storage, server state, or cross-page sharing. The creator fixture is
`reviewAs=shopper-a`; it owns `trip-a` (`Avery's antique day`). A fresh
`reviewAs=shopper-b` fixture contains the pending, recipient-bound invitation
but cannot list or read `trip-a` before accepting it.

The recipient fixture also holds an intentionally inaccessible diagnostic
`trip-creator-private` record. Its synthetic private-rating/note label is used
only to prove the access filter: it must remain absent from Shopper B's list
and accepted plan, while the one invited `trip-a` becomes readable.

The only positive fixture URL is:

```text
/trip-invitations?reviewAs=shopper-b&reviewState=success#token=review-trip-invite-shopper-b
```

After the acceptance status settles, click **Open shared trip**. It must use
the canonical `/trips/trip-a/plan` route. That same page-local client then
shows exactly its accepted one-trip fixture. A refresh or a newly opened page
constructs a new pending recipient fixture again; it does not preserve
acceptance. This reset is intentional and prevents synthetic state leaking
between test contexts.

The denial fixtures are also fixed and recipient-bound: an unknown token,
`review-trip-invite-expired-shopper-b`,
`review-trip-invite-revoked-shopper-b`, and
`review-trip-invite-shopper-a` (wrong recipient) all produce the generic trip
denial and no trip content. Accepting the positive fixture does not alter
those token states.

## Execute

```powershell
npx playwright test --config=e2e/persona-partner-acceptance.config.ts
```

The suite runs desktop and phone projects, waits for the settled acceptance
status and plan heading, and writes acceptance/plan screenshots to each
Playwright test result. Unit coverage in `src/review-harness/clients.test.ts`
proves the pending recipient cannot read the trip before acceptance, gains only
the invited trip after acceptance, and retains deterministic denial states.
