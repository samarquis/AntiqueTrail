## Ticket

Closes #142

## Reason addressed

The shared stylesheet mixed raw palette values and role-specific semantic meanings at reusable UI boundaries, allowing light/dark behavior, status communication, and contrast to drift.

## Plan requirements

- `DESIGN_SYSTEM.md` — `Visual tokens / Color`
- `DESIGN.md` — `Visual language`
- `PRD.md` — `Usability and accessibility`
- `PRODUCT_DECISIONS.md` — `Listing freshness and stale behavior`

## Plan conformance

Conforming work; no plan change.

## Acceptance evidence

- Semantic aliases cover shared shell, navigation, controls, forms, statuses, errors, and media-overlay boundaries in both themes.
- The static token contract has focused mutation coverage for raw literals, incomplete theme pairs, and allowed exceptions.
- Cross-role rendered evidence covers public, shopper, Portal, partner, Administrator, stale-status, and error surfaces.
- `docs/evidence/issue-142/verification.md` records the exact required unit and browser receipts.

## Verification

- `npm test -- --run src/app` — 5 files, 76 passed.
- `npx playwright test --config playwright.review.config.ts e2e/theme.spec.ts e2e/issue-143-media-overlay.spec.ts e2e/issue-144-typography.spec.ts` — 274 passed, 62 expected skips.
- `npm run check`, `npm run security:contract`, `node --test scripts/plan-governance-contract.test.mjs`, and `git diff --check` passed.
- Hosted checks are pending this draft PR.

## Plan change authorization

Not a plan change.
