# First outing readiness — 2026-10-06

**Verdict: not ready for the connected real outing.** The local rehearsal is complete; a real trip, durable private-memory proof and owner usability acceptance remain unexecuted. No product features or providers were enabled.

## Contract and source

- User authorization: “do the next step,” following the recommendation to prove one complete outing with the couple.
- Acceptance: exercise the existing local journey, distinguish working pieces from missing connections, and prepare the actual couple/owner walkthrough without expanding scope.
- Source tested: `f95ee0f6ba55a4e8b1525e843420a779ed1ce7a2`, clean before execution; branch `codex/shopper-first-scope`, worktree `ba15/AntiqueTrail`.
- Owner: this chat. Live inspection found no open PR and preserved the 26 existing release/account/recovery issues. No ticket was claimed, rewritten or closed.
- Environment: Windows; Node `24.11.1`, npm `11.13.0`, locked Playwright `1.62.1`; `npm ci --no-audit --no-fund` completed. Loopback-only review harness, fictional catalog/identities, `VITE_COMMERCIAL_RESEARCH_REVIEW=true`. No Docker, database, real account, external map request or provider operation.

## Observed evidence

Command:

```text
node scripts/free-private-evaluation.mjs --mode local --output .codex/outing-rehearsal
```

Raw Playwright result: **10 expected/passed, zero unexpected, skipped or flaky**, across desktop and Pixel 5 emulation; duration 32.4 seconds. The report aggregates these into five fixture scenarios, all passing. Browser subprocess exit was 0. The evaluation's semantic exit code is 2/`incomplete`, because human, server authorization, provider and release evidence are unavailable; the enclosing command tool returned exit 1. These are distinct from failed browser assertions.

The existing tests cover selected catalog/gallery/save actions, direct trip creation and dwell/priority editing, cancellation/offline messaging, and limited role boundaries. They do not exercise a complete new-scope outing. In particular, `e2e/persona-free-private-evaluation.spec.ts` opens `/trips/new?addStoreId=...` directly rather than clicking Add to Trip from Store Details. Passing that test does not prove the missing connection.

Additional rendered inspection used the same source/fixture in the in-app browser on `127.0.0.1:42180`. Store Details and Saved stores were reached through visible navigation; the planner was opened directly for diagnosis, then Go through its visible link. An initial diagnostic `/trips/trip-a` URL produced Page not found; the defined planner route is `/trips/trip-a/plan`. No shortcut is counted as a completed shopper journey.

| Outing step | Current evidence | Readiness consequence |
|---|---|---|
| Browse, details, gallery and favorite | Existing fixture tests pass on desktop and phone emulation; rendered Blue Finch details and saved record inspected | Reusable local UI; real persistence/account isolation not proved |
| Share a public store and Add to Trip | Rendered details has no Share/Copy link button and no Add to Trip link; Saved stores has only the store link and remove action | Connected journey stops here. Browser address-bar sharing is a possible workaround, not proof of the specified app action |
| Create a dated trip and edit duration | Existing test reaches chooser by direct URL, creates trip and sets 75-minute dwell | Underlying components exist; natural entry remains missing |
| Add an unlisted shop | Rendered planner exposes only stop label, priority and dwell; source sends those fields without address/hours/source URL | Cannot establish the required private destination |
| Driving/hours suggestion | Planner explicitly says “Travel time is not included” | Current hours/manual planning does not meet suggested-order acceptance |
| Navigate and record visits | Rendered Go shows Arrived/Skip/closed controls and Maps/Waze links to a fictional address; links were not opened | UI exists, but no real navigation proof; Details disables fictional directions while Go offers them |
| Reopen private memories later | Review client holds memory in a local variable; harness explicitly recreates in-memory sessions | This fixture cannot prove durable cross-session memory; use admitted real local services before human outing |
| Basic owner maintenance | Existing tests reach representative/admin pages and check limited denied correction access | Not proof of onboarding, hours/photo/update writes, exact-store enforcement or human usability |

## Source explanation and smallest next work

The first gap is an exposure/connection mismatch: `src/app/App.tsx:841` renders Store Details with `stage="package-3"`; `src/features/catalog/components.tsx:1293` requires at least `package-5a` before rendering Add to Trip. The current catalog-only exposure is intentional and must remain restricted.

First implementation outcome: **in an explicitly selected local shopper evaluation, open Store Details and use its visible Add to Trip action to reach the existing chooser with the same store**. Reuse the existing chooser; do not implement an inbox, collaboration, billing or a new planner. Keep ordinary catalog-only/public behavior denied. Define the local selection boundary and its allow/deny checks before assigning this as READY. Live release issue #487 remains separate ownership, not implied authorization for this work.

Acceptance must click from Details (no direct trip URL), retain the selected store across allowed authentication, support cancel/retry without duplicate stops, and demonstrate unchanged public-test denial. Favorites entry and public Share are subsequent small connections, not reasons to widen the first leaf.

Before the full outing, separately resolve private-stop destination fields, routing inputs/provider admission, and durable store/visit memory mapping. Go currently calls `mapHandoffUrl` with `currentStop.address ?? currentStop.label` (`src/features/trips/components.tsx:1252` and `:1259`); a label-only fallback must not be accepted as a confirmed destination. The manual add path at `:527` lacks address/hours; planning at `:665` declares its no-travel-time limitation. These source observations do not claim the faulty fallback was exercised against a real map provider.

## Human packet and remaining proof

Use the [couple's outing sequence](../../testing/free-private-evaluation/README.md#first-couples-outing). Real store choices are pending; the rehearsal used Blue Finch Curios and Cedar & Brass. No human reactions, ratings of usefulness or time savings have been invented.

| Evidence class | Result |
|---|---|
| Local fixture browser | Ten existing assertions/cases pass; direct rendered inspection identifies missing connections |
| Real local database/account persistence | Not run |
| Actual phone and assistive-technology use | Not run; emulation is not physical-device acceptance |
| Hosted/provider/canonical production | Not run; existing exposure unchanged |
| Couple's real outing and owner feedback | Not run; blocked by the identified gaps and applicable admission |

Local raw artifacts remain under `.codex/outing-rehearsal/` (ignored, not published):

- `playwright.json`, SHA-256 `8de712e3d4462518a1e2b22ff4451730e825891a8d3a514da5130a8cb7ca94c7`.
- `report.json`, SHA-256 `912581c6e686c65232fb0df5cd99e8be19b30d29586d9e1792cc7f4093e3a81c`.
- Generated runner config and resource lease describe the command and loopback port.

The automated runner completed; its listener was absent before the separate manual inspection. The manual browser was closed and its owned development-server session stopped after inspection. No application code changed. This receipt and the walkthrough are preparation/evidence, not release approval or completion of the real outing.
