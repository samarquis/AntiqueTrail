# Issue #149 Store Portal status grouping — 2026-08-29

## Scope and outcome

`PortalHomePage` now places the existing store listing state, timezone, hours verification, provenance, and pending controlled-change information in one named **Store status** surface. An overdue/stale/unknown hours state includes the explicit next step and **Update Hours** link in that surface; a verified state omits that redundant primary action. The existing preview is still available as a secondary action, and pending work is explicitly described as not public.

## Fresh verification

- `npx vitest run src/features/portal/components.test.tsx --reporter=dot`: **1 file, 14 passed**. The new focused cases cover verified/empty, attention-required/non-empty, loading/error, and retained M-01 gate copy.
- `npm run typecheck`: passed.
- `npx eslint src/features/portal/components.tsx src/features/portal/components.test.tsx e2e/ui08-partner-portal.spec.ts`: passed.
- `npx prettier --check src/features/portal/components.tsx src/features/portal/components.test.tsx src/app/styles.css e2e/ui08-partner-portal.spec.ts gates/issue-149.md`: passed.
- `npx playwright test e2e/ui08-partner-portal.spec.ts`: passed (`test-results/.last-run.json` reports `status: passed`). The scoped status case verifies the attention action, secondary preview, non-public pending copy, and no document overflow at 390 and 320 CSS pixels. Existing UI-08 cases cover loading, error, blocked, permission-denied, and M-01 fixture paths.
- `CAPTURE_ISSUE_149_EVIDENCE=1 npx playwright test e2e/ui08-partner-portal.spec.ts --grep "captures issue 149 status evidence" --reporter=line`: **2 passed** (Chromium and mobile projects), producing the six dated run artifacts below.

## Rendered fixture artifacts

- `chromium-desktop.png`, `chromium-mobile-390.png`, `chromium-mobile-320.png`
- `mobile-desktop.png`, `mobile-mobile-390.png`, `mobile-mobile-320.png`

## Evidence boundary

The browser runs use the deterministic local review harness and its synthetic representative store. They demonstrate semantic grouping, responsive geometry, focusable client-side navigation, and fail-closed rendered states. They do **not** establish production provider configuration, authentication/session behavior, RPC/RLS authorization, database persistence, media capability enforcement, or hosted CI; #149 deliberately changes none of those surfaces.
