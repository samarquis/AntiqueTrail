# Issue 469 acceptance

## Candidate

- Issue/spec: https://github.com/samarquis/AntiqueTrail/issues/469.
- Owner/chat: issue #469 ticket owner; primary Codex task.
- Risk: standard; synthetic catalog data and presentation behavior only.
- Admission baseline: `c9bb80250d5087ace3638059da09cd628bc1fad6`.
- Current PR base: `5391bd027b4f3df3a3fde85e02c284345d8fe1aa`.
- Source candidate SHA: `17c14caa24097a314b7c983cf07c14c2a9d5ec9a`.
- Reviewed source HEAD: `17c14caa24097a314b7c983cf07c14c2a9d5ec9a`; the pushed PR head also carries the following docs-only evidence update.
- Diff fingerprint: `d79035879a8624f1f336007fb541ac08f23d0117` for the three application source files against the current PR base.
- Branch: `codex/issue-469-browse-results-viewport` in its isolated ticket worktree.
- Evidence captured at: 2026-10-02 12:34 CDT, local Windows Chromium and Vite review harness.

## Scope

After a search, the Browse hero enters compact results mode, moves imagery attribution clear of filter feedback, and hides editorial copy at stacked widths. Results heading identifies the first store with a direct link, so visitors can identify and open it while the catalog card image and density stay unchanged. Active feedback remains inside the search form.

Excluded: card density or image-size changes, catalog data changes, search/filter semantics, database/provider work, deployment, and production publication.

The admission order remains #469 → #470 → #467. Refreshed `origin/main` is `5391bd0`; the intervening #477 and #478 commits touch review surfaces only and do not overlap this ticket's source files.

The earlier full-suite run on source candidate `f987aa2` reported 1,079 passed, 9 failed, and 1 skipped across 165 files. Eight failures were 5-second timeouts; one unrelated PasswordReplacement assertion failed. Those nine cases passed when rerun serially across the five unrelated suites. The full suite was not rerun on source candidate `17c14caa`.

## Acceptance

| Criterion                        | Observable pass condition                                                                  | Verification method                                 | Result/evidence                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search result visibility         | At 1276×720 and 1600×900, count and first listing identity appear in the initial viewport. | Chromium browser geometry and screenshots.          | Pass: count y=539–570; linked “First result: Blue Finch Curios” y=574–622. Card begins at y=643. Its own title remains below the viewport at y=1031; card density is unchanged.                                                    |
| No-match recovery                | Count/state and recovery action appear without scrolling past the hero.                    | Chromium browser geometry and screenshots.          | Pass at both desktop sizes: heading y=585–616; Clear filters y=659–707. At stacked widths 1024 and 768, recovery is also visible at y=798–846 and y=604–652.                                                                       |
| Filter feedback and URL behavior | Feedback stays attached to a stable control surface; search and clear retain URL behavior. | Chromium form/URL flow.                             | Pass: status remains inside the search form, attribution does not overlap it, Enter yields `/stores?q=Blue+Finch`, Clear returns to `/stores` with 12 stores, and compact results mode remains active.                             |
| Accessibility and keyboard       | Controls remain labeled and keyboard operable.                                             | Chromium accessible-role queries and keyboard flow. | Pass for labeled search, Search button, first-result link, and keyboard Filters toggle. Dark theme, forced-colors, reduced-motion, and text-spacing override smoke checks showed no horizontal overflow or caption/status overlap. |
| 320px reflow                     | Layout has no horizontal page scrolling.                                                   | Chromium document/client width comparison.          | Pass: document width 305px; client width 320px.                                                                                                                                                                                    |

### Rendered evidence

Screenshots use the local review harness, which adds a synthetic “Local review” status banner. Browser console and page errors were empty.

| View                       | Before                                                   | After                                                             |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| Search, 1276×720           | ![Before search at 1276×720](before-search-1276x720.png) | ![After search at 1276×720](search-1276x720.png)                  |
| Empty, 1276×720            | ![Before empty at 1276×720](before-empty-1276x720.png)   | ![After empty at 1276×720](empty-1276x720.png)                    |
| Search, 1600×900           | —                                                        | ![After search at 1600×900](search-1600x900.png)                  |
| Empty, 1600×900            | —                                                        | ![After empty at 1600×900](empty-1600x900.png)                    |
| Search and empty, 1024×900 | —                                                        | [Search](search-1024x900.png) · [Empty state](empty-1024x900.png) |
| Search and empty, 768×900  | —                                                        | [Search](search-768x900.png) · [Empty state](empty-768x900.png)   |
| Search and empty, 320×740  | —                                                        | [Search](search-320x740.png) · [Empty state](empty-320x740.png)   |

## Verification

| Layer                       | Command or flow                                                                                                                          | Result                                                                                                                                                                                                                               | Applies to SHA/environment                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Focused tests               | `npx vitest run --maxWorkers=1 src/features/catalog/liveEditorial.test.tsx src/features/catalog/countLabels.test.tsx`                    | 8 passed. The first-result test failed before implementation, then passed with the new linked identity.                                                                                                                              | Source candidate `17c14caa`, local Windows checkout.        |
| Typecheck                   | `npm run typecheck`                                                                                                                      | Passed.                                                                                                                                                                                                                              | Source candidate `17c14caa`.                                |
| Lint                        | `npm run lint`                                                                                                                           | 0 errors; 16 existing warnings, none in changed files.                                                                                                                                                                               | Source candidate `17c14caa`.                                |
| Format                      | `npm run format`                                                                                                                         | Passed.                                                                                                                                                                                                                              | Source candidate `17c14caa`.                                |
| Release tests               | `npm run test:release`                                                                                                                   | 164 passed.                                                                                                                                                                                                                          | Source candidate `17c14caa`.                                |
| Build and media             | `npm run build`; `node scripts/verify-seed-media.mjs --built-root dist`                                                                  | Build passed; 10 paths verified, 0 errors.                                                                                                                                                                                           | Source candidate `17c14caa`, local.                         |
| Layout detector             | `npx impeccable detect --json --scope layout src/features/catalog/components.tsx src/app/styles.css`                                     | No findings (`[]`).                                                                                                                                                                                                                  | Source candidate `17c14caa`.                                |
| Desktop/mobile UI           | Search, no-match, clear, URL, keyboard Filters toggle, and caption/status overlap at 1600×900, 1276×720, 1024×900, 768×900, and 320×740. | All scripted checks passed; no horizontal overflow or console/page errors.                                                                                                                                                           | Source candidate `17c14caa`, local Chromium review harness. |
| Accessibility scope         | Chromium checked labels, keyboard toggle, dark theme state, forced-colors and reduced-motion media states, and text-spacing overrides.   | Smoke checks passed. NVDA/VoiceOver screen readers and the current/previous Chrome, Edge, Firefox, Safari, iOS Safari, and Android browser matrix were not run; unverified. Contrast was not separately audited under forced colors. | Local Chromium only.                                        |
| Full unit suite             | `npm run test`                                                                                                                           | Not run on source candidate `17c14caa`; prior candidate outcome is recorded above and is not presented as final-candidate proof.                                                                                                     | Unverified on final source candidate.                       |
| Database/provider lifecycle | Not in issue scope.                                                                                                                      | Not run.                                                                                                                                                                                                                             | Unverified.                                                 |
| Canonical production route  | Deployment is separate and not authorized for this ticket.                                                                               | Not run.                                                                                                                                                                                                                             | Unverified.                                                 |

## TDD and Project Reflection preflight

- Red proof: the first-result-link test failed because no linked identity existed beside the count.
- Green proof: all 8 focused catalog tests passed after implementation.
- Applied `L-20260927-02`: waited for the actual rendered content node before measuring layout.
- Applied `L-20260930-01`: omitted workstation and vault paths from this shared evidence.
- Applied `L-20260930-02`: verify the live linked-issue state after merge and close it explicitly if still open.
- Rejected `L-20260927-01` as inapplicable: this change adds no public heading or navigation.

## Source fingerprint

Reproduce from the candidate checkout:

```powershell
git diff --binary --full-index 5391bd027b4f3df3a3fde85e02c284345d8fe1aa...HEAD -- src/app/styles.css src/features/catalog/components.tsx src/features/catalog/liveEditorial.test.tsx | git hash-object --stdin
```

Current source-only fingerprint: `d79035879a8624f1f336007fb541ac08f23d0117`.

## Independent review and gates

- Updated standards and spec reviews, parent exact-PR-head review, required CI, merge, resulting `main` SHA, and live issue closure remain pending.
- Hosted/provider lifecycle and canonical production route remain unverified because deployment is outside this ticket.
- Any affected source, configuration, fixture, or integration change invalidates corresponding proof.
