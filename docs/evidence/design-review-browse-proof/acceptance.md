# Browse responsive and accessibility evidence

## Candidate

- Issue/spec: [#503](https://github.com/samarquis/AntiqueTrail/issues/503), under [#498](https://github.com/samarquis/AntiqueTrail/issues/498)
- Owner/chat: #503 worker
- Risk: low, evidence report only
- Baseline SHA: `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`
- Candidate SHA: reviewed report commit `f37e877b04f7104f8b7f98d1a2bf87a44d306df5` on [PR #513](https://github.com/samarquis/AntiqueTrail/pull/513); browser evidence applies to source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`.
- Diff fingerprint: PR #513 metadata records final-head SHA and raw-byte result from `git diff --binary --full-index 68751a42c9a05d1ffd7c129d8f1f409dccd1775a...HEAD | git hash-object --stdin`. Independent Standards receipt, this task's 2026-10-03 handoff: reviewed PR #513 at `f37e877b04f7104f8b7f98d1a2bf87a44d306df5`; no safety/runtime scope issue; criterion gaps explicit.
- Worktree/branch: isolated `codex/issue-503-browse-evidence`
- Evidence captured at: 2026-10-03; source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; four local Chromium runs completed

## Scope

Changed outcome: map current Browse coverage, record browser results on the exact candidate, identify gaps, and refresh affected evidence after accepted UI changes reach the integration candidate.

Excluded scope: product, test, and configuration changes; provider or database operations; hosted accounts; production acceptance; the #487 receipt and #488 human gates.

Overlapping branches/worktrees checked at admission: no competing #503 owner, branch, worktree, or open PR. #496 is closed by merged PR #497 at this baseline. #500 used its own worktree; #506 owns composition. No sibling worktree was edited.

Pre-existing failures or unrelated work: #496's light-theme Browse eyebrow contrast finding was fixed by merged PR #497 at the baseline. Keep that history visible, but do not report the old failure as a current result. All selected local suites passed at the baseline SHA below.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Viewports, themes, results layout | Review 320, 390, 800, and 1280 CSS-pixel widths in settled light and dark themes; narrow results use one column; no primary overflow. | Named Chromium runs; inspect existing assertions for uncovered conditions. | Runs passed. #147 covers 320, 393, 768, and 1280 in both themes; #410 covers 320 and 1280 in both themes; `e2e/catalog.spec.ts` uses 390 for cover and hero checks. No exact 800-pixel render or explicit rendered column-count assertion. |
| Targets, keyboard focus, mobile navigation | Interactive targets are at least 48 by 48 CSS pixels; keyboard focus remains visible; mobile navigation does not cover result actions. | `e2e/catalog.spec.ts`; `e2e/issue-147-catalog-metadata.spec.ts`; `e2e/issue-410-browse-controls.spec.ts`. | Selected target-size, skip-link, action-focus, hit-target, and navigation-overlap assertions passed. Physical-device and assistive-technology checks not run. |
| Loaded, draft/applied, empty, loading, error, missing cover | Twelve loaded results; draft and applied filter behavior; empty/Clear; loading; error/Retry; failed cover fallback. | Existing catalog, Browse-controls, and metadata specs. | Twelve-card, empty/Clear, loading/error-heading, and failed-cover assertions passed. Error Retry is rendered but not clicked; #410 applies and clears a category filter but does not assert result preservation before Apply. |
| Accessibility settings | 200%-equivalent reflow, WCAG text spacing, forced colors, and reduced motion are mapped to evidence. Device and assistive-technology coverage is explicit. | Existing catalog, metadata, and theme tests. | Selected reflow, text-spacing, and forced-colors assertions passed. The global reduced-motion rule is not asserted; physical-device and assistive-technology checks not run. |
| Failure and skip record | Classify each selected-suite failure or skip by assertion and exact SHA; preserve known #496 history. | Four zero-retry runs at the named source SHA. | 69 passed; zero failed or skipped. #496 is merged in PR #497 at baseline `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; its pre-merge contrast failure is not a current result. |
| Final-source validity | Refresh affected coverage after accepted notice, filter, and contrast changes are composed. | Run affected coverage on #506's frozen integration SHA. | Pending. This baseline map does not establish final integration acceptance. |

### Source map

- `e2e/catalog.spec.ts`: target-size helper at line 14; keyboard skip link at 123; filters/search at 215; failed-cover fallback at 359; loaded, empty, Clear, and not-found at 381; 320-pixel reflow at 407; keyboard-operated detail action at 431; shopper navigation geometry at 565.
- `e2e/issue-410-browse-controls.spec.ts`: theme/width matrix at lines 5-10; actual `data-theme` assertion after navigation at 55-62; control contrast and dark keyboard focus at 69-99; search, Clear, Apply, and keyboard Apply at 114-140.
- `e2e/issue-147-catalog-metadata.spec.ts`: synthetic success path, viewport matrix, and theme assertion at lines 4-26; card geometry, 48-pixel target checks, overflow, hit targets, and fixed-navigation overlap at lines 50-253; twelve-card and failed-cover cases at 264-311; loading, empty, and error headings at 313-344; 200%-equivalent reflow at 346-360; WCAG text spacing at 363-376.
- `e2e/issue-496-category-contrast.spec.ts`: full-main Axe scans on Browse and Details in light and dark themes, plus a 320-pixel Details forced-colors check. It is included because merged PR #497 fixed the known category and Browse-eyebrow contrast finding.
- `e2e/theme.spec.ts`: system preference at 9; saved toggle and reload at 19; shared form-control focus and forced-colors checks at 231.
- `src/features/catalog/states.tsx`: the error fixture shows a Retry button at lines 1-11. `src/app/styles.css` applies reduced motion at lines 2396-2403; no selected E2E spec asserts this rule.
- `src/app/styles.css`: `.catalog-grid` uses one column through 1023 pixels at lines 2104-2111; mobile primary navigation is fixed at the bottom within the same breakpoint at lines 2143-2166. Source rules do not substitute for rendered proof.

Theme note: #496's light/dark Browse and Details navigations assert `data-theme`, and its init script reseeds the chosen theme before each navigation. The final 320-pixel Details navigation omits that assertion. `e2e/theme.spec.ts` separately checks manual-choice persistence after reload; selected cases and remaining navigation gaps are listed below.

## Verification

Baseline browser commands, all Chromium, one worker, zero retries:

```powershell
$env:npm_config_cache = Join-Path ([IO.Path]::GetTempPath()) 'issue-503-npm-cache-20261003'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path ([IO.Path]::GetTempPath()) 'issue-503-playwright-browsers-20261003'
npx playwright test e2e/catalog.spec.ts --project=chromium --workers=1 --retries=0 --grep "provides a keyboard skip link to the single main landmark"
npx playwright test e2e/catalog.spec.ts e2e/issue-410-browse-controls.spec.ts e2e/issue-147-catalog-metadata.spec.ts --project=chromium --workers=1 --retries=0
npx playwright test e2e/issue-496-category-contrast.spec.ts --project=chromium --workers=1 --retries=0
npx playwright test e2e/theme.spec.ts --project=chromium --workers=1 --retries=0 --grep "follows the system color scheme when no choice is saved|manual toggle persists across reloads and beats the system preference|shared form controls retain semantic contrast, keyboard focus, and forced-colors boundaries"
```

Preparation receipt, 2026-10-03: the repository declares `packageManager: npm@11.13.1`, but the configured public npm registry returned `E404` for that version; `npm@11.13.0` is available. Using Node `v24.11.1` and npm `11.13.0`, the following isolated install completed from the unchanged lockfile and added 589 packages in 56 seconds:

```powershell
$env:npm_config_cache = Join-Path ([IO.Path]::GetTempPath()) 'issue-503-npm-cache-20261003'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path ([IO.Path]::GetTempPath()) 'issue-503-playwright-browsers-20261003'
npm ci --no-audit --no-fund
npm exec -- playwright install chromium
```

`npm ls @playwright/test --depth=0` reports `1.62.1`. The lockfile SHA-256 remained `9EAD47950D78E5E5D1F0B3E69DD43E1AE333AAC85C649B72328CB16625B4DDC9`.

`npm exec -- playwright install chromium` completed with Playwright `1.62.1`, downloading Chromium `151.0.7922.34` (revision `1234`), headless shell, and its support binaries into the dedicated `issue-503-playwright-browsers-20261003` directory. Chromium and headless-shell executables are present. The task-specific npm cache is `issue-503-npm-cache-20261003`. Both locations were absent before preparation.

Selected runner is `playwright.config.ts`; alternate `playwright.review.config.ts` binds 4174. `vite.config.ts` sets port 4173 with `strictPort: true`; Playwright starts `npm run dev:review -- --host 127.0.0.1` with `reuseExistingServer: false` and `VITE_COMMERCIAL_RESEARCH_REVIEW=true`. `.env.review` enables `VITE_REVIEW_HARNESS=true`. In review mode, `configuredComposition.ts` returns `createReviewHarnessCatalogClient` before the configured Supabase client path; the catalog adapter wraps `demoCatalogClient`, and `reviewAs`/`reviewState` select in-memory fixtures. The selected Browse cases require no Docker, database, or provider service. Application traffic uses local Vite and synthetic fixtures.

| Layer | Command or flow | Result | Applies to SHA/environment |
| -------------------------- | --------------- | ------ | -------------------------- |
| Focused tests | Commands above; four sequential Chromium runs, one worker, zero retries. | 69/69 passed. See run receipts below. | Source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; Node `v24.11.1`; npm `11.13.0`; package declares unavailable npm `11.13.1`; Playwright `1.62.1`; Chromium revision `1234`. |
| Type/lint/format/build | Not applicable to report-only change; required CI will be recorded at PR head. | Pending PR checks. | Report-only candidate; PR head pending. |
| Database/RLS/RPC | Not applicable. | Not run. | No database or provider operation authorized. |
| Browser/UI | Synthetic review-fixture Chromium runs at 4173. | Passed at source SHA above; Playwright closed each fresh Vite server and browser context. Port 4173 was clear after every run. | `playwright.config.ts` and `.env.review`; local Vite only. No database/provider operation is part of these Browse cases. |
| Accessibility/error states | Catalog metadata, Browse controls, category contrast, and focused theme specs. | Selected assertions passed; physical-device and assistive-technology evidence not run. Theme assertion gaps are listed below. | Synthetic review fixture only. |
| Hosted/provider lifecycle | Out of scope. | Not run. | No hosted accounts or provider state changed. |
| Canonical production route | Out of scope. | Not run. | No deployment authority used. |

## Run receipts

All runs used source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`, Chromium, `--workers=1`, `--retries=0`, port 4173, and the fresh-server Playwright configuration. Each command exited `0`.

| Run ID | Command from block above | Result | Observed process IDs; post-run port |
| ------ | ------------------------ | ------ | ----------------------------------- |
| `issue503-bootstrap-20261003T190733Z` | Keyboard skip-link bootstrap. | 1 passed; 43.0s. | PowerShell `32428`; WebServer Node `19092`, `23928`; worker Node `30356`; 4173 clear. |
| `issue503-core-20261003T191253Z` | Catalog, Browse controls, and catalog metadata. | 63 passed; 5.0m. | PowerShell `30944`; WebServer Node `11268`, `4356` (4173 listener); worker Node `9640`; all owned processes exited; 4173 clear. |
| `issue503-contrast496-20261003T192305Z` | #496 category-contrast regression. | 2 passed; 1.0m. | PowerShell `20772`; WebServer Node `34412`, `27944`; worker Node `13888`; 4173 clear. |
| `issue503-theme-20261003T192531Z` | Focused theme tests from the grep expression above. | 3 passed; 25.5s. | PowerShell `31712`; WebServer Node `34000`, `32116`; worker Node `13732`; 4173 clear. |

Cleanup receipt: Playwright closed each run's browser context and fresh Vite server. Post-run checks found zero 4173 listeners. At final check, the Node webServer PIDs were gone; PID `13732` had been reused by Windows `WmiPrvSE`, not by a test process. The run did not kill any process. Port 4174 was not used. Parent's final handoff check at `2026-10-03T19:28:37Z` found both 4173 and 4174 empty. `test-results` was absent before the first run; only the run-owned `.last-run.json` remains afterward.

Screenshot preservation: `CAPTURE_ISSUE_147_EVIDENCE` was unset for the core run. Pre-run SHA-256 manifest covered 22 tracked files under `docs/evidence/issue-147`; manifest file SHA-256 was `004F5A52A2FFAE5A9521A2ACD7A39B14BB1EBBF769E8D30886B12C0369EEF3B0`. Post-run comparison found zero changed assets and required zero restores.

Theme verification: `issue-410-browse-controls.spec.ts` asserts `html[data-theme]` after each of its four themed Browse navigations; `issue-147-catalog-metadata.spec.ts`'s `openCatalog` helper asserts it after each navigation; both passed. #496 asserts the attribute after its light/dark Browse and Details navigations. Its later 320-pixel Details navigation lacks a `data-theme` assertion, so that settled value is not claimed. The focused theme tests' first two cases assert after navigation/reload. The shared-controls case checks light/dark computed colors and forced-colors behavior but lacks direct `data-theme` assertions after its initial navigation and reloads. General catalog route hops in `catalog.spec.ts` also lack per-navigation theme assertions. Other `theme.spec.ts` cases excluded by the grep were not run.

## Security and negative proof

- Denied identities/scopes: not applicable to this public Browse evidence report.
- Failure and timeout behavior: all selected zero-retry assertions passed. Loading/error query values are synthetic fixtures, not service failure proof.
- Secret/PII handling: no secrets, personal paths, or real shopper data belong in this public report.
- Security review: no security-sensitive source changed.

## Independent review

- Reviewer: pending
- Standards verdict: pending
- Spec verdict: pending
- Final verdict: `BLOCKED`
- Findings and disposition: Browser execution passed at baseline SHA; exact candidate review and final-source refresh remain pending.

## Unverified

- Whether the repository's declared npm `11.13.1` can be restored from a future registry source; the configured public registry does not publish it. The completed lockfile install used npm `11.13.0`.
- Exact 800-pixel rendering, explicit rendered one-column count, filter draft preservation before Apply, Retry behavior, reduced-motion behavior, and physical-device/assistive-technology use.
- Settled theme is not asserted after the later 320-pixel #496 Details navigation, the shared-controls theme test's initial navigation/reloads, or every general catalog route hop; see theme verification above.
- Final source after #500 and any accepted filter change are composed by #506.
- Hosted and canonical production behavior, which this issue excludes.

## Invalidation

This report applies only to the named candidate and synthetic review fixture. Refresh affected browser evidence after a relevant source, configuration, or fixture change, then record the exact integration SHA. Compute the report diff fingerprint with:

```powershell
git diff --binary --full-index 68751a42c9a05d1ffd7c129d8f1f409dccd1775a...<candidate-sha> | git hash-object --stdin
```
