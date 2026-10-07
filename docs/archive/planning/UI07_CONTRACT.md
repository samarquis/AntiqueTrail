# Gauntlet contract — UI-07 (issue #37)

## Ledger

| Field | Value |
|---|---|
| Work item | #37 — UI-07 Complete trip planning, Go, handoff, and offline UI acceptance |
| Source | GitHub issue #37 (parent PRD #1, audit finding AUD-09) |
| Dependencies | #31 (UI-01) and #34 (UI-04) merged; none blocking |
| Likely code area | `src/review-harness/clients.ts` (trips section), `e2e/ui07-*.spec.ts`, `playwright.review.config.ts` (testMatch only), `docs/evidence/ui-07/`, `.planning/UI07_CONTRACT.md` |
| Builder | Sisyphus-Junior (visual-engineering, skills: frontend, playwright) |
| Critic | Independent Sisyphus-Junior (harsh, evidence-backed) |
| Status | Building |
| Required checks | `npm run check`, `npm run test:e2e:review`, evidence capture (`CAPTURE_UI07_EVIDENCE=true`) |

## (Task)

**Work item:** #37 — UI-07 Complete trip planning, Go, handoff, and offline UI acceptance
**Source:** GitHub issue #37; parent PRD #1; audit finding AUD-09; prerequisites #31/#34 merged.
**Outcome:** A reviewer using the local-only review build can plan, edit, order, remove, persist, start, run Go mode (arrive/complete/skip/observed-closed/restore), hand off navigation to Google Maps or Waze, complete a trip, view the summary, plan the same trip again, invite and accept one Trip Partner, assign a Navigator, and exercise offline/stale-data/unavailable-stop/reconnect behavior — matching `DESIGN.md` / `DESIGN_SYSTEM.md` and the PRD, for every documented role and permission boundary.

**In scope:**
- A stateful review-harness `TripClient` (`src/review-harness/clients.ts`) implementing the full interface in `src/features/trips/types.ts` — every required method plus the optional ones the components actually call (`setStart`, `setReturn`, `setLimits`, `addRestStop`, `markObservedClosed`, `restoreStop`, `completeTrip`, `saveVisitMemory`, `replayOfflineMutation`). Writes mutate fixture state; reads return it; version conflicts throw; cross-account access is denied.
- Deterministic seeded fixtures:
  - shopper-a: a draft trip with multiple stops covering store + rest kinds, all three priorities, and verified / unknown / stale hours (so the hours-review and readiness-card flows are exercised); an active trip for Go mode; a completed trip for Summary + Plan Again.
  - shopper-b: its own isolated trips plus a trip it can reach only via an accepted partner invitation.
  - representative and administrator: denied from all trip routes.
- Reload-durable fixture persistence: trip order/state and collaboration records survive a page reload and the documented account/session transitions (sign out/in, scenario switch, partner join, Navigator assignment). The harness Reset button clears them. Use `sessionStorage` (per-tab, review-scoped keys) and/or the already-active IndexedDB offline store; the mechanism must be honest — state that survives a real reload must be asserted in the spec.
- Offline/Go seam: the review build already runs the real offline runtime (`App` falls back to `createTripOfflineRuntime()`; `clients.tripOfflineGrants` is undefined, so `GoPage` calls `client.start`). The harness client must make `Work offline` → queued banner → `Reconnect and replay` → cleared, plus the conflict and purged paths, demonstrable end to end. **Read `src/features/trips/tripRuntime.ts` and `offlineTripStore.ts` first** and implement the client methods those files call (notably `replayOfflineMutation`, `getOfflineQueue`, `completeTrip`).
- ui07 Playwright contract spec (content/state/interaction assertions, not visibility-only) registered in `playwright.review.config.ts` testMatch, mirroring the ui06 spec structure.
- Evidence capture test gated by `CAPTURE_UI07_EVIDENCE`, writing PNGs to `docs/evidence/ui-07/`.
- `docs/evidence/ui-07/README.md` mirroring the ui-05/ui-06 pattern (ordered human-review URLs, acceptance matrix, capture command, desktop/tablet/mobile matrix).

**Out of scope:**
- Production backend/schema changes, real email, routing providers, Check My Day (R-01-gated: the blocked provider is the correct state), other feature seams (auth, stores, catalog, candidates), new dependencies, design-system changes.
- Silent skips are forbidden: if comparison with `DESIGN.md` reveals a required active-trip element the app lacks (e.g., the `Resume Go`/`View Trip Progress` banner in DESIGN.md line 27, or `My Trip` opening the active trip), **report it as a design-gap finding with evidence** in the handoff instead of expanding the build or pretending it exists. Minimal production UI additions are allowed only when directly required by an acceptance criterion and called out explicitly.

**Acceptance (verbatim from ticket):**
1. A seeded shopper can plan and execute the documented trip workflow end to end.
2. Trip order and state survive refresh and the documented account/session transitions.
3. Offline and handoff failures preserve user work and provide a clear next action.
4. Go controls are operable by keyboard and touch and meet the target-size contract.

**Definition of done (verbatim from ticket):**
- Desktop, tablet, and mobile screenshots from the local review build.
- Keyboard-only operation and visible focus.
- Reflow at 200% zoom with no loss of content or function.
- All actionable targets ≥ 48 × 48 px.
- Focus moves to the page H1 after client-side navigation.
- Exercise loading, empty, error, blocked, and success states where applicable.
- Compare the result directly with `DESIGN.md`, `DESIGN_SYSTEM.md`, and the applicable PRD/supporting documents.
- Playwright contract assertions for required content, state, and interaction, not visibility-only checks.
- Human-review URL and ordered review instructions.
- Do not close based on green CI alone; attach the required evidence.

**Constraints:**
- Local-only, secret-free review harness (ui-05/ui-06 precedent): synthetic in-memory identities/data, deterministic `?reviewAs=&reviewState=&reviewSession=` URLs, no production call.
- `VITE_REVIEW_HARNESS=true` + `npm run dev:review -- --host 127.0.0.1 --port 4174`.
- Follow existing repo conventions (Age-Inclusive Usability Baseline, non-color-only status, labeled placeholders, no invented photos). Go copy must keep the "Manual arrival tracking only" and "does not request background location" disclosures intact; the external-map handoff sends only the stop address to the named provider.
- All candidate files are clean LF; a known display-layer defect in this environment garbles some multi-line tool output — trust `node -e` single-value probes when output looks duplicated, and never "fix" imagined line endings.
- Do not modify production seams beyond the explicit gap-flag rule above. Do not delete or weaken existing tests.

## (Build Method)

**Builder:** one Sisyphus-Junior (visual-engineering) owning `src/review-harness/clients.ts` (trips section only), `e2e/ui07-*.spec.ts`, `playwright.review.config.ts` (testMatch only), and `docs/evidence/ui-07/*`.

**Checks:**
1. `npm run check` (typecheck + lint + format + test + test:release + build) — must pass.
2. `npm run test:e2e:review` — must pass.
3. Evidence capture: `$env:CAPTURE_UI07_EVIDENCE='true'; npx playwright test e2e/ui07-*.spec.ts --config playwright.review.config.ts --grep "evidence when explicitly requested"; Remove-Item Env:CAPTURE_UI07_EVIDENCE` — writes PNGs to `docs/evidence/ui-07/`.

**Critic:** independent sub-agent with the raw issue, diff, test output, and runtime artifacts; must inspect actual diff/artifacts, not prose.

**Loop:** builder evidence → critic verdict → targeted rework → re-verification, until WOWED or a genuine blocker is proven.

## (Bar to stop)

- All four acceptance criteria demonstrated in the review build with captured evidence.
- All DoD items evidenced (screenshots, keyboard/H1-focus, 200% reflow, 48×48 scan, state coverage, design comparison, contract assertions, ordered review instructions).
- `npm run check` and `npm run test:e2e:review` green; existing tests not deleted or weakened.
- No work-item-relevant actionable critic finding remains; integration sound.
- Claims backed by captured evidence (PNGs + README); no closing of the issue or external GitHub action without explicit user request.
