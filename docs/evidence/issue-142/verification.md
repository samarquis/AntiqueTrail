# Issue #142 verification receipt

Date: 2026-08-30

Base: `e1899659fbfdcd0647b4fdced50c901fa71f2cf4`

Source candidate: `4763bd22023bce0c7e23d63043f6ba5710f66259`

## Local verification

| Command | Result |
| --- | --- |
| `npm test -- --run src/app/styles.test.ts src/features/catalog/demoClient.test.ts` | 2 files, 37 passed |
| `npm test -- --run src/app` | 5 files, 76 passed |
| `npm run check` | Final source candidate: 88 files / 600 unit tests passed; 65 release-contract tests passed; production build passed |
| `npm run security:contract` | Passed |
| `node --test scripts/plan-governance-contract.test.mjs` | 7 passed |
| `git diff --check` | Passed |
| `CAPTURE_ISSUE_142_EVIDENCE=1 npx playwright test --config playwright.review.config.ts e2e/theme.spec.ts` | 78 passed; 14 desktop captures written to `rendered/` |
| `npx playwright test --config playwright.review.config.ts e2e/theme.spec.ts e2e/issue-143-media-overlay.spec.ts e2e/issue-144-typography.spec.ts` | 274 passed, 62 expected project skips |
| `npx playwright test e2e/issue-147-catalog-metadata.spec.ts` | 86 passed |

The exact issue-specified browser matrix completed unmodified and passed every selected executable test.

## Scope and evidence notes

- `git diff --name-only` from the base contains no protected plan or design file.
- The static contract covers reusable CSS literals, fixed media values, approved theme pairs, derived aliases, forced-colors system values, and documented art exceptions.
- Browser evidence includes distinct Portal and Partner routes, both themes, all configured viewports, actual stale/honesty and alert/error surfaces, focus and forced-colors checks.
- The first hosted run correctly exposed a dependent #147 assertion that assumed every demo card was current; the final source candidate updates that expectation and is awaiting a fresh hosted run. Its database job was independently blocked by the public `pg_prove` image registry rate limit, not a database contract result.
