# Details and photo acceptance evidence map

## Candidate

- Issue/spec: [#504](https://github.com/samarquis/AntiqueTrail/issues/504), under [#498](https://github.com/samarquis/AntiqueTrail/issues/498)
- Owner/chat: @samarquis, dedicated #504 task; #506 owns serial integration
- Risk: low; evidence report only
- Requested and browser-tested app source: `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`
- Candidate ancestry: refreshed `origin/main` is `30ceef8d98c4689ef7d2cf8a127ae68040d87886`; since the tested app source it adds only the report from merged #512. App source includes merged #496 / [PR #497](https://github.com/samarquis/AntiqueTrail/pull/497).
- Main-source delta fingerprint: `42c869974107fae3321f000ac580a9e5abef3178` (Git object hash over the binary full-index diff from `81703453ee5e445ee3bdb1c38ef2cf8f81a362ee` to `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; reproducible with `git diff --binary --full-index 81703453ee5e445ee3bdb1c38ef2cf8f81a362ee...68751a42c9a05d1ffd7c129d8f1f409dccd1775a | git hash-object --stdin`)
- Worktree/branch: dedicated #504 worktree, `codex/issue-504-details-evidence`; workstation path omitted
- Evidence captured: 2026-10-03

## Scope

Changed outcome: map existing Details, photo, provenance, theme, failure, and boundary coverage against #504's answer key. Report source findings separately from rendered results.

Excluded scope: runtime, test, fixture, configuration, gallery, image, and styling edits; hosted or production checks; #488 human closure; duplicate #487 instrumentation.

Overlapping branches/worktrees checked: #496 is closed and PR #497 merged at `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`. #506 remains open and blocked on sibling candidates. No open PR existed for #504 at preflight. Sibling work was not copied or modified.

Pre-existing failure: #496 recorded a light-mode category contrast failure at its `81703453ee5e445ee3bdb1c38ef2cf8f81a362ee` baseline: `#68758a` on `#e2e7f0` measured 3.76:1; Browse context text measured 4.24:1. PR #497 is merged and its `web`, `database`, and `configured-owner-billing` checks succeeded; Supabase Preview was skipped. The current category regression spec retains full-main Axe rules with no disabled rule. PR #513's same-source receipt records 2/2 category-regression tests passed; #504 did not duplicate that run.

## Acceptance

| Criterion | Observable pass condition | Existing verification mapped | Result/evidence |
| --- | --- | --- | --- |
| Layout and orientation | At 320/390/800/1280 CSS px in actual settled themes: no horizontal overflow or clipping; main actions at least 48×48; section links and back path work; hours/trust content stays visible; focus returns to the originating control. | `e2e/store-details.spec.ts`: hierarchy and target-size assertions; reflow at 320/390/800/900/1024/1440/1920; section links/back path; Browse and photo return focus/scroll. `e2e/issue-496-category-contrast.spec.ts`: actual theme assertion and 320px overflow check. | **Partial pass.** Details browser assertions passed, including responsive reflow; the exact 1280px width and full requested width-by-theme matrix are not established. Capture test produced new images, but they were restored to preserve tracked originals; no manual image review was retained. |
| Photos | One selected cover and one chooser; keyboard selection, enlarge, close, and focus return work; failed/sparse media stays usable; observe whether choosing a lower item updates the above-viewport cover without turning the observation into an automatic redesign. | Source has one `.store-gallery--cover` and renders the `Choose a store photo` collection only when there is more than one image. `e2e/store-details.spec.ts` covers selection, dialog focus containment/return, blocked image fallback, and enlarged-image failure. | **Partial pass.** Selection, dialog, blocked-image, and enlarged-image recovery assertions passed. The test checks selected-button state but not the resulting cover image after a lower choice. It tests 50-item blocked media, not a zero-photo Details fixture. Above-viewport usability has not been observed. |
| Trust | Current, overdue, and unavailable synthetic states retain the supplied dates and fictional disclosure; provenance text measures at least 4.5:1 against its effective surface after each actual theme is selected. | `e2e/issue-467-provenance.spec.ts` loops light/dark and current/stale/unknown; asserts `html[data-theme]` after each navigation, disclosure adjacency, and computed foreground/surface ratio ≥4.5. Fixture source carries current `verifiedAt=2026-08-01T15:00:00Z`, stale `verifiedAt=2026-02-01T15:00:00Z`, and unknown with no date; fixture `asOfUtc=2026-08-12T15:00:00Z`. | **Passed 1/1.** State, theme, disclosure, and contrast assertions passed. The browser test still does not check the exact displayed date string. Source formatter inspection is not rendered date proof. |
| Boundaries | Unknown store and missing source/accessibility remain explicit; stage-paused private actions remain unavailable; correction draft stays local with no submit or server-save capability. | `e2e/store-details.spec.ts` covers not-found focus/back path, sparse contact/accessibility/update/source text, and absence of map/trip actions. `e2e/issue-468-correction-draft.spec.ts` with `playwright.issue-468.config.ts` uses `VITE_PUBLIC_TEST_CATALOG_ONLY=true`; it checks local `sessionStorage` draft persistence, no submit/sign-in button, and zero correction-submit requests. | **Partial pass.** Store Details sparse and not-found recovery assertions passed. The #468 case is a separate 4185 configuration and was not run. “Local draft persistence” is not server save capability. |
| Limits and failures | Changed-main accessibility rules remain enabled; known #496 failure remains traceable rather than filtered; phone/screen-reader evidence stays separate. | `e2e/issue-496-category-contrast.spec.ts` scans full `main` on Browse and Details in both themes, then checks 320px and forced colors without disabling Axe rules. Relevant `e2e/theme.spec.ts` cases cover persisted theme, stale-state contrast, and dark-route Axe checks for Browse, Details, photo gallery, and More; that dark-route case asserts no serious/critical violations. | #496 receipt: 2/2 passed via PR #513 at this SHA. #503's selected theme run: 3/3 passed. The stale-status and dark-journey cases specified below were not established by those receipts. Real-phone and screen-reader proof remains separate under #488. |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Focused tests | `npx playwright test e2e/store-details.spec.ts e2e/issue-467-provenance.spec.ts --project=chromium --workers=1 --retries=0` | Bootstrap `issue504-store-details-bootstrap-20261003T200712Z`: 1/1 passed in 40.0s. Batch `issue504-details-provenance-20261003T201046Z`: 16/16 passed in 1.4m (15 Details, 1 provenance), exit 0, zero failed/skipped. | App source `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; synthetic review fixture, port 4173 |
| #496 regression | `npx playwright test e2e/issue-496-category-contrast.spec.ts --project=chromium --workers=1 --retries=0` | Not rerun. [PR #513](https://github.com/samarquis/AntiqueTrail/pull/513) records 2 passed in `issue503-contrast496-20261003T192305Z` at the same source SHA. | Same source and fixture; #503 receipt |
| Theme cases | `npx playwright test e2e/theme.spec.ts --project=chromium --workers=1 --retries=0 --grep "manual toggle persists across reloads and beats the system preference|light stale status retains contrast and a non-color honesty companion|dark stale status retains contrast and a non-color honesty companion|dark journeys pass axe contrast and a11y rules"` | Not rerun. PR #513 records 3 selected theme tests passed in `issue503-theme-20261003T192531Z` at the same SHA. That receipt covers system preference, saved toggle, and shared controls; the stale-status and dark-journey cases named here remain unverified. | Same source and fixture; #503 receipt |
| Type/lint/format/build | Not applicable to this report-only change; no source or test files changed. | Not run. | Report branch |
| Database/RLS/RPC | Not applicable. No database was started or changed. | Not run. | Local |
| Desktop/mobile UI | Selected browser suite passed responsive-reflow and screenshot-capture cases. Three tracked review screenshots were restored to their exact pre-run hashes; no manual visual review was performed. | Automated assertions passed; manual visual review remains **unverified**. | Local review fixture only; canonical `clockwork` store is not this fixture route |
| Accessibility/error states | Selected Details/provenance cases passed, including blocked-image and enlarged-image recovery. The separate #496/theme receipts are recorded above. | Selected assertions passed; human phone/screen-reader review remains **unverified** under #488. | Local review fixture only |
| Hosted/provider lifecycle | Not applicable. | Not run. | No hosted state touched |
| Canonical production route | Not applicable. | Not run. | No production claim |

## Browser lane handoff and run controls

- Run IDs: `issue504-store-details-bootstrap-20261003T200712Z` (bootstrap) and `issue504-details-provenance-20261003T201046Z` (batch)
- Exact app source: `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`
- Refreshed `origin/main`: `30ceef8d98c4689ef7d2cf8a127ae68040d87886`; its only delta from the app source is the report-only `docs/evidence/design-review-filter-contract/acceptance.md` change in merged PR #512. No source, runtime, configuration, or test file changed; the tested app remains exactly the baseline SHA above.
- Fixture: Vite review mode (`VITE_COMMERCIAL_RESEARCH_REVIEW=true`); synthetic `/stores/blue-finch-curios` and `/stores/cedar-brass`, not canonical `clockwork`
- Project and port: Playwright `chromium`, loopback 4173 only; `playwright.config.ts` sets `reuseExistingServer: false`. #501 explicitly granted this lane for #504. No 4174 or 4185 run was made; no Chrome/CUA call was made, and #499's separately tracked tab was left untouched.
- Bootstrap command: `npx playwright test e2e/store-details.spec.ts --project=chromium --workers=1 --retries=0 --grep 'shows the complete visit decision hierarchy and honest source information'` — exit 0, 1 passed.
- Batch command: `npx playwright test e2e/store-details.spec.ts e2e/issue-467-provenance.spec.ts --project=chromium --workers=1 --retries=0` — exit 0, 16 passed, zero failed/skipped. #496 and theme suites were not duplicated because PR #513 provides same-SHA receipts above.
- Runtime readiness: Node `v24.11.1`, npm `11.13.0`, lockfile Playwright `1.62.1`; isolated `npm ci --cache <task-isolated-cache> --no-audit --no-fund` completed with 589 packages and no lockfile change. Playwright Chromium `151.0.7922.34` (`chromium-1234`), headless shell, FFmpeg, and Winldd are installed in an isolated task cache. `npx playwright install --list` and expected executable-path existence checks passed. The shared default browser cache was not used.
- Runner receipt: the requested `playwright.config.ts` starts `npm run dev:review` (Vite) on strict loopback 4173 with server reuse disabled. `.env.review` selects `VITE_REVIEW_HARNESS=true`; the configured review branch supplies the synthetic catalog client. The separate `playwright.review.config.ts` also starts only Vite, on 4174, and is not selected. This fixture run needs no Docker, provider, or database service.
- Process/port receipt: 4173 was clear before each run and after both. Bootstrap WebServer PIDs 27100/30588 and worker PID 32732 exited; batch WebServer PIDs 15044/12108 and worker PID 14916 exited. Final inspection found no task-matching Node/Chromium process. No process was killed.
- Screenshot preservation: the capture case changed the three tracked files under `docs/evidence/ui-02/`; only those generated writes were restored from verified pre-run copies. Final SHA-256 values match the original manifest, captured with `Get-FileHash docs/evidence/ui-02/store-details-desktop.png,docs/evidence/ui-02/store-details-tablet.png,docs/evidence/ui-02/store-details-mobile.png -Algorithm SHA256`:
  - `store-details-desktop.png`: `DF2E9D3AD30F9BB8CC805E5DEF193F3C6BF0FAAD44A9CBE220FF938993C5A361`
  - `store-details-tablet.png`: `442A49C3FF38F98D7CA5C35F30B2EB13E164B7E1C617EA4871028DE60A4445B9`
  - `store-details-mobile.png`: `B6C75C04C22D933C5E665A1FF2A4DD0BFCA985FABA623413670FEE33EA707D11`
- Generated-output cleanup: `test-results` was absent before the bootstrap. Playwright created only `.last-run.json` with passed/zero-failed status; that owned file and its empty directory were removed. `package-lock.json` is unchanged, and no generated screenshot diff remains.

## Security and negative proof

- Identities/scopes: synthetic public catalog fixture only; no account or provider identity used.
- Failure behavior: selected blocked-image and enlarged-image recovery assertions passed against the synthetic fixture; this does not prove provider/network failure behavior.
- Secret/PII handling: none used. Public report omits workstation and vault paths.
- Security review: not applicable to report-only change.

## Project Reflection preflight

- Reviewed the current Project Memory lesson registry and effectiveness ledger. Applied `L-20260930-01` (supported): omit workstation/vault paths and define hash inputs, scope, command, and flags. Predicted effect: reproducible, path-safe evidence.
- Applied `L-20260927-02` (supported): use semantic readiness and measured content, not timer-only readiness. Existing cases wait for visible headings, settled theme attributes, and measured content. Predicted effect: avoid false readiness.
- Applied `L-20261003-02` (provisional): preserve the actual selected theme across navigation and assert `html[data-theme]` before contrast checks. The provenance and #496 specs already encode this. Predicted effect: prevent theme-transition false greens.
- The Project Memory ledger records #498–#507 creation-stage applications as effects unknown with no execution credit. The selected leased run now supplies measurable browser results; no reflection event was written because ticket-event reflection follows verified closure.

## Independent review

- Reviewer: pending exact report candidate
- Standards verdict: pending
- Spec verdict: pending
- Final verdict: pending
- Findings/disposition: selected baseline browser coverage passed; exact-report-candidate Standards/Spec reviews and #506 final-source refresh remain pending

## Unverified

- Manual visual review of generated desktop/tablet/mobile screenshots; test-captured files were restored to their baseline originals.
- Exact visible freshness-date text; existing #467 browser assertions check states and disclosure but not the date string.
- Exact 800px rendering and full requested-width/theme matrix (320/390/800/1280 in both settled themes); the selected reflow case passed but does not establish that complete matrix.
- No-photo empty state and above-viewport selected-cover usability observation.
- Stale-status and dark-journey theme cases named above; the #503 theme receipt does not cover those exact cases.
- The separate 4185 catalog-only correction-draft browser case; phone/screen-reader human proof under #488; hosted and canonical production behavior.

## Invalidation

This map's source inspection and any future browser results apply to `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`. Refresh affected proof after any Store Details, gallery, provenance, theme, fixture, configuration, or sibling integration change. #506 must rerun affected evidence on its composed candidate; this baseline report does not substitute for that refresh.
