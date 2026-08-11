# UI-07 trip planning, Go, and collaboration — evidence

Evidence date: 2026-08-11

## Overview

The UI-07 evidence review drives every route in this slice through the
`playwright.review.config.ts` runner with only the **honest, current behavior**
of the app asserted. It confirms:

- the routed UI under review is the `review` app shell,
- the harness scenario, review state, and cross-account isolation are real
  observations of the browser, and
- each acceptance row below asserts exactly what the user can do in the
  browser, including the absence of unauthorized content.

## What passed and what did not

| Row | Evidence | Result |
| --- | --- | --- |
| 1 | Anonymous redirect: all 8 trip routes (`/trips`, `/trips/new`, `/trips/trip-a/plan`, `/trips/trip-a/invite`, `/trip-invitations`, `/trips/trip-a/go`, `/trips/trip-a/check-my-day`, `/trips/trip-a/summary`) redirect to `/auth/sign-in?returnTo=…` with no private content | ✓ |
| 2 | Shopper-a trip list: "My trips", New trip link, one seeded row "Avery's antique day — 2026-08-08" linking to the plan | ✓ |
| 3 | Shopper-b empty state: "No trips yet." and no cross-account row | ✓ |
| 4 | Create trip: "River walk" opens `/trips/trip-1/plan` with the new heading | ✓ |
| 5 | Plan render: both seeded stops with trip-date hours and the stale-data warning; no route-feasibility claim | ✓ |
| 6 | Plan edits: rename, move (disabled at ends), priority, dwell, remove, add, restore | ✓ |
| 7 | Review Hours: generic private-data alert on the unresolved stale warning; no fabricated claim | ✓ |
| 8 | Offline queue: queue → replay → conflict → Keep Saved Version clears / Purge offline copy | ✓ |
| 9 | Go journey: Start trip, Google Maps + Waze handoff links, skip/undo skip, arrived/done, private memory saved, auto-complete to summary | ✓ |
| 10 | Summary: "completed", "Visited: 2 · Skipped: 0 · Appeared closed: 0 · Duration: 2 hr", memory statuses, Plan Again → "Avery's antique day (copy)" | ✓ |
| 11 | Check My Day: suggested order from reviewed hours only; Use Suggested Order persists without error | ✓ |
| 12 | Partner invitation: creator/Navigator row, pending invitation block, Revoke invitation; acceptance fails closed (generic trip alert) pending harness prerequisite 2 — see Known limitations | ✓ (honest fail-closed) |
| 13 | Honest states: loading, empty, error, blocked, permission-denied render honestly on `/trips`, plan, and Go | ✓ |
| 14 | Cross-account: shopper-b plan/Go stay loading-only; never the other account's trip or stop rows | ✓ |
| 15 | Cross-role: representative and administrator get the generic trip alert, never trip data | ✓ |
| 16 | Reflow at 320 CSS px: the plan page holds with no horizontal overflow | ✓ |
| 17 | 48×48 px targets: no actionable target smaller than 48 × 48 px on all 8 routes | ✓ |
| 18 | Evidence screenshots (capture run): viewports recorded under `/docs/evidence` | ✓ |

## Known limitations

- **Row 12 positive acceptance is not yet evidenced.** The harness seeds the
  trip-a collaboration only for `shopper-a`; a `shopper-b` page load has no
  collaboration record, so `acceptInvitation('review-trip-invite-shopper-b')`
  rejects with the generic trip alert. The failure is deliberate and documented
  by the "keeps shopper-b trips isolated while allowing self-created trips"
  unit test in `src/review-harness/clients.test.ts`. The e2e asserts the honest
  fail-closed row: the generic alert, with no cross-account trip content.
  Landing the SPEC's harness prerequisite 2 (seeding shopper-b's collaboration)
  unlocks the positive "You joined this one trip as Trip Partner." journey; the
  isolation unit test must be updated then.

## Screenshots

All screenshots were captured in the `review` app shell at 1280 px logical
viewport width (desktop), 768 px (tablet), and 412 px (mobile). Six evidence
viewports per project are archived under `docs/evidence/ui-07/`:
`{project}-trip-list.png`, `{project}-trip-plan.png`, `{project}-go.png`,
`{project}-summary.png`, `{project}-invite-partner.png`, and
`{project}-check-my-day.png`. The Go viewport is captured after **Start trip**
so the navigator controls and map handoff links are visible; the summary
viewport captures the completed record.

## How to reproduce

```sh
npm run typecheck
npm test
npx playwright test --config=playwright.review.config.ts ui07-trip-flows.spec.ts
```

All three commands pass. The `ui07-trip-flows.spec.ts` suite runs across
desktop, tablet, and mobile projects; the screenshot capture is opt-in:

```powershell
$env:CAPTURE_UI07_EVIDENCE='1'
npx playwright test --config=playwright.review.config.ts ui07-trip-flows.spec.ts
```
