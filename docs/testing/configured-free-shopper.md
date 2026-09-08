# Real local Free shopper browser acceptance

Run from a clean checkout with Node, Docker Desktop, and Playwright Chromium installed:

```powershell
npm ci
npx playwright install chromium
npm run test:e2e:configured-shopper
```

The command reuses #243's `createLocalService`: pinned local Supabase, a unique temporary
project, unused loopback ports, current migrations/functions/seed, two real GoTrue users,
and scoped cleanup. It builds the ordinary production application with the run's public
URL/anon key and starts a loopback preview. The browser signs in through the actual UI;
Node-only setup credentials never enter the application bundle. It accepts no external
backend, changes no shared Supabase config, and enables no hosted or paid capability.

The dedicated Playwright configuration runs desktop and phone-sized Chromium serially.
The discovery test joins catalog, permitted seed cover image, just-in-time login, favorite
readback/reload, and two-store trip creation. Five independent tests seed clearly labeled
prerequisite trips through SQL, then exercise date/order/priority/dwell/removal through the
browser and verify persisted values with independent SQL. These prerequisites do not count
as browser creation evidence. Separate tests cover sibling and switched accounts, sign-out,
denied trip mutations, saved-state isolation, and next-action application revocation.

Every assertion failure exits nonzero. Unavailable startup or missing/malformed reports
cannot pass. The suite is deliberately excluded from the ordinary fixture CI suite:
diagnostic product failures remain failures and receive separate issue references, rather
than weakening assertions to make this ticket green.

## Evidence and boundaries

Each run creates `artifacts/configured-shopper-<UUID>/report.json`, `playwright.json`, and
browser screenshots/failure traces. The report binds the run to its source SHA, dirty flag,
schema/functions/config/fixture digests, endpoint, project, and cleanup outcome. Playwright
records individual steps and failures; later steps in a failed test are unexecuted, not passed.

Raw Playwright traces/reports may contain disposable login credentials or bearer tokens.
The output directory is ignored by git; keep it local. Publish only inspected, redacted
summaries and selected screenshots after cleanup. Never upload the raw directory.

Use `--inspect` to hold the ready server for 60 seconds for the Codex in-app browser:

```powershell
npm run test:e2e:configured-shopper -- --inspect
```

For a negative control, set `CONFIGURED_SHOPPER_WRONG_READBACK=1` for the same command.
The discovery test then requires an impossible saved count of two for a unique user/store
row. It must fail and exit nonzero; this tests the real readback rather than intercepting a
browser or backend response. Remove the environment variable after the run.

On normal success, failure, SIGINT, or SIGTERM, the wrapper stops its preview and invokes
#243's ownership-checked cleanup. If cleanup fails, the report retains `temporaryProject`;
use the recovery command documented in `configured-shopper-probe.md` for that exact directory.
Never stop a shared stack to recover this run.

This is local configured software evidence. It preserves #251's fixture report and blank
human feedback. Phone-sized automation supplies no physical-device, owner, provider,
hosted, launch, or paid-activation acceptance.
