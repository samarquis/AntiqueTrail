# Gates: issue #149 — Store Portal status grouping

Scope: group the existing authoritative Portal home snapshot around current status and its safe next action without changing Portal client, RPC, auth, or media behavior.

- [x] G1: Portal Home presents publication state, timezone, hours verification, provenance, and pending-change status as one labelled, non-colour-only Store status surface.
      CHECK: npx vitest run src/features/portal/components.test.tsx --reporter=dot
      EXPECT: Tests
      EVIDENCE: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more informa

- [x] G2: An unverified-hours snapshot keeps its reason and keyboard-reachable Update Hours action in Store status; a verified snapshot has no redundant attention action; pending empty/non-empty copy remains truthful and explicitly non-public.
      CHECK: npx vitest run src/features/portal/components.test.tsx --reporter=dot
      EXPECT: Tests
      EVIDENCE: ⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more informa

- [x] G3: Responsive Portal status has no overflow at 390px and 320px, Preview is visually secondary, and keyboard focus remains visible.
      CHECK: npx playwright test e2e/ui08-partner-portal.spec.ts
      EXPECT: passed
      EVIDENCE: (node:16332) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set. | (Use `node --trace-warnings ...` to show where the warning was created)

- [x] G4: Existing safe loading, generic-error, and capability-gated states remain guarded, and focused source changes typecheck, lint, and format cleanly.
      CHECK: npm run typecheck && npx eslint src/features/portal/components.tsx src/features/portal/components.test.tsx e2e/ui08-partner-portal.spec.ts && npx prettier --check src/features/portal/components.tsx src/features/portal/components.test.tsx src/app/styles.css e2e/ui08-partner-portal.spec.ts gates/issue-149.md
      EXPECT: All matched files use Prettier code style!
      EVIDENCE: Checking formatting... | All matched files use Prettier code style!

- [x] G5: Dated local review-harness screenshots and a scoped verdict distinguish synthetic fixture evidence from production provider/RPC evidence.
      EVIDENCE: 2026-08-29 — six Chromium/mobile artifacts plus command results are in `docs/evidence/issue-149/portal-status-grouping-2026-08-29.md`; the synthetic-harness boundary is appended to `REVIEW_VERDICTS.md`.
