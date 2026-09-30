# Evidence — issue #423 approved 423-B delta

## Candidate

- Issue/spec: #423-B; approved inventory selection of #410 Browse styling and #412 documentation-only freshness guidance
- Owner/chat: samarquis / current Codex task
- Risk: standard, public visual styling
- Baseline SHA: `29491d879451b77a17664a984e41a94d25f39f78`
- Source candidate SHA: `c205f6356ba64a4f88473f50d2c205e34ecba513`
- Source diff SHA-256: `79692DC3D99AC13C87B87EFFA751CC131B76935FF422F746BA7AF030023CA036` (SHA-256 of raw stdout bytes from `git diff --binary 29491d879451b77a17664a984e41a94d25f39f78...c205f6356ba64a4f88473f50d2c205e34ecba513 -- src/app/styles.css DESIGN_SYSTEM.md e2e/issue-410-browse-controls.spec.ts`; excludes other paths and does not use `--full-index`)
- Branch: `codex/issue-423-browse-ui` (local checkout)
- Evidence captured at: `2026-09-30T02:19:15Z`

## Scope

Changed outcome: public Browse search-first spacing, desktop filter grid, compact mobile search control, token-based dark button/default/disabled colors, and a dark keyboard-focus ring. Desktop search, two filters, and actions now share one row so the first store remains visible in the initial viewport. `DESIGN_SYSTEM.md` states the 30-calendar-day freshness rule. The Browse E2E contract covers the focus ring plus keyboard and pointer filter submission.

Excluded scope: freshness runtime code, navigation, trip UI, prototypes, account/backend work, Store Details/Gallery implementation, all unselected hunks from PR #408/#394, CI publication, deployment, and production claims.

Overlapping work checked: PR #408 remains OPEN at `02d966f1b517af597bc1288c8e4e33a03357cac3`; PR #394 remains OPEN at `a97930da15aad52aa6e57c92f6e91ccf2d6e98e4`. Current `main` remains `29491d879451b77a17664a984e41a94d25f39f78`. PR #458 was opened for this candidate; no provider or deployment state changed.

## PR #408/#394 full-scope disposition

The immutable full-scope 423-A inventory is retained in the private Project Reflection vault as “2026-09-28 0028 - 423-A immutable inventory” (SHA-256 `BD048C42FCE9C64E952D9562601B23D02E6E2FA05A370B1FE0C043D6D0D710D9`). The user approved only the narrow #410 styling plus #412 documentation selection in chat; this approval and implementation are recorded in the private 423-B work event. The inventory compared both exact PR heads against then-current main `0cd5627008e0d29e9f45e811f78a48095dffb22f`; current main subsequently advanced via PR #455 to `29491d879451b77a17664a984e41a94d25f39f78`. PR #394 is an ancestor of #408 and contributes no commits absent from #408. The PR heads remain unchanged. The inventory's path buckets and reviewed dispositions are:

| PR scope                                                                                   | Disposition in this candidate                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #410 Browse controls and search-first layout                                               | Keep only the narrow scoped styling delta; its exact source and rendered proof are recorded here.                                                            |
| #411 navigation and trip entry                                                             | Superseded by the closed public-test contract; retain main's Browse / Saved stores / More navigation and deferred trip routes.                               |
| #412 freshness runtime and parsing                                                         | Already on main; retain date-derived freshness and strict parsing. Reject local-today / `daysOld` fallbacks. Keep only the approved Design System paragraph. |
| #413 fictional-listing map/address action                                                  | Already on main with stronger fixture/freshness/address checks; retain main.                                                                                 |
| #414 Help and #415 Status                                                                  | Already on main with the required recovery/correction guidance and Help/Browse exits; retain main.                                                           |
| #416 Browse density                                                                        | Already on main through PR #447; do not reapply older card changes.                                                                                          |
| #417 prototypes                                                                            | Exclude review-only CategoryGrid, MapFirstGrid, and TripBuilder routes/bundles from the public build.                                                        |
| Store Details/Gallery layout and media-count changes; catalog error recovery               | Separate work requiring explicit bounded acceptance; excluded from this ticket.                                                                              |
| Account/auth/backend changes                                                               | Separate account lane; preserve PR #409 ownership and exclude from public candidate.                                                                         |
| Existing screenshots/evidence template, governance, release/config, and unrelated metadata | Separate from this source selection; keep current evidence template and exclude unrelated branch changes.                                                    |
| Trip continuity and review-hours feedback                                                  | Deferred trip work; exclude.                                                                                                                                 |

This disposition covers the full relevant public, account, prototype, evidence, governance, recovery, and trip scope classified in 423-A; OPEN PR state alone is not the reconciliation evidence.

## Acceptance

| Criterion                        | Observable pass condition                                                                         | Verification method                                                    | Result/evidence                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #410 theme contrast              | Search, Apply, Clear text reaches 4.5:1 in light and dark at 320px and desktop                    | Rendered Playwright contrast calculation                               | PASS in light/dark at 320px and 1280px. Search/Apply use the primary colors; disabled Clear uses the disabled colors.                                                                                            |
| #410 interaction                 | Search and filters work by keyboard and pointer                                                   | Playwright: Enter search, pointer Apply/Clear, keyboard Enter on Apply | PASS. Eight theme/viewport/browser combinations passed.                                                                                                                                                          |
| #410 keyboard focus              | Dark Browse filter actions retain the shared two-boundary keyboard focus indicator                | Playwright `:focus-visible` and computed `box-shadow`                  | PASS: inner `rgb(18, 21, 25)` 2px ring and outer `rgb(243, 238, 228)` 6px ring. Removing the fix made the regression assertion fail with `box-shadow: none`.                                                     |
| #423 first-store layout           | First Browse store image and name remain within the initial 1000px desktop viewport                | Playwright `opens on a useful first store without an unexposed map placeholder` | PASS on the fixed source candidate; Chromium and mobile projects cover desktop and phone viewports.                                                                                                         |
| #412 documentation               | Exact 30-day, overdue, unknown, and older-date precedence guidance appears after color-alone rule | Exact diff review                                                      | PASS; paragraph matches approved PR #408 wording.                                                                                                                                                                |
| #412 runtime                     | Date-derived freshness behavior remains on current main; no fallback/status-parser changes        | Inherited 423-A source inventory; candidate changes no runtime code    | PASS by inheritance; no runtime code changed.                                                                                                                                                                    |
| Public Details/Help/Status flows | Desktop and 320px public flows continue to work with anonymous synthetic catalog                  | Browser suite below                                                    | PASS for applicable Store Details, Help, and Status flows in Chromium and mobile projects. One redundant mobile screenshot-capture test was intentionally skipped; Chromium generated the single screenshot set. |

## Verification

| Layer                      | Command or flow                                                                                                                                                  | Result                                                             | Applies to SHA/environment                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Design contracts           | `npm test -- src/app/styles.test.ts`                                                                                                                                                                                      | PASS, 34 tests                                                     | `c205f635`; Windows local                                                                                                    |
| Type/lint/format/build     | `npm run typecheck`; `npm run lint`; `npm run format`; `npm run build`                                                                                                                                                    | Typecheck PASS; lint 0 errors/14 warnings; format PASS; build PASS | `c205f635`; Windows local. Lint warnings are in untouched files.                                                             |
| Browse, Help, Status browser contracts | `npx playwright test e2e/issue-410-browse-controls.spec.ts e2e/catalog.spec.ts e2e/issue-414-help.spec.ts e2e/issue-415-public-status.spec.ts --retries=0`                                                   | PASS, 44 tests across Chromium and mobile                          | `c205f635`; local Playwright config. First-store regression now passes. No Docker restart or hosted environment used.           |
| Store Details flow         | Prior Store Details browser proof; screenshot-capture test not rerun for this CSS-only Browse fix                                                                                                                          | PASS on prior source candidate; not rerun on `c205f635`             | `a307d430`; tracked UI-02 screenshot outputs were preserved and not overwritten.                                              |
| Database/RLS/RPC           | None                                                                                                                                                                                                                      | Not applicable; no database changes                                | `c205f635`                                                                                                                   |
| Hosted/provider lifecycle  | None                                                                                                                                                                                                                      | Not run; no hosted change authorized                               | Not applicable                                                                                                               |
| Required GitHub CI         | PR #458 run `36658269184` on head `2d574f16da8769d9ca2a7642c82da4b242514f2f`                                                                                                                                                | PASS; database 3m16s; web 631 passed / 95 skipped in 12m7s; Preview skipped | Source `c205f635`; no hosted lifecycle was required                                                                          |
| Canonical production route | None                                                                                                                                                                                                                      | NOT RUN; no deployment authorized                                  | Not applicable                                                                                                               |

## Store Details screenshot side effects

`e2e/store-details.spec.ts` rewrites the three tracked UI-02 screenshots when its Chromium capture test runs. The exact `a307d430` captures were preserved outside the candidate and verified as non-empty local copies; machine-specific artifact paths are omitted:

| Capture | Retained copy                      | SHA-256                                                            |
| ------- | ---------------------------------- | ------------------------------------------------------------------ |
| Desktop | Verified local copy; path withheld | `5B19237977EFB9504C05F6785A55CD3DAF4355F4FDDB463C10949EC6BCBAC9E5` |
| Tablet  | Verified local copy; path withheld | `87074145BA0A1DAF32CA42CF6E8E4AABCAB7386D18F54991A0F73B7B0102502C` |
| Mobile  | Verified local copy; path withheld | `0F608D59FE6E42CB3D5D676D17E7B0DC4E2672531B0B7D7936FA651C0038BEDA` |

The captures show the current 50-item synthetic gallery and unloaded lower-page image tiles; the committed UI-02 baseline shows four photos and a different prior layout. No Store Details implementation changed in this candidate. The generated captures are outside the approved #423-B source delta, so the checked-in UI-02 evidence remains unchanged and no screenshot replacement is claimed.

## Independent review

- Reviewer: separate Standards and Spec reviews; final exact-head receipts are recorded on PR #458 and in the private Project Reflection work event.
- Earlier exact-head reviews passed at `07330972`, `3ca83fbd`, and `5ed141f1`; they are historical because the later source fix changed the candidate. The current review covers the updated source candidate and acceptance record.
- Earlier review found a dark-hover cascade issue, off-scale `0.8rem` spacing, and dark focus-ring suppression; those fixes are covered by the current source and Browse browser contract.

## Remaining proof boundaries

The updated local Browse/Help/Status suite passes on `c205f635`. PR #458 CI run `36658269184` passed at head `2d574f16`; that head contains the exact source candidate and prior acceptance evidence. This evidence-only refresh will create a new PR head, so required checks and exact-head review must pass again before merge. The UI-02 captures are excluded side effects; no screen-reader review was run. Hosted lifecycle, deployment, and canonical production route proof remain unperformed. PR #408/#394 stay open at their inventoried heads.

## Invalidation

Evidence applies to source candidate `c205f6356ba64a4f88473f50d2c205e34ecba513` and the local environment above. Rerun affected review and checks after source/configuration/fixture changes. The UI-02 capture copies in the named stash are separate artifacts, not part of this candidate.
