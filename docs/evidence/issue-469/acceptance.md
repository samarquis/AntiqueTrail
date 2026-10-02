# Issue 469 acceptance

## Candidate

- Issue/spec: https://github.com/samarquis/AntiqueTrail/issues/469.
- Owner/chat: `@samarquis` (issue assignee); Codex ticket task #469 on `codex/issue-469-browse-results-viewport`.
- Risk: standard; synthetic catalog data and presentation behavior only.
- Admission baseline: `c9bb80250d5087ace3638059da09cd628bc1fad6`.
- Current PR base: `5391bd027b4f3df3a3fde85e02c284345d8fe1aa`.
- Source candidate SHA: `a190e85151d998ed0df57eaed7c1d537bd5f320a`.
- Source PR head before this evidence-only update: `a190e85151d998ed0df57eaed7c1d537bd5f320a`.
- Diff fingerprint: `1de55ce809a6123077d704d9ccbb3091028961bd` for changed application and regression-test files against the current PR base.
- Branch: `codex/issue-469-browse-results-viewport` in its isolated ticket worktree.
- Evidence captured at: 2026-10-02 13:16 CDT, local Windows Chromium and Vite review harness.

## Scope

After a search, the Browse hero enters compact results mode, moves imagery attribution clear of filter feedback, and keeps the H1 visible at stacked widths while trimming editorial copy. Compact result cards put the actual linked title before the cover, so the first listing appears in the initial desktop viewport. Card columns and cover dimensions remain unchanged. At 320px, compact spacing and the decorative empty-state illustration are removed so recovery clears the bottom navigation. Active feedback remains inside the search form.

Excluded: card density or image-size changes, catalog data changes, search/filter semantics, database/provider work, deployment, and production publication.

The admission order remains #469 → #470 → #467. Refreshed `origin/main` is `5391bd0`; the intervening #477 and #478 commits touch review surfaces only and do not overlap this ticket's source files.

GitHub CI on prior PR head `81a25b2e469722df12c97c50ea91fee5c2a43bfb` reported 1,089 passed, 1 failed, and 1 skipped. Its only failure was the Store Details focus test matching both the card link and the first-result summary link. The redundant summary link is removed, and the focus assertion is scoped to Store results. CI for current source candidate `a190e851` is pending. An earlier local full-suite run on `f987aa2` had 1,079 passed, 9 failed, and 1 skipped; eight failures were 5-second timeouts and one was an unrelated PasswordReplacement assertion. Those nine passed when rerun serially in the unrelated suites.

## Acceptance

| Criterion                        | Observable pass condition                                                                       | Verification method                                                                           | Result/evidence                                                                                                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search result visibility         | At 1276×720 and 1600×900, count and the actual first card title appear in the initial viewport. | Chromium browser geometry and screenshots.                                                    | Pass: count y=539–570; actual linked “Blue Finch Curios” H2 y=592–656 and link y=600–648. Cover begins below the title and remains 538×359px; grid stays two columns.                                                                                 |
| No-match recovery                | Count/state and recovery action appear without scrolling past the full hero.                    | Chromium browser geometry and screenshots.                                                    | Pass at 1276×720 and 1600×900: heading y=585–616; Clear filters y=659–707. At 1024×900 and 768×900, Clear filters is y=837–885 and y=642–690. At 320×740, heading is y=495–526 and Clear filters y=557–605, above bottom navigation at y=623.         |
| Filter feedback and URL behavior | Feedback stays attached to a stable control surface; search and clear retain URL behavior.      | Chromium form/URL flow.                                                                       | Pass: status remains inside the search form, attribution does not overlap it, Enter yields `/stores?q=Blue+Finch`, Clear returns to `/stores` with 12 stores, and compact results mode remains active.                                                |
| Accessibility and keyboard       | Controls remain labeled and keyboard operable; one visible page H1 remains at each breakpoint.  | Chromium accessible-role queries and keyboard flow.                                           | Pass: one visible H1, labeled search, Search button, card-title link, and keyboard Filters toggle at each viewport. Dark theme, forced-colors, reduced-motion, and text-spacing smoke checks showed no horizontal overflow or caption/status overlap. |
| 200% reflow                      | Narrow layout reflows at the resulting CSS viewport without horizontal scrolling.               | Chromium at a 638×360 CSS viewport and DPR 2, equivalent to 1276×720 physical pixels at 200%. | Pass: narrow breakpoints active, one H1 available, document width 623px versus 638px viewport. This emulates the resulting viewport; browser zoom UI itself was not toggled.                                                                          |
| 320px reflow                     | Layout has no horizontal page scrolling.                                                        | Chromium document/client width comparison.                                                    | Pass: document width 305px; client width 320px.                                                                                                                                                                                                       |

### Rendered evidence

Screenshots use the local review harness, which adds a synthetic “Local review” status banner. Browser console and page errors were empty.

| View                       | Before                                                   | After                                                                             |
| -------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Search, 1276×720           | ![Before search at 1276×720](before-search-1276x720.png) | ![After search at 1276×720](search-1276x720.png)                                  |
| Empty, 1276×720            | ![Before empty at 1276×720](before-empty-1276x720.png)   | ![After empty at 1276×720](empty-1276x720.png)                                    |
| Search, 1600×900           | —                                                        | ![After search at 1600×900](search-1600x900.png)                                  |
| Empty, 1600×900            | —                                                        | ![After empty at 1600×900](empty-1600x900.png)                                    |
| Search and empty, 1024×900 | —                                                        | [Search](search-1024x900.png) · [Empty state](empty-1024x900.png)                 |
| Search and empty, 768×900  | —                                                        | [Search](search-768x900.png) · [Empty state](empty-768x900.png)                   |
| Search and empty, 320×740  | —                                                        | [Search](search-320x740.png) · [Empty state](empty-320x740.png)                   |
| 200% effective viewport    | —                                                        | [Search](zoom200-search-1276x720.png) · [Empty state](zoom200-empty-1276x720.png) |

## Verification

| Layer                       | Command or flow                                                                                                                                                        | Result                                                                                                                                                                                                                               | Applies to SHA/environment                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Focused tests               | `npx vitest run --maxWorkers=1 src/features/catalog/liveEditorial.test.tsx src/features/catalog/components.test.tsx`                                                   | 38 passed, including compact card-title order and restored-focus coverage.                                                                                                                                                           | Source candidate `a190e851`, local Windows checkout.        |
| Typecheck                   | `npm run typecheck`                                                                                                                                                    | Passed.                                                                                                                                                                                                                              | Source candidate `a190e851`.                                |
| Lint                        | `npm run lint`                                                                                                                                                         | 0 errors; 16 existing warnings, none in changed files.                                                                                                                                                                               | Source candidate `a190e851`.                                |
| Format                      | `npx prettier --check src/app/styles.css src/features/catalog/components.tsx src/features/catalog/components.test.tsx src/features/catalog/liveEditorial.test.tsx`     | Passed.                                                                                                                                                                                                                              | Source candidate `a190e851`.                                |
| Release tests               | `npm run test:release`                                                                                                                                                 | 164 passed.                                                                                                                                                                                                                          | Source candidate `a190e851`.                                |
| Build and media             | `npm run build`; `node scripts/verify-seed-media.mjs --built-root dist`                                                                                                | Build passed; 10 paths verified, 0 errors.                                                                                                                                                                                           | Source candidate `a190e851`, local.                         |
| Layout detector             | `npx impeccable detect --json --scope layout src/features/catalog/components.tsx src/app/styles.css`                                                                   | No findings (`[]`).                                                                                                                                                                                                                  | Source candidate `a190e851`.                                |
| Desktop/mobile UI           | Search, no-match, clear, URL, keyboard Filters toggle, visible H1, first card title, and caption/status overlap at 1600×900, 1276×720, 1024×900, 768×900, and 320×740. | All scripted checks passed; no horizontal overflow or console/page errors. At 1276×720 and 1600×900 the actual first card H2 is visible before its unchanged cover; at 320×740 Clear filters ends 18px above bottom navigation.      | Source candidate `a190e851`, local Chromium review harness. |
| 200% reflow                 | Chromium checked search and empty state at a 638×360 CSS viewport with DPR 2.                                                                                          | Narrow layout active; one H1 remains visible; no horizontal overflow. Browser zoom UI itself was not toggled.                                                                                                                        | Source candidate `a190e851`, local Chromium.                |
| Accessibility scope         | Chromium checked labels, one H1 at every tested width, keyboard toggle, dark theme, forced colors, reduced motion, text-spacing override, and 200% effective viewport. | Smoke checks passed. NVDA/VoiceOver screen readers and the current/previous Chrome, Edge, Firefox, Safari, iOS Safari, and Android browser matrix were not run; unverified. Contrast was not separately audited under forced colors. | Local Chromium only.                                        |
| Full unit suite             | GitHub Actions CI on the pushed PR head.                                                                                                                               | CI rerun for source candidate `a190e851` is pending.                                                                                                                                                                                 | Unverified on source candidate until CI completes.          |
| Database/provider lifecycle | Not in issue scope.                                                                                                                                                    | Not run.                                                                                                                                                                                                                             | Unverified.                                                 |
| Canonical production route  | Deployment is separate and not authorized for this ticket.                                                                                                             | Not run.                                                                                                                                                                                                                             | Unverified.                                                 |

## TDD and Project Reflection preflight

- Red proof: original viewport checks showed the first card title below the fold, the H1 clipped at stacked widths, and 320px no-match recovery below bottom navigation.
- Green proof: all 38 focused catalog tests passed, and Chromium confirmed the actual first card title, visible H1, and 320px recovery positions.
- Applied `L-20260927-02`: waited for the actual rendered content node before measuring layout.
- Applied `L-20260930-01`: omitted workstation and vault paths from this shared evidence.
- Applied `L-20260930-02`: verify the live linked-issue state after merge and close it explicitly if still open.
- Rejected `L-20260927-01` as inapplicable: this change adds no public heading or navigation.

## Source fingerprint

Reproduce from the candidate checkout:

```powershell
git diff --binary --full-index 5391bd027b4f3df3a3fde85e02c284345d8fe1aa -- src/app/styles.css src/features/catalog/components.tsx src/features/catalog/liveEditorial.test.tsx src/features/catalog/components.test.tsx | git hash-object --stdin
```

Current source-only fingerprint: `1de55ce809a6123077d704d9ccbb3091028961bd`.

## Independent review and gates

- Updated standards and spec reviews, parent exact-PR-head review, required CI, merge, resulting `main` SHA, and live issue closure remain pending.
- Hosted/provider lifecycle and canonical production route remain unverified because deployment is outside this ticket.
- Any affected source, configuration, fixture, or integration change invalidates corresponding proof.
