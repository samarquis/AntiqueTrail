# Browse filter characterization

Status: baseline source characterization and the mixed-query/Furniture/Vintage browser cases are recorded. The overseer accepted the proposed contract in [the #502 admission comment](https://github.com/samarquis/AntiqueTrail/issues/502#issuecomment-5972412631) on 2026-10-03. Browser proof for clearing and reloading a non-default Area, and direct browser boundary proof, remain unverified.

## Candidate

- Issue/spec: [#501](https://github.com/samarquis/AntiqueTrail/issues/501)
- Owner: `samarquis`, branch `codex/issue-501`
- Risk: low. This report covers public catalog controls and does not write data.
- Baseline and source under review: `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`, current `main` at preflight.
- Candidate SHA: tracked by the exact report commit and PR head. Do not embed the commit SHA in this file; doing so changes the candidate itself.
- Diff fingerprint: record the exact SHA-256 in the PR review receipt. Recompute from the repository root with `git diff --binary 68751a42c9a05d1ffd7c129d8f1f409dccd1775a <candidate-sha> -- docs/evidence/design-review-filter-contract/acceptance.md | node -e "const {createHash}=require('node:crypto');const chunks=[];process.stdin.on('data',chunk=>chunks.push(chunk));process.stdin.on('end',()=>console.log(createHash('sha256').update(Buffer.concat(chunks)).digest('hex')));"`. This hashes the raw `--binary` diff bytes for this one path.

## Scope

This report covers `CatalogFiltersForm`, `BrowsePage:updateFilters`, URL serialization, existing catalog tests, and one proposed commit model. It changes no runtime, test, or configuration file.

The worktree was clean at the pinned baseline. No other `issue-501` branch or open PR appeared in the ownership check. The live issue is open and assigned to this worker.

## Source finding

`CatalogFiltersForm` keeps the search text in local `q` state. Typing changes only that state. Category and area controls call `onChange` immediately with the applied `filters` prop. `BrowsePage:updateFilters` then updates applied filters, reloads the list, and replaces the current URL with the serialized criteria.

The form submit handler combines the current applied filters with local `q`. This creates two commit timings in one form. After a user types a query and changes category, the field can show the draft query while the results and URL reflect only the category. The browser reproduced that visible split: Furniture selection left the draft query in the input while the URL and results reflected Furniture alone. The state mismatch is confirmed; this run did not measure users' subjective reactions.

An already applied query composes correctly with a category change. Starting from `?q=clock`, selecting Furniture preserves `q=clock` and adds `category=furniture`. Clearing filters resets the query, category, and area. `replaceState` replaces the current history entry; this report proposes no history-policy change.

Existing tests cover search submission and category changes separately. They do not assert the displayed text, URL, list calls, and results between typing a query and applying a category.

## Reproducible state-transition matrix

Use the local review fixture at `/stores`. In that fixture the initial catalog has 12 stores: six Vintage and six Antique mall. It has no Furniture stores. Browser observations below are visible card counts, input values, URLs, and settled theme. The browser surface did not instrument `CatalogClient.list` method calls. The review harness selects an in-memory demo client, so no catalog HTTP request is part of this flow; do not infer method-call counts from network requests. React `StrictMode` may repeat development calls, but the actual invocation count remains unmeasured.

| Case | Input and action | Source-derived URL and visible-result expectation | Browser observation |
| --- | --- | --- | --- |
| Unsubmitted text | Load `/stores`. Type `filter-501-no-match` without pressing Enter or Search. | URL stays `/stores`; draft input can differ from applied criteria; fixture starts with 12 stores. | URL `/stores`, input `filter-501-no-match`, 12 store cards and “12 stores to explore”; theme `light`. |
| Required Furniture case | Select Furniture before submitting the text. | URL becomes `/stores?category=furniture`; the draft query should remain in the field; fixture has no Furniture stores. | URL `/stores?category=furniture`, input `filter-501-no-match`, 0 cards and “No stores match those filters.”; theme `light`. Reopened the collapsed filter panel and confirmed Category `furniture`, Area blank. |
| Apply | Click **Apply filters**. | URL becomes `/stores?q=filter-501-no-match&category=furniture`; query and category now compose; fixture result remains 0. | URL `/stores?q=filter-501-no-match&category=furniture`, input `filter-501-no-match`, 0 cards and empty-state text; theme `light`. |
| Fixture control | Repeat the draft query, then select Vintage. | URL first becomes `/stores?category=vintage` with six matching records while the query remains draft. Apply then serializes both criteria and yields 0. | Before Apply: `/stores?category=vintage`, input `filter-501-no-match`, 6 cards and “6 stores to explore”; theme `light`. After Apply: `/stores?q=filter-501-no-match&category=vintage`, same input, 0 cards and empty-state text; theme `light`. |
| Applied text | Load `/stores?q=clock`, then select Furniture. | The URL preserves the applied query and adds the category: `/stores?q=clock&category=furniture`. | At `/stores?q=clock`, input `clock`, 0 cards and empty-state text; theme `light`. After selecting Furniture, URL `/stores?q=clock&category=furniture`, input `clock`, 0 cards and empty-state text; theme `light`. Apply kept that URL and state. |
| Recovery | Clear after applying criteria, then reload `/stores`. Also reload an applied query/category URL. | Clear's source handler empties local query and applied criteria (`onChange({})`); this resets query/category/area by source. Reload restores serialized criteria. | Clear from `q=clock` plus Furniture produced `/stores`, blank input, 12 cards and “12 stores to explore”; theme `light`. Area was already blank, so resetting a non-default Area was not browser-verified. Reloading `/stores?q=filter-501-no-match&category=vintage` restored the URL and input, returned 0 cards, and retained theme `light`; reopened controls showed Vintage selected. Reload of an applied Area was not tested. Final reload of `/stores` showed blank input, both selects at their default blank values, 12 cards, and theme `light`. |
| Boundary | Open the Package 1 filter panel. | Search, Category, and Area remain available. Later-stage filters remain absent. No sign-in, location request, or Map flow is added. | Not separately measured in this browser run. Existing `e2e/catalog.spec.ts` source asserts later-stage filters are absent; that E2E suite was not run. Sign-in, location, and Map flows were not exercised. |

The Furniture case follows #501's answer key. Its zero results before and after Apply cannot distinguish the two criterion sets by count alone. The Vintage control uses the existing six-record fixture to show the difference. Keep both cases in the browser receipt. The required mixed-query behavior and Vintage result transition are observed; Area clearing/reload and the browser boundary remain unverified.

## Proposed interaction contract

Keep query, category, and area in one draft snapshot. Typing and dropdown changes update that draft only. The current applied snapshot continues to drive results, result count, active-filter status, and URL until submission.

Search, Enter, and **Apply filters** commit the same normalized draft snapshot. After commit, the list request and URL use that snapshot together. Keep existing query parsing, normalization, serialization order, and `replaceState` behavior. Reloading an applied URL restores the same criteria.

Clear resets draft and applied search, category, and area together. Keep it available whenever either snapshot contains a value, including when the user has typed text but has not submitted it. Preserve the current empty-state Clear action and the user's draft text until Clear or commit.

Keep later-stage filter gating unchanged. This proposal adds no sign-in, device-location, Map, or private-write requirement. The existing `DESIGN.md` calls for immediate Browse results, search by store name, town, and category, and a manual area selector. `DESIGN_SYSTEM.md` specifies labeled submit and clear controls, filter chips, and result-count, loading, zero-result, error, and cleared states. This issue changes commit semantics only; it adds no chip UI. One commit snapshot makes the visible result states refer to the same criteria.

Example under the proposed model: at `/stores`, type `filter-501-no-match` and select Furniture. Before submitting, keep URL `/stores` and the 12 applied results while the draft input/category show the new values. Apply, Search, or Enter then commits both together, yielding `/stores?q=filter-501-no-match&category=furniture` and 0 results.

The overseer accepted this contract and recorded #502 as READY in [the 2026-10-03 admission comment](https://github.com/samarquis/AntiqueTrail/issues/502#issuecomment-5972412631). That acceptance does not add code, browser, production, or deployment proof. This #501 report still requires exact-candidate review and publication.

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Focused tests | `npm run test -- src/features/catalog/components.test.tsx` | Passed: 1 file, 39 tests. JSDOM printed one unsupported-navigation warning; command exited 0. The suite does not assert the mixed text/category case. | Baseline source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`, local worktree. |
| Type/lint/format/build | Not run. This candidate changes only evidence documentation. | Not applicable to this diagnostic draft. | No source, test, or config change. |
| Database/RLS/RPC | None | Not run. The browser fixture used its in-memory review client. | No database/provider operation. |
| Desktop/mobile UI | Required matrix above | Desktop local review harness completed in one browser tab at viewport 1265×704. Browser console error log was empty. Mobile viewport and responsive behavior were not tested. | Source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; run `issue-501-20261003-4174-01`. |
| Accessibility/error states | Existing source and tests only | `e2e/catalog.spec.ts` asserts Package 1 gating and keyboard search; the E2E suite was not run. Mixed-state accessibility, area-clear behavior, responsive filter-panel behavior, app failure, and timeout behavior remain unverified in this run. | Baseline source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`. |
| Hosted/provider lifecycle | None | Not run or in scope. | Unverified. |
| Canonical production route | None | Not inspected. | Unverified. |

## Security and negative proof

- Denied identities/scopes: not applicable. No sign-in or private action is part of this report.
- Failure and timeout behavior: browser setup and app failure states were not exercised.
- Secret/PII handling: the report contains no workstation paths, credentials, or personal data.
- Security review: no security-sensitive source change. Independent review remains pending.

## Independent review

The exact candidate SHA, diff fingerprint, and two independent review receipts are recorded in the associated PR description. Keeping the receipt outside this file avoids changing the candidate by embedding its own commit SHA.

- Reviewer: separate Standards and Spec reviewers; exact-head receipts are in the PR description.
- Standards verdict: recorded in the PR description against the exact candidate SHA.
- Spec verdict: recorded in the PR description with accepted contract and remaining evidence limits.
- Final verdict: recorded in the PR description against the exact candidate SHA.
- Findings and disposition: unverified Area and boundary cases remain listed below; review receipt records their disposition.

## Project-reflection preflight

- The existing #501 creation event already records L-20260930-01 and L-20260927-02. This preflight adds no duplicate creation event.
- `L-20260930-01` is supported. The current ledger records 23 applications: 7 successful, 4 failed, and 12 unknown. Applied here by omitting workstation/vault paths and defining the exact baseline, candidate argument, one-file scope, raw `--binary` bytes, and SHA-256 command. Predicted effect: reviewers can reproduce the digest without personal paths. This application's effect is unknown until review.
- `L-20260927-02` is supported. The current ledger records 22 applications: 11 successful, 0 failed, and 11 unknown. Applied by recording the settled URL, visible input, and card count after transitions without timer-based readiness. Result: successful for this run; each recorded state matched the settled page.
- `L-20261003-02` is provisional. The current ledger records 7 applications: 1 successful, 0 failed, and 6 unknown. Applied by checking rendered `html[data-theme]` after navigation and reload; no init script reset a user choice. Result: successful for this run; every measured navigation and reload remained `light`, with no theme reset.
- `L-20260930-02` is provisional. The current ledger records 13 applications: 12 successful and 1 unknown. Applied to the finish plan: after merge, verify the live issue state and `main` merge SHA. Predicted effect: catch a merge that leaves the issue open. Effect remains unknown until closure.
- `L-20261002-01` is provisional. The current ledger records 9 applications: 3 successful, 1 failed, and 5 unknown. Applied to the finish plan: record exact-head Standards and Spec verdicts before the integrator merges. Predicted effect: prevent retrospective review from standing in for the pre-merge gate. Effect remains unknown until review.
- `L-20261002-03` is provisional. The current ledger records 1 application: 1 successful, 0 failed, and 0 unknown. Applied to the proposal rationale using the measured visitor action: type a store query, select a category, observe the category-only URL/results while the query remains visible, then Apply to commit both. Result: successful for this run; the overseer accepted the resulting single-snapshot contract in the linked #502 comment.
- Rejected `L-20260927-01`: its trigger is a public heading or navigation change before a broad browser matrix. This ticket changes neither and requires one bounded filter scenario. The #501 creation event also rejected `L-20261001-01`; its PostgreSQL restore prerequisites do not apply because this work uses no database restore.
- The project lesson registry, effectiveness ledger, #501 creation event, and linked evidence for semantic readiness, theme persistence, and evidence fingerprints were inspected. Results for L-20260927-02, L-20261003-02, and L-20261002-03 are recorded above; exact-fingerprint reviewer results and post-merge closure evidence remain open.

## Resource lease and cleanup receipt

- Owner: issue #501 worker on `codex/issue-501`.
- Source: baseline SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; no source, fixture, or config edits.
- Fixture: existing review-mode local synthetic catalog. No accounts, provider, or database operations.
- Command: `$env:VITE_REVIEW_HARNESS='true'; $env:VITE_COMMERCIAL_RESEARCH_REVIEW='true'; npm run dev:review -- --host 127.0.0.1 --port 4174`.
- Run ID: `issue-501-20261003-4174-01`.
- Port: 4174 only. Opened `http://127.0.0.1:4174/stores` in one Codex in-app browser tab (tab id `1`). The actual rendered theme was checked after every navigation and reload. The visible input, URL, and result counts are recorded in the matrix. The in-memory client method-call count was not instrumented.
- Process: foreground shell PID `5252`; owned Vite listener PID `28264`; command was the one above. No hosted catalog configuration, provider, or database operation appeared.
- Cleanup: sent Ctrl+C to the owned foreground server; closed tab `1`; verified the Vite process was absent and port 4174 had zero listeners. No other browser tabs were opened or closed.

## Unverified

The exact `CatalogClient.list` method-call count, internal React development replays, non-default Area clear/reload behavior, browser boundary pass, and independent exact-candidate reviews remain open. The measured mixed-query/Vintage states and actual page-visible counts/theme are recorded above. The overseer acceptance is linked above. No hosted, production, or database evidence was collected.

## Invalidation

The unit, source, and browser findings apply to the exact baseline SHA above and run `issue-501-20261003-4174-01`. Any source, config, or fixture change invalidates the affected rows. Record Standards and Spec verdicts against the exact report candidate before merge.
