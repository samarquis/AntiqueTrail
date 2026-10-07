# Gauntlet contract — UI-09 (issue #39)

## Ledger

| Field | Value |
|---|---|
| Work item | #39 — UI-09 Complete Admin, moderation, and operational UI acceptance |
| Source | GitHub issue #39 (parent PRD #1, audit finding AUD-09) |
| Dependencies | #31 (UI-01) and #34 (UI-04) merged; none blocking |
| Likely code area | `src/app/App.tsx` (AppClients + admin route wiring), `src/review-harness/clients.ts` (admin + partnerAdmin + reviews sections), `src/review-harness/clients.test.ts`, `e2e/ui09-*.spec.ts`, `playwright.review.config.ts` (testMatch only), `docs/evidence/ui-09/`, `.planning/UI09_CONTRACT.md` |
| Builder | In-session (Sisyphus). `task()` delegation is broken this session (oh-my-openagent config root cause, documented; not retried). Independent critic pass required. |
| Critic | Independent self-review pass over the raw issue, diff, test output, and runtime artifacts — inspects actual behavior, not prose |
| Status | Building |
| Required checks | `npm run check`, `npm run test:e2e:review`, evidence capture (`CAPTURE_UI09_EVIDENCE=true`) |

## (Task)

**Work item:** #39 — UI-09 Complete Admin, moderation, and operational UI acceptance
**Source:** GitHub issue #39; parent PRD #1; audit finding AUD-09; prerequisites #31/#34 merged.
**Outcome:** A reviewer using the local-only review build, as the MFA-verified `administrator` scenario, can review and resolve every documented queue item (admin review cases, partner claims, moderation cases) with auditable outcomes, manage Store Representative scopes and duplicate merges, and see the operational-status route inside the application landmark and design system — with every non-admin role denied — matching `DESIGN.md` / `DESIGN_SYSTEM.md` and the PRD.

**In scope:**
- **`AppClients.admin` wiring gap (the critical fix):** `AppClients` in `src/app/App.tsx` has no `admin` field; `/admin` renders `<ReviewQueuePage />` and `/admin/access` renders `<AccessSafetyPage />` with the `unavailableAdminClient` default, so the queue and access-safety views can never show data in the review build. Add `admin?: AdminClient` to `AppClients`, derive `const adminClient = clients.admin ?? unavailableAdminClient`, and pass `client={adminClient}` to both pages (mirroring the other client derivations at App.tsx:638-647).
- A stateful review-harness `adminClient(scenario, state)` (`src/review-harness/clients.ts`) implementing the **full** `AdminClient` interface in `src/features/admin/adminClient.ts` (all 9 methods: `listCases`, `getCase`, `decideCase`, `listStoreGrants`, `previewStoreScopeChange`, `changeStoreScope`, `previewDuplicateMerge`, `executeDuplicateMerge`, `rollbackDuplicateMerge`). Writes mutate fixture state; reads return it.
  - Seeded fixtures: one review case (store change, pending/assigned with exact context, allowed actions + audit history) so the queue opens into record detail; one active Store Representative grant (Blue Finch Curios → River) so Revoke/Preview regrant/Confirm regrant flow; a duplicate-merge preview (canonical + duplicate with safe references and quarantined conflicts) so Preview → Execute → Roll back flow; decideCase removes the case from the list with an auditable outcome.
  - **Role gating**: Administrator allowed; shopper, representative, anonymous denied (the `requireRole` pattern).
  - **States**: `success` (seeded cases/grants), `empty` (no cases / "No assigned review cases." / "No Store Representative scopes."), `loading` (pending), `error`/`blocked`/`permission-denied` (reject `GENERIC_ADMIN_FAILURE`).
- **Admin session honesty:** the `administrator` harness scenario already produces an MFA-verified, recently-authenticated session (`sessionFor` sets `mfaVerified: true`, `passwordAuthenticatedAt`, `mfaVerifiedAt`), so `AuthenticatedAdminGuard` → `adminSessionFromAuth` passes in the review build with no override. The review build must assert the guard works: administrator reaches the admin routes; anonymous/shopper/representative are redirected away (denied). Do not weaken `AuthenticatedAdminGuard` or add a test-only override path.
- **Extend `partnerAdminClient` fixture** with the 2 missing methods (currently spread from `unavailablePartnerAdminClient` and rejecting): `decide` (all `PartnerAdminOperation`s: changes/conflict/approve/reject/revoke/recheck/transfer — mutations honor `expectedVersion`, produce an updated `PartnerAdminCase`) and `verifySignal` (verify/reject on the seeded pending signal, producing the updated case). Keep `getCase`/`issueSyntheticInvitation` intact.
- **Extend `reviewClient` fixture** with the 1 missing method: `decideModerationCase(caseId, input)` (currently spread from `unavailableReviewClient` and rejecting) — honors `ModerationDecisionInput` (action hold/remove/restore/dismiss_report + reason + mfaVerified + recentAuthAt), mutates the seeded moderation case state, returns the updated case. Keep `listModerationCases` intact.
- ui09 Playwright contract spec (`e2e/ui09-admin-moderation.spec.ts`, content/state/interaction assertions, not visibility-only) registered in `playwright.review.config.ts` testMatch, mirroring the ui07 spec structure and helpers (role denial, review queue open + decide, access-safety revoke/regrant/merge, partner-admin decision + signal verify, moderation decide, operational status, honest states, 48×48, keyboard/focus, evidence capture).
- Evidence capture test gated by `CAPTURE_UI09_EVIDENCE`, writing PNGs to `docs/evidence/ui-09/` (desktop/tablet/mobile).
- `docs/evidence/ui-09/README.md` + `SPEC.md` mirroring the ui-05/ui-06/ui-07 pattern.
- Unit tests in `src/review-harness/clients.test.ts` for the admin fixture, partner-admin decide/verifySignal, and review decideModerationCase (role denial, state honesty, mutation, version conflicts).

**Out of scope:**
- Production backend/schema changes, real administration data, real moderation/claim decisions, other feature seams (auth, stores, catalog, candidates, trips, portal, partner onboarding), new dependencies, design-system changes.
- The `/status` route already renders inside the application landmark (`<main>` within `AppShell` at App.tsx:683-690) with the design system; the honest S-01 not-configured state ("Operational contacts are not published until the S-01 monitoring and response gate is fully configured.") is the correct current state — do **not** fabricate operational contacts or a ready state in the harness.
- Silent skips are forbidden: if comparison with `DESIGN.md` reveals a required admin/moderation/operational element the app lacks, **report it as a design-gap finding with evidence** in the handoff instead of expanding the build or pretending it exists. Minimal production UI additions are allowed only when directly required by an acceptance criterion and called out explicitly.
- Do not modify production seams beyond the explicit gap-flag rule above. Do not delete or weaken existing tests.

**Acceptance (verbatim from ticket):**
1. An Admin can review and resolve every documented queue item with an auditable outcome.
2. Destructive or high-impact actions require clear confirmation and show consequences.
3. Non-admin roles cannot access privileged data or actions.
4. Operational and moderation states are accessible and reviewable locally.

**Definition of done (verbatim from ticket):**
- Provide desktop, tablet, and mobile screenshots from the local review build.
- Verify keyboard-only operation and visible focus.
- Verify reflow at 200% zoom with no loss of content or function.
- Measure all actionable targets against the 48 x 48 px minimum.
- Move focus to the page H1 after client-side navigation.
- Exercise loading, empty, error, blocked, and success states where applicable.
- Compare the result directly with `DESIGN.md`, `DESIGN_SYSTEM.md`, and the applicable PRD/supporting documents.
- Add Playwright contract assertions for required content, state, and interaction, not visibility-only checks.
- Provide a human-review URL and ordered review instructions.
- Do not close based on green CI alone; attach the required evidence.

**Constraints:**
- Local-only, secret-free review harness (ui-05/ui-06/ui-07 precedent): synthetic in-memory identities/data, deterministic `?reviewAs=&reviewState=&reviewSession=` URLs, no production call.
- `VITE_REVIEW_HARNESS=true` + `npm run dev:review -- --host 127.0.0.1 --port 4174`.
- Follow existing repo conventions (Age-Inclusive Usability Baseline, non-color-only status, labeled placeholders, no invented photos). Keep the "Shopper activity is never shown here", "Submitted fields are read-only", and "Only channel metadata is shown here" disclosures intact.
- All candidate files are clean LF; a known display-layer defect in this environment garbles some multi-line tool output — trust `node -e` single-value probes when output looks duplicated, and never "fix" imagined line endings.

## (Build Method)

**Builder:** in-session (Sisyphus) owning `src/app/App.tsx` (AppClients.admin + route wiring only), `src/review-harness/clients.ts` (admin + partnerAdmin + reviews sections), `src/review-harness/clients.test.ts` (new fixtures), `e2e/ui09-admin-moderation.spec.ts`, `playwright.review.config.ts` (testMatch only), `docs/evidence/ui-09/*`.

**Checks:**
1. `npm run check` (typecheck + lint + format + test + test:release + build) — must pass.
2. `npm run test:e2e:review` — must pass.
3. Evidence capture: `$env:CAPTURE_UI09_EVIDENCE='true'; npx playwright test e2e/ui09-*.spec.ts --config playwright.review.config.ts --grep "evidence when explicitly requested"; Remove-Item Env:CAPTURE_UI09_EVIDENCE` — writes PNGs to `docs/evidence/ui-09/`.

**Critic:** independent self-review pass with the raw issue, diff, test output, and runtime artifacts; must inspect actual diff/artifacts, not prose.

**Loop:** build → critic verdict → targeted rework → re-verification, until WOWED or a genuine blocker is proven.

## (Bar to stop)

- All four acceptance criteria demonstrated in the review build with captured evidence (queue items resolved with auditable outcomes; destructive actions confirmed with consequences; non-admin roles denied; operational/moderation states reviewable locally).
- All DoD items evidenced (screenshots, keyboard/H1-focus, 200% reflow, 48×48 scan, state coverage, design comparison, contract assertions, ordered review instructions).
- `npm run check` and `npm run test:e2e:review` green; existing tests not deleted or weakened.
- No work-item-relevant actionable critic finding remains; integration sound.
- Claims backed by captured evidence (PNGs + README); no closing of the issue or external GitHub action without explicit user request.
