# Issue #142 verification receipt

Date: 2026-08-30

Base: `e1899659fbfdcd0647b4fdced50c901fa71f2cf4`

Source candidate: `44d49c04589ca7d65b30a9aec260d862cb52ba4f`

## Local verification

| Command | Result |
| --- | --- |
| `npm test -- --run src/app/styles.test.ts src/features/catalog/demoClient.test.ts` | 2 files, 37 passed |
| `npm run check` | 88 files / 600 unit tests passed; 65 release-contract tests passed; production build passed |
| `npm run security:contract` | Passed |
| `node --test scripts/plan-governance-contract.test.mjs` | 7 passed |
| `git diff --check` | Passed |
| `CAPTURE_ISSUE_142_EVIDENCE=1 npx playwright test --config playwright.review.config.ts e2e/theme.spec.ts` | 78 passed; 14 desktop captures written to `rendered/` |
| `npx playwright test --config playwright.review.config.ts e2e/theme.spec.ts e2e/issue-143-media-overlay.spec.ts e2e/issue-144-typography.spec.ts --workers=3` | 274 passed, 62 expected project skips |

The browser matrix uses three workers because the unthrottled four-worker run produced an unrelated #144 aggregation timeout; its isolated retry passed 3/3. The final three-worker matrix above passed every selected executable test.

## Scope and evidence notes

- `git diff --name-only` from the base contains no protected plan or design file.
- The static contract covers reusable CSS literals, fixed media values, approved theme pairs, derived aliases, forced-colors system values, and documented art exceptions.
- Browser evidence includes distinct Portal and Partner routes, both themes, all configured viewports, actual stale/honesty and alert/error surfaces, focus and forced-colors checks.
- Hosted checks, merge, and post-merge evidence are pending PR creation and are not represented as local passes.
