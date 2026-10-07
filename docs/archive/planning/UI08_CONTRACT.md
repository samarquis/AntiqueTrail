# Gauntlet contract — UI-08 (issue #38)

## Ledger

| Field | Value |
|---|---|
| Work item | #38 — UI-08 Complete partner onboarding and Store Portal UI acceptance |
| Source | GitHub issue #38 (parent PRD #1, audit finding AUD-09) |
| Dependencies | #31 (UI-01) and #34 (UI-04) merged; none blocking |
| Likely code area | `src/review-harness/clients.ts` (partner + portal sections), `src/review-harness/clients.test.ts`, `e2e/ui08-*.spec.ts`, `playwright.review.config.ts` (testMatch only), `docs/evidence/ui-08/`, `.planning/UI08_CONTRACT.md` |
| Builder | In-session (Sisyphus). `task()` delegation is broken this session (oh-my-openagent config root cause, documented; not retried). Independent critic pass required. |
| Critic | Independent self-review pass over the raw issue, diff, test output, and runtime artifacts — inspects actual behavior, not prose |
| Status | Building |
| Required checks | `npm run check`, `npm run test:e2e:review`, evidence capture (`CAPTURE_UI08_EVIDENCE=true`) |

## (Task)

**Work item:** #38 — UI-08 Complete partner onboarding and Store Portal UI acceptance
**Source:** GitHub issue #38; parent PRD #1; audit finding AUD-09; prerequisites #31/#34 merged.
**Outcome:** A reviewer using the local-only review build can complete representative onboarding from an invitation token through consent, identity (E-01 honest gate), draft submission, status, claim, and activation — and complete store maintenance in the Store Portal from editing through submitted controlled changes, updates, official links, and support tickets — matching `DESIGN.md` / `DESIGN_SYSTEM.md` and the PRD, with every documented role boundary enforced.

**In scope:**
- A stateful review-harness `partnerClient(scenario, state)` (`src/review-harness/clients.ts`) implementing the **full** `PartnerClient` interface in `src/features/partners/types.ts` (all 15 methods: `exchangeInvitation`, `resumeInvitation`, `acceptConsent`, `getConsentStatus`, `acceptMaterialTerms`, `bindIdentity`, `getStatus`, `saveDraft`, `submitDraft`, `withdraw`, `submitClaim`, `getClaimStatus`, `submitAuthoritySignal`, `withdrawClaim`, `requestAuthorityRecheck`).
  - **Join journey**: seed a token map entry `review-partner-invite` so `/partner/join?reviewAs=representative&reviewState=success#token=review-partner-invite` (query string before the `#` fragment, mirroring ui07's `ACCEPT_URL`) exchanges to an active invitation with a `resumeHandle`; consent acceptance returns the provisional status (`registration_pending` / `provisional` / `draft`) and honors the sessionStorage resume (the page calls `savePartnerResume`/`clearPartnerResume`).
  - **E-01 honest gate**: `bindIdentity` rejects with `EMAIL_GATE_MESSAGE` ("Email verification is unavailable until the approved email provider gate passes.") — the review build must show the honest blocked state, never a fabricated binding success.
  - **Maintenance states**: `getStatus` in `success` returns the seeded approved onboarding for the representative (invitation `consumed`, pendingIdentity `bound`, onboarding `approved`, storeScope `Blue Finch Curios`) so `/partner/status` and `/partner/draft` exercise the post-approval experience; `saveDraft`/`submitDraft`/`withdraw` mutate the status (draft → submitted → withdrawn); claim methods return deterministic states (submitted → verification_pending → approved) with `requestAuthorityRecheck`/`withdrawClaim` honored.
  - **Role gating**: representative allowed; shopper, administrator, anonymous denied (honest denial — the same `requireRole` pattern the other fixtures use).
  - **States**: `success` (seeded approved), `empty` (pre-onboarding status: `registration_pending`/`provisional`/`draft`), `loading` (pending), `error`/`blocked`/`permission-denied` (reject `GENERIC_PARTNER_ERROR`).
- Extend the `portalClient` fixture with the **14 missing write flows** (currently spread from `unavailablePortalClient` and rejecting): `saveManagedFields`, `submitControlledChange`, `getMediaCapability`, `uploadOfficialMedia`, `createUpdate`, `archiveUpdate`, `restoreUpdate`, `saveOfficialLink`, `removeOfficialLink`, `createSupportTicket`, `replySupportTicket`, `confirmSupportResolution`, `reopenSupportTicket`, `getDiagnostics`. Writes mutate fixture state; reads return it.
  - **M-01 honest media gate**: `getMediaCapability` returns disabled; `uploadOfficialMedia` rejects with `GENERIC_PORTAL_ERROR` — no fabricated media upload.
  - Keep the existing 7 implemented reads (`getHome`, `getHours`, `saveHours`, `listUpdates`, `listOfficialLinks`, `listSupportTickets`, `previewPublicListing`) intact; role-gate the new writes to Representative.
- Register `partner: partnerClient(scenario, state)` in the `createReviewHarnessClients` return (currently missing — this is the UI-08 wiring gap; the App.tsx routes already pass `clients.partner ?? unavailablePartnerClient`).
- ui08 Playwright contract spec (`e2e/ui08-partner-portal.spec.ts`, content/state/interaction assertions, not visibility-only) registered in `playwright.review.config.ts` testMatch, mirroring the ui07 spec structure and the `assertMinimumTargets`/focus/evidence-capture helpers.
- Evidence capture test gated by `CAPTURE_UI08_EVIDENCE`, writing PNGs to `docs/evidence/ui-08/` (desktop/tablet/mobile).
- `docs/evidence/ui-08/README.md` + `SPEC.md` mirroring the ui-05/ui-06/ui-07 pattern (ordered human-review rows, acceptance matrix, capture command, viewport matrix).
- Unit tests in `src/review-harness/clients.test.ts` for the new partner fixture and the portal write flows (role denial, state honesty, mutation, resume/consent semantics).

**Out of scope:**
- Production backend/schema changes, real email (E-01-gated), media upload (M-01-gated), real invitation issuance, other feature seams (auth, stores, catalog, candidates, trips, admin), new dependencies, design-system changes.
- Silent skips are forbidden: if comparison with `DESIGN.md` reveals a required onboarding/portal element the app lacks, **report it as a design-gap finding with evidence** in the handoff instead of expanding the build or pretending it exists. Minimal production UI additions are allowed only when directly required by an acceptance criterion and called out explicitly.
- Do not modify production seams beyond the explicit gap-flag rule above. Do not delete or weaken existing tests.

**Acceptance (verbatim from ticket):**
1. A reviewer can complete onboarding and store maintenance from invitation through submitted changes.
2. Portal data and actions are limited to the representative's authorized stores.
3. Validation and moderation status are understandable without internal knowledge.
4. Every required state has responsive, accessible evidence.

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
- Local-only, secret-free review harness (ui-05/ui-06/ui-07 precedent): synthetic in-memory identities/data, deterministic `?reviewAs=&reviewState=&reviewSession=` URLs with token fragments (`#token=`) after the real query string, no production call.
- `VITE_REVIEW_HARNESS=true` + `npm run dev:review -- --host 127.0.0.1 --port 4174`.
- Follow existing repo conventions (Age-Inclusive Usability Baseline, non-color-only status, labeled placeholders, no invented photos). Keep the E-01/M-01 gate copy and the "does not grant access or install anything" disclosures intact.
- All candidate files are clean LF; a known display-layer defect in this environment garbles some multi-line tool output — trust `node -e` single-value probes when output looks duplicated, and never "fix" imagined line endings.
- The `???` characters in the fetched issue body are encoding artifacts of the original ticket text ("representative's"); the intent is the possessive form.

## (Build Method)

**Builder:** in-session (Sisyphus) owning `src/review-harness/clients.ts` (partner + portal sections), `src/review-harness/clients.test.ts` (new fixtures), `e2e/ui08-partner-portal.spec.ts`, `playwright.review.config.ts` (testMatch only), `docs/evidence/ui-08/*`.

**Checks:**
1. `npm run check` (typecheck + lint + format + test + test:release + build) — must pass.
2. `npm run test:e2e:review` — must pass.
3. Evidence capture: `$env:CAPTURE_UI08_EVIDENCE='true'; npx playwright test e2e/ui08-*.spec.ts --config playwright.review.config.ts --grep "evidence when explicitly requested"; Remove-Item Env:CAPTURE_UI08_EVIDENCE` — writes PNGs to `docs/evidence/ui-08/`.

**Critic:** independent self-review pass with the raw issue, diff, test output, and runtime artifacts; must inspect actual diff/artifacts, not prose.

**Loop:** build → critic verdict → targeted rework → re-verification, until WOWED or a genuine blocker is proven.

## (Bar to stop)

- All four acceptance criteria demonstrated in the review build with captured evidence (onboarding from invitation token through submitted changes; portal limited to the representative's authorized store; understandable status; responsive accessible evidence).
- All DoD items evidenced (screenshots, keyboard/H1-focus, 200% reflow, 48×48 scan, state coverage, design comparison, contract assertions, ordered review instructions).
- `npm run check` and `npm run test:e2e:review` green; existing tests not deleted or weakened.
- No work-item-relevant actionable critic finding remains; integration sound.
- Claims backed by captured evidence (PNGs + README); no closing of the issue or external GitHub action without explicit user request.
