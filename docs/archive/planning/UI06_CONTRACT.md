# Gauntlet contract — UI-06 (issue #36)

## Ledger

| Field | Value |
|---|---|
| Work item | #36 — UI-06 Complete Candidate Share and Trip Ideas UI acceptance |
| Source | GitHub issue #36 (parent PRD #1, audit finding AUD-09) |
| Dependencies | #31 (UI-01) and #34 (UI-04) merged; none blocking |
| Likely code area | `src/features/candidates/*`, `src/review-harness/clients.ts`, `e2e/ui06-*.spec.ts`, `playwright.review.config.ts`, `docs/evidence/ui-06/` |
| Builder | Sisyphus-Junior (visual-engineering, skills: frontend, playwright) |
| Critic | Independent Sisyphus-Junior (harsh, evidence-backed) |
| Status | Building |
| Required checks | `npm run check`, `npm run test:e2e:review`, evidence capture (`CAPTURE_UI06_EVIDENCE=true`) |

## (Task)

**Work item:** #36 — UI-06 Complete Candidate Share and Trip Ideas UI acceptance
**Source:** GitHub issue #36; parent PRD #1; audit finding AUD-09; prerequisites #31/#34 merged.
**Outcome:** A reviewer using the local-only review build can complete the Candidate Share flow and the Trip Ideas flow end to end, for every documented role and permission boundary, with distinct actionable states for expired, revoked, invalid-link, empty, and network-failure, matching `DESIGN.md` / `DESIGN_SYSTEM.md` and the PRD.

**In scope:**
- Creation, viewing, editing, sharing, expiry, invalid-link, and permission states for Candidate Shares.
- Trip Ideas discovery, detail, save/use, empty, unavailable, and error states.
- Connect both flows to the seeded shopper scenarios (shopper-a sender, shopper-b recipient) and the approved visual system.
- Stateful review-harness support so writes (accept/dismiss/block/revoke/send/save/update/delete/unblock) are demonstrable, not just reads.
- ui06 Playwright contract spec (content/state/interaction assertions, not visibility-only) registered in `playwright.review.config.ts`.
- `docs/evidence/ui-06/README.md` mirroring the ui-05 pattern (ordered PO URLs, acceptance matrix, capture command) plus desktop/tablet/mobile PNG evidence.

**Out of scope:**
- Production backend/schema changes, real email or routing, other feature seams (auth, stores, catalog, trips), new dependencies, design-system changes.

**Acceptance (verbatim from ticket):**
1. A reviewer can complete both flows end to end for every documented role and permission boundary.
2. Expired, revoked, invalid, empty, and network-failure states are distinct and actionable.
3. Shared content exposes only the information authorized by the PRD.
4. Responsive and keyboard behavior matches the design contract.

**Definition of done (verbatim from ticket):**
- Desktop, tablet, and mobile screenshots from the local review build.
- Keyboard-only operation and visible focus.
- Reflow at 200% zoom with no loss of content or function.
- All actionable targets ≥ 48 × 48 px.
- Focus moves to the page H1 after client-side navigation.
- Exercise loading, empty, error, blocked, and success states where applicable.
- Compare the result directly with `DESIGN.md`, `DESIGN_SYSTEM.md`, and the applicable PRD sections.
- Playwright contract assertions for required content, state, and interaction, not visibility-only checks.
- Human-review URL and ordered review instructions.
- Do not close based on green CI alone; attach the required evidence.

**Constraints:**
- Local-only, secret-free review harness (ui-05 precedent): synthetic in-memory identities/data, deterministic `?reviewAs=&reviewState=&reviewSession=` URLs, no production call.
- `VITE_REVIEW_HARNESS=true` + `npm run dev:review -- --host 127.0.0.1 --port 4174`.
- Follow existing repo conventions (Age-Inclusive Usability Baseline, non-color-only status, labeled placeholders, no invented photos).
- All candidate files are clean LF; a known display-layer defect in this environment garbles some multi-line tool output — trust `node -e` single-value probes when output looks duplicated, and never "fix" imagined line endings.

## (Build Method)

**Builder:** one Sisyphus-Junior (visual-engineering) owning `src/features/candidates/*`, the candidate section of `src/review-harness/clients.ts`, `e2e/ui06-*.spec.ts`, `playwright.review.config.ts` (testMatch only), and `docs/evidence/ui-06/*`.

**Checks:**
1. `npm run check` (typecheck + lint + format + test + test:release + build) — must pass.
2. `npm run test:e2e:review` — must pass.
3. Evidence capture: `$env:CAPTURE_UI06_EVIDENCE='true'; npx playwright test e2e/ui06-*.spec.ts --config playwright.review.config.ts --grep "evidence when explicitly requested"; Remove-Item Env:CAPTURE_UI06_EVIDENCE` — writes PNGs to `docs/evidence/ui-06/`.

**Critic:** independent sub-agent with the raw issue, diff, test output, and runtime artifacts; must inspect actual diff/artifacts, not prose.

**Loop:** builder evidence → critic verdict → targeted rework → re-verification, until WOWED or a genuine blocker is proven.

## (Bar to stop)

- All four acceptance criteria demonstrated in the review build with captured evidence.
- All DoD items evidenced (screenshots, keyboard/H1-focus, 200% reflow, 48×48 scan, state coverage, design comparison, contract assertions, ordered review instructions).
- `npm run check` and `npm run test:e2e:review` green; existing tests not deleted or weakened.
- No work-item-relevant actionable critic finding remains; integration sound.
- Claims backed by captured evidence (PNGs + README); no closing of the issue or external GitHub action without explicit user request.
