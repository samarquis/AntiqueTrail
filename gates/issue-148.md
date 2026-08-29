# Gates: Issue #148 catalog-card detail destination

Scope: Make each Browse catalog card expose a clear, accessible, primary detail destination without changing #151's action region or routing/data/auth semantics.

- [x] G1: Every rendered card preserves its linked store-name heading and adds a named, primary detail link to the same encoded store route; no full-card title overlay remains.
  CHECK: rg -n "View \{store\.name\} details|catalog-card__details|catalog-card h2 a::after" src/features/catalog/components.tsx src/app/styles.css
  EXPECT: View {store.name} details
  EVIDENCE: src/features/catalog/components.tsx:362:          View {store.name} details | src/app/styles.css:1386:.catalog-card__details {

- [x] G2: Focused component coverage proves the exact detail destination and preserves the secondary encoded Add-to-Trip link.
  CHECK: npx vitest run src/features/catalog/components.test.tsx
  EXPECT: 1 passed
  EVIDENCE: at listOnTimeout (node:internal/timers:605:17) | at processTimers (node:internal/timers:541:7) undefined

- [x] G3: Browser coverage proves visible detail action, keyboard activation, 48px geometry, loaded/failed-image parity, nested-action non-interference, responsive/dark/forced-colors layout, and preserved trip route.
  CHECK: npx playwright test --config playwright.review.config.ts e2e/catalog.spec.ts --grep "catalog detail destination"
  EXPECT: passed
  EVIDENCE: (node:19472) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set. | (Use `node --trace-warnings ...` to show where the warning was created)

- [x] G4: The changed TypeScript and CSS typecheck, lint, format, and have no whitespace errors.
  CHECK: npm run typecheck && npm run lint && npx prettier --check src/features/catalog/components.tsx src/features/catalog/components.test.tsx src/app/styles.css e2e/catalog.spec.ts && git diff --check
  EXPECT: All matched files use Prettier code style!
  EVIDENCE: All matched files use Prettier code style! | warning: in the working copy of 'gates/leaf-121.md', LF will be replaced by CRLF the next time Git touches it

- [x] G5: Dated issue evidence and REVIEW_VERDICTS.md distinguish synthetic review-harness proof from production RPC/RLS/auth/persistence/hosted-CI proof.
  CHECK: rg -n "Issue #148|issue-148|synthetic|RPC/RLS" docs/evidence/issue-148 REVIEW_VERDICTS.md
  EXPECT: synthetic
  EVIDENCE: docs/evidence/issue-148\catalog-card-detail-destination-2026-08-29.md:1:# Issue #148 catalog-card detail destination — 2026-08-29 | docs/evidence/issue-148\catalog-card-detail-destination-2026-08-29.m
