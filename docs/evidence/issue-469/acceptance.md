# Issue 469 acceptance

## Candidate

- Issue/spec: https://github.com/samarquis/AntiqueTrail/issues/469.
- Owner/chat: `@samarquis` (issue assignee); Codex ticket task #469 on `codex/issue-469-browse-results-viewport`.
- Risk: standard; synthetic catalog data and presentation behavior only.
- Admission baseline: `c9bb80250d5087ace3638059da09cd628bc1fad6`.
- Current PR base: `de76d381ca7b522b25c61eea20920569085f3b93`.
- Source candidate SHA: `6d8415f0125bd8bef093dd643c563951ec429d9a`.
- Source PR head before this evidence-only update: `6d8415f0125bd8bef093dd643c563951ec429d9a`.
- Diff fingerprint: `87dcb6d3148b9ca5110d39320a6d621a0222f6f2` for the application and regression-test files listed below against the current PR base.
- Branch: `codex/issue-469-browse-results-viewport` in its isolated ticket worktree.
- Evidence captured at: 2026-10-02 13:47 CDT, local Windows Chromium and Vite review harness.

## Scope

After a search, the Browse hero enters compact results mode, moves imagery attribution clear of filter feedback, and keeps the H1 visible at stacked widths while trimming editorial copy. At desktop widths, the compact hero keeps the search label visible, exposes the Filters toggle, and collapses the advanced panel; the original card order remains cover/placeholder before name. The smaller hero brings the actual linked first-card title into the initial viewport. Card columns and cover dimensions remain unchanged. At 320px, compact spacing and the decorative empty-state illustration are removed so recovery clears the bottom navigation. Active feedback remains inside the search form.

Excluded: card density or image-size changes, catalog data changes, search/filter semantics, database/provider work, deployment, and production publication.

The admission order remains #469 → #470 → #467. `origin/main` advanced to `de76d381` during review. Changes from the prior PR base affect auth/shopper source and test files, with no overlap in this ticket's application source files.

GitHub CI on pre-rebase PR head `efaf864dcf6988bf6975444308cb130bf1a2ab38` passed web (12m05s, including browser tests), database (3m07s), and configured-owner-billing (4m03s); Supabase Preview was skipped. These results diagnose the old base and source only. Fresh CI for the rebased source candidate is pending after push.

## Acceptance

| Criterion                        | Observable pass condition                                                                       | Verification method                                                                           | Result/evidence                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Search result visibility         | At 1276×720 and 1600×900, count and the actual first card title appear in the initial viewport. | Chromium browser geometry and screenshots.                                                    | Pass: count y=246–277; actual linked “Blue Finch Curios” H2 y=666–714. The cover precedes the title and remains 538×359px; grid stays two columns.                                                                                                                                                     |
| No-match recovery                | Count/state and recovery action appear without scrolling past the full hero.                    | Chromium browser geometry and screenshots.                                                    | Pass at 1276×720 and 1600×900: heading y=326–357; Clear filters y=400–448. At 1024×900 and 768×900, Clear filters is y=837–885 and y=642–690. At 320×740, heading is y=495–526 and Clear filters y=557–605, above bottom navigation at y=623.                                                          |
| Filter feedback and URL behavior | Feedback stays attached to a stable control surface; search and clear retain URL behavior.      | Chromium form/URL flow.                                                                       | Pass: status remains inside the search form, attribution does not overlap it, Enter yields `/stores?q=Blue+Finch`, Clear returns to `/stores` with 12 stores, and compact results mode remains active.                                                                                                 |
| Accessibility and keyboard       | Controls remain labeled and keyboard operable; one visible page H1 remains at each breakpoint.  | Chromium accessible-role queries and keyboard flow.                                           | Pass: one visible H1, labeled search, Search button, card-title link, and visible Filters toggle. Keyboard Enter opens the compact desktop panel; category and area controls appear without horizontal overflow. Dark theme, forced-colors, reduced-motion, and text-spacing smoke checks also passed. |
| 200% reflow                      | Narrow layout reflows at the resulting CSS viewport without horizontal scrolling.               | Chromium at a 638×360 CSS viewport and DPR 2, equivalent to 1276×720 physical pixels at 200%. | Pass: narrow breakpoints active, one H1 available, document width 623px versus 638px viewport. This emulates the resulting viewport; browser zoom UI itself was not toggled.                                                                                                                           |
| 320px reflow                     | Layout has no horizontal page scrolling.                                                        | Chromium document/client width comparison.                                                    | Pass: document width 305px; client width 320px.                                                                                                                                                                                                                                                        |

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

| Layer                       | Command or flow                                                                                                                                                                              | Result                                                                                                                                                                                                                                      | Applies to SHA/environment                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Focused tests               | `npx vitest run --maxWorkers=1 src/features/catalog/liveEditorial.test.tsx src/features/catalog/countLabels.test.tsx src/features/catalog/components.test.tsx`                               | 43 passed across 3 files. One existing JSDOM navigation warning was logged after successful completion.                                                                                                                                     | Source candidate `6d8415f0`, local Windows checkout.        |
| Typecheck                   | `npm run typecheck`                                                                                                                                                                          | Passed.                                                                                                                                                                                                                                     | Source candidate `6d8415f0`.                                |
| Lint                        | `npm run lint`                                                                                                                                                                               | 0 errors; 16 existing warnings, none in changed files.                                                                                                                                                                                      | Source candidate `6d8415f0`.                                |
| Format                      | `npx prettier --check src/app/styles.css src/features/catalog/components.tsx src/features/catalog/components.test.tsx src/features/catalog/liveEditorial.test.tsx`                           | Passed.                                                                                                                                                                                                                                     | Source candidate `6d8415f0`.                                |
| Release tests               | `npm run test:release`                                                                                                                                                                       | 164 passed.                                                                                                                                                                                                                                 | Source candidate `6d8415f0`, local checkout.                |
| Build and media             | `npm run build`; `node scripts/verify-seed-media.mjs --built-root dist`                                                                                                                      | Build passed; 10 paths verified, 0 errors.                                                                                                                                                                                                  | Source candidate `6d8415f0`, local.                         |
| Layout detector             | `npx impeccable detect --json --scope layout src/features/catalog/components.tsx src/app/styles.css`                                                                                         | No findings (`[]`).                                                                                                                                                                                                                         | Source candidate `6d8415f0`.                                |
| Desktop/mobile UI           | Search, no-match, clear, URL, visible H1, first card title order/visibility, filter-panel keyboard toggle, and caption/status overlap at 1600×900, 1276×720, 1024×900, 768×900, and 320×740. | All scripted checks passed; no horizontal overflow or console/page errors. At 1276×720 and 1600×900 the actual first card H2 follows its unchanged cover and appears y=666–714. At 320×740 Clear filters ends 18px above bottom navigation. | Source candidate `6d8415f0`, local Chromium review harness. |
| 200% reflow                 | Chromium checked search and empty state at a 638×360 CSS viewport with DPR 2.                                                                                                                | Narrow layout active; one H1 remains visible; no horizontal overflow. Browser zoom UI itself was not toggled.                                                                                                                               | Source candidate `6d8415f0`, local Chromium.                |
| Accessibility scope         | Chromium checked labels, one H1 at every tested width, keyboard toggle, dark theme, forced colors, reduced motion, text-spacing override, and 200% effective viewport.                       | Smoke checks passed. NVDA/VoiceOver screen readers and current/previous Chrome, Edge, Firefox, Safari, iOS Safari, and Android were not run; unverified. Contrast was not separately audited under forced colors.                           | Local Chromium only.                                        |
| Full unit suite             | GitHub Actions CI on the pushed PR head.                                                                                                                                                     | Fresh CI for the rebased source candidate is pending.                                                                                                                                                                                       | Unverified on source candidate until CI completes.          |
| Database/provider lifecycle | Not in issue scope.                                                                                                                                                                          | Not run.                                                                                                                                                                                                                                    | Unverified.                                                 |
| Canonical production route  | Deployment is separate and not authorized for this ticket.                                                                                                                                   | Not run.                                                                                                                                                                                                                                    | Unverified.                                                 |

## TDD and Project Reflection preflight

- Red proof: the cover-before-heading regression failed on the pre-fix source; original viewport checks also showed the title below the fold, H1 clipped at stacked widths, and 320px no-match recovery below bottom navigation.
- Green proof: 43 focused catalog tests passed, and Chromium confirmed the actual first card title after its cover, visible H1, and 320px recovery positions.
- Applied `L-20260927-02`: waited for the actual rendered content node before measuring layout.
- Applied `L-20260930-01`: omitted workstation and vault paths from this shared evidence.
- Applied `L-20260930-02`: verify the live linked-issue state after merge and close it explicitly if still open.
- Rejected `L-20260927-01` as inapplicable: this change adds no public heading or navigation.

## Source fingerprint

Reproduce from the candidate checkout:

```powershell
git diff --binary --full-index de76d381ca7b522b25c61eea20920569085f3b93 HEAD -- src/app/styles.css src/features/catalog/components.tsx src/features/catalog/liveEditorial.test.tsx src/features/catalog/components.test.tsx | git hash-object --stdin
```

Current source-only fingerprint: `87dcb6d3148b9ca5110d39320a6d621a0222f6f2`.

## Independent review and gates

- Pre-rebase standards and spec reviews passed at `efaf864`; root review found a card-order contract issue, resolved in this candidate. Fresh exact-head spec, standards, and root reviews, required CI, merge, resulting `main` SHA, and live issue closure remain pending.
- Hosted/provider lifecycle and canonical production route remain unverified because deployment is outside this ticket.
- Any affected source, configuration, fixture, or integration change invalidates corresponding proof.
