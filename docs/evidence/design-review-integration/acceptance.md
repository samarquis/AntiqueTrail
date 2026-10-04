# Design-review integration acceptance map

Status: preparation only; BLOCKED for final #506 acceptance after #505 candidate bf7b23c66ef87069dd44b525584eb1a1c666ee86 failed configured-owner-billing. Await the #505 owner's factual report/body correction and a new ordinary candidate with required CI. This map is based on current main d1c6b3062af0cbf36cebf23a17d06534adce6182/tree 0a8a29749d686b53fdbaf44e9a5a56c15e657fa4. No final #506 candidate exists.

## Candidate

- Issue/spec: [#506](https://github.com/samarquis/AntiqueTrail/issues/506), under [parent #498](https://github.com/samarquis/AntiqueTrail/issues/498)
- Owner/chat: #506 serial integration owner
- Risk: standard integration and evidence mapping; no new product behavior in this preparation
- Original pinned baseline: 81703453ee5e445ee3bdb1c38ef2cf8f81a362ee
- Current main baseline: d1c6b3062af0cbf36cebf23a17d06534adce6182/tree 0a8a29749d686b53fdbaf44e9a5a56c15e657fa4
- Final candidate SHA: none; #505's reviewed report-only candidate bf7b23c66ef87069dd44b525584eb1a1c666ee86 failed configured-owner-billing. The owner must correct the factual report/body and produce a new ordinary candidate; no replacement SHA is available yet.
- Diff fingerprint: not computed; no final candidate is frozen
- Worktree/branch: codex/issue-506-design-review-integration, based on exact d1. Previous C3 snapshot 378c53d7e350aa82fea46bf9b99e34fad0888586/tree a8b9f232dc5e480f6033642eb50b1a428bedc009 is preserved by the local tag codex/issue-506-c3-a8b9-preserved.
- Evidence captured: 2026-10-04 UTC

## Scope

Changed outcome: durable criterion map for accepted design-review work on exact current main, with remaining owners and evidence classes kept explicit.

Excluded: implementing #505, browser/provider operation for its report, publication/deployment, physical assistive-technology acceptance, hosted account/inbox proof, release recovery/custody, and any #498/#506/#507 closure.

Overlapping work checked: #496, #500, and #502 product changes are already on main; #499, #501, #503, and #504 report PRs are merged; #516 readiness is merged. #505 remains separately owned. No dirty files or commits were copied from its owner worktree.

Pre-existing failure: #505 has historical local-service 503/other/zero-row observations and one admitted same-source retry with 200/one-row observations. Its report lacks the initial readiness receipt; cause remains UNKNOWN. #516's readiness fix and green CI do not establish causality.

## Integrated source and evidence owners

| Leaf | Integrated result | Main identity |
| --- | --- | --- |
| #496 contrast | Selector-local category/Browse-context correction and full-main contrast test | PR #497 head b44d67ecf37659e421376604598ac66f52a279c1; merge 68751a42c9a05d1ffd7c129d8f1f409dccd1775a |
| #500 stage notice | One display-only notice, tests, and report | PR #510 head ba37d52c20e78414b0006fd8df6d1055e11fb61e; merge eef88400418711745c0076683be852c7c321e182 |
| #502 filter commit | Draft/applied snapshot, Apply/Search/Enter commit, Clear reset, and focus correction | PR #514 head 9d902f5ff94f4bfc82194b17604150f3850c29fc; merge fbd5f6ce6d87ca9f81c0bed4092500ef7131a777 |
| #516 readiness | Helper-only configured-shopper readiness guard, typed contract, deterministic tests, and acceptance report | PR #518 head 0fb086582f7e48b58b01cd8a80568ad7f23c6488; merge d1c6b3062af0cbf36cebf23a17d06534adce6182 |
| #499, #501, #503, #504 | Bounded reports; no additional product-source changes | Merged reports in PRs #509, #512, #513, and #515 |
| #505 availability | Report-only refresh remains owned by its worker; not integrated | PR #508 is OPEN/DRAFT at pushed head bf7b23c66ef87069dd44b525584eb1a1c666ee86, based on d1c6b3062af0cbf36cebf23a17d06534adce6182. Its test-merge a219e914f75a82fc5429082b0448e162f8ec5137 has parents d1 + head and tree 4fd953673b4b193dafc6c2c103e98e3b833ce112, matching the reviewed candidate. It adds only the owned report path, with five #509-to-#510 reference corrections across four lines. Root Standards/Spec/privacy-security review passed in [comment 5977140614](https://github.com/samarquis/AntiqueTrail/pull/508#issuecomment-5977140614); raw diff is 27,730 bytes, SHA-256 dfdf8e6ddaed4935473dfecda836e7e27026a7e3bc5a6ffefef08dea444841c0, Git object ee0e885dff853bb061626602a40bff1f3d7dd1f8. Run 37181623566: database job 111375189523 SUCCESS, web job 111375189613 SUCCESS, configured-owner-billing job 111375640007 FAILURE, Supabase Preview SKIPPED. Failed job admitted no browser run: artifact 11296015973 contains a 347-byte report, SHA-256 2f617062fdea3a790f1d24fdede1c4728c898e66e4534cc9db5e6d19834152f1, for checkout a219e914f75a82fc5429082b0448e162f8ec5137; cleanup removed. It records the source's fixed safe startup message `Local catalog function did not become ready` after readiness exhaustion, 60 attempts (fetchFailure 2, httpFailure 58; HTTP 500×1, 502×29, 503×28; all other categories 0). This is not browser evidence or a cause for the original #505 failure. Owner correction and a new ordinary candidate are required; no merge admission. |

PR #518 changed only docs/evidence/configured-catalog-readiness/acceptance.md, scripts/configured-shopper-local.d.mts, scripts/configured-shopper-local.mjs, and scripts/configured-shopper-readiness.test.mjs. It did not change UI components, CSS, review-mode browser fixtures, or browser configuration. C3 UI evidence remains correctly bound to tree a8b9; no post-#518 local browser rerun was performed.

## Pinned ancestry, changed regions, and leaf dispositions

Pinned baseline 81703453ee5e445ee3bdb1c38ef2cf8f81a362ee is an ancestor of current main d1c6b3062af0cbf36cebf23a17d06534adce6182 (`git merge-base --is-ancestor` passed). Required product merges after the pin are #497 `68751a42c9a05d1ffd7c129d8f1f409dccd1775a` for #496, #510 `eef88400418711745c0076683be852c7c321e182` for #500, #514 `fbd5f6ce6d87ca9f81c0bed4092500ef7131a777` for #502, and #518 `d1c6b3062af0cbf36cebf23a17d06534adce6182` for #516. Report-only merges are #509 `b409e7eec387bb2f3782c92a2c2d96ab11f90d67`, #512 `30ceef8d98c4689ef7d2cf8a127ae68040d87886`, #513 `2ab62cda5c235edc808714388aa7a436193f3b4c`, and #515 `d22c51f7f1af7ed0a265e1f5c6772b514f2c407a` for #499/#501/#503/#504. Main also contains unrelated PR #517 merge `9d0adf1d1164db71e4b29e22fad0a351a58dc103`; it is not an #506 criterion.

| Leaf | Disposition on current main | Changed paths and symbol regions |
| --- | --- | --- |
| #496 / PR #497 | Integrated product correction | `src/app/styles.css`: `.catalog-results-heading .eyebrow` and `.catalog-card__categories li`; `DESIGN_SYSTEM.md`; `e2e/issue-496-category-contrast.spec.ts` checks Browse/Details, light/dark contrast, forced colors, and narrow layout. |
| #500 / PR #510 | Integrated display-only stage notice | `src/app/App.tsx` `StoreBrowser`; `src/features/catalog/components.tsx` `BrowsePage` notice prop and placement; `src/features/shopper/components.tsx` `CatalogPrivateActions` Browse-context suppression. `src/app/App.test.tsx`, `src/features/catalog/designReviewNotice.test.tsx`, `src/features/shopper/designReviewNotice.test.tsx`, and `e2e/design-review-stage-notice.spec.ts` cover notice placement and the Details boundary. |
| #502 / PR #514 | Integrated filter snapshot/commit behavior | `src/features/catalog/components.tsx` `CatalogFiltersForm` draft/applied state and Search/Enter/Apply commit path; `src/features/catalog/components.test.tsx`, `src/features/catalog/designReviewFilters.test.tsx`, and `e2e/design-review-filter-commit.spec.ts` cover it. |
| #516 / PR #518 | Integrated local readiness helper only | `scripts/configured-shopper-local.mjs`: `loopbackRequest`, `waitForLocalServiceReadiness`, and `createLocalService` readiness call; `scripts/configured-shopper-local.d.mts` declares the helper, and `scripts/configured-shopper-readiness.test.mjs` covers fixed safe errors, bounded diagnostics, status counts, aborts, and registration behavior. No UI or browser fixture/config changes. |
| #499 / PR #509; #501 / PR #512; #503 / PR #513; #504 / PR #515 | Report-only evidence integrated | Respectively `docs/evidence/design-review-publication-lineage/acceptance.md`, `docs/evidence/design-review-filter-contract/acceptance.md`, `docs/evidence/design-review-browse-proof/acceptance.md`, and `docs/evidence/design-review-details-proof/acceptance.md`; no product-source leaf is claimed for these reports. |
| #505 / PR #508 | Deferred, owner-owned report-only leaf | `docs/evidence/design-review-catalog-availability/acceptance.md` only; not part of #506 until its exact-head checks and root checkout/artifact/composition verification pass. Its five stale #509 report references now point to #510. |
| PR #517 (merge 9d0adf1d1164db71e4b29e22fad0a351a58dc103) | Excluded from #506 criteria; retained in main ancestry | Independent `src/features/catalog/marketAtMacvicarPreview.ts`, `e2e/market-at-macvicar.preview.spec.ts`, and `docs/evidence/market-at-macvicar/local-preview.md`; these do not replace any mapped #506 evidence. |

Conflict disposition: #500 and #502 both modify `src/features/catalog/components.tsx`, in separate `BrowsePage` and `CatalogFiltersForm` regions; both are present in d1 and retain their dedicated tests. PR #517 adds separate preview files. PR #518 touches helper/docs/test paths only. PR #508 changes one report path only; the current candidate's required-check failure keeps it out of #506 until its owner supplies a corrected report/body candidate and root accepts it. Preserve the original #505 local 503/other/zero-row observations and later admitted same-source 200/one-row retry. Its missing readiness receipt leaves cause UNKNOWN; #516 does not establish causality.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --- | --- | --- | --- |
| Exact composition | Accepted child source is present with no sibling work overwritten; every report-only leaf stays report-only | Compare merged PR heads, source paths, and exact main tree | PASS for current d1 baseline. Main tree is 0a8a29749d686b53fdbaf44e9a5a56c15e657fa4. Not final #506 composition while #505 remains pending. |
| Browse controls and #410 | Search, Apply, Clear, keyboard/pointer filtering, visible focus, semantic colors, and draft/applied state remain correct | Existing e2e/issue-410-browse-controls.spec.ts and e2e/design-review-filter-commit.spec.ts; exact-main CI | PASS on current d1 web CI. The #410 test checks actual theme, contrast, location color, results, Apply, and Clear. PR #514 adds direct draft-preservation and commit coverage. |
| Browse responsive/accessibility | Narrow layout, exactly 800px column count, focus, target size, 200% reflow, text spacing, forced colors, reduced motion, notice boundary, empty/error/retry states | #503 report plus exact-tree C3 local evidence; current-main CI | PASS for mapped automated criteria. C3 DS131 passed 26/26 at source 378c53d7/tree a8b9. Supplemental private packet passed 11/11 browser cases and 2/2 component cases: exact-800 Browse 2/2; Retry click/recovery 1/1 component case; Details matrix 8/8; lower-photo cover 1/1 browser case. Physical device/screen-reader review remains #488. |
| Details layout/photos | 320/390/800/1280 in light/dark, no overflow, target sizing, sections/back focus, empty-media fallback, and lower selection updating the offscreen hero | #504 report plus exact-tree C3 local evidence; current-main CI | PASS for the added local matrix and fallback/selection observations. Matrix was 8/8; empty-media fallback was 1/1 component; lower-photo selection was 1/1 browser. Full-page lazy-photo blanks/fixed navigation are capture limits, not product failures. |
| Freshness and provenance | Exact current/overdue/unavailable dates remain honest; current/stale/unknown provenance and dark/light contrast/axe checks remain intact | src/features/catalog/components.test.tsx; e2e/issue-467-provenance.spec.ts; relevant e2e/theme.spec.ts; main web CI | PASS. Component tests assert exact visible date text and Photos-page empty copy/return link. The provenance browser case checks current/stale/unknown fixtures, actual light/dark theme, disclosure, and contrast; theme cases cover stale-status and dark-route axe. Details media=[] fallback is separate component evidence. These stay bound to their recorded tests and main CI; no broader physical-AT claim. |
| Availability handoff | Distinguish known local 503 and later 200 observations without inferring a backend cause; integrate only reviewed #505 report | #505 report review, owner's exact SHA, focused evidence, required CI, root review | BLOCKED on failed candidate bf7b23c. Run 37181623566 passed web/database but failed configured-owner-billing before browser admission. Artifact 11296015973 is a 347-byte report (SHA-256 2f617062fdea3a790f1d24fdede1c4728c898e66e4534cc9db5e6d19834152f1; checkout a219e914f75a82fc5429082b0448e162f8ec5137; cleanup removed); it records bounded readiness diagnostics and the source's fixed safe startup message, not browser behavior or the original root cause. Owner must correct the factual report/body and provide a new ordinary candidate. Cause remains UNKNOWN; #516 does not prove it. Root must verify all required checks, exact checkout/artifact, and path composition before #506 admission. |
| Final candidate gates | Whole-candidate checks, affected browser proof, exact-SHA Standards/Spec review, and required CI pass after final composition | npm run check, applicable npm run verify:web, required PR CI, independent review | PENDING. Current-main success is a baseline receipt, not proof for a future #505-integrated candidate. |
| Release/human/hosted boundary | Keep recovery, publication, phone/AT, and account/inbox gates separate from local and CI evidence | #507, #511, #488, and #428 receipts/owners | OPEN and separate. No canonical production or hosted account acceptance claimed. |

Supplemental C3 evidence is local synthetic review-fixture behavior, not a hosted or production capture. Its private plan SHA-256 is 0f256c902d3af1926bf0408b946b7d00beec9e75266eb8b84f430cbea657b998; root-verified asset manifest SHA-256 is 8e037f666689b8424bb3243acca20c81c9a94e4c27727f9a1dbc8886fb8f1785. The packet is not attached to this repository; these hashes identify the private evidence, not a public reproduction recipe. Original C3 DS131 receipt binds spec SHA-256 aa5583b3f8d9bc5b8ceb02d33a01a29e3d53e4709a2bf8d918ff4c21a5c2975e, runner SHA-256 564f9d7f1af0c91015ed291b25477d765c25f892aa0d9fbf6af07e44b3ae97cb, and execution-summary SHA-256 0a7c39dbf682f61beeb77ac3469c5fd2f36d0d543764b2dc567c20eae66e49f5.

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Child regression suites | PR-linked focused tests and reports | Passed at their reviewed child candidates; see the linked PR acceptance files | Individual child commits, not one final #506 candidate |
| Current-main CI | GitHub push run 37180201315: database 111371057275, web 111371057321, configured-owner-billing 111371516323 | All three passed on exact d1. Configured-browser artifact 11294887365 has GitHub API artifact digest SHA-256 e889b9302db804761a6ef050f1fec9f4f9b898b57a1a34263a930425443cf108; separately, extracted report SHA-256 e06031bee673c9142b8a091f737eb98cacb94b947c32bc8689d2c15d642cbd33 confirms clean source, cleanup removed, errors [], 6 Representative + 3 Owner/cancellation pass, zero unexpected/skipped/flaky | Merged main d1; GitHub CI, synthetic/local-service browser harness |
| PR #518 exact-head CI | Run 37178901879 plus configured-seed-media 37178901921 and session-signout 37178901956 | Required web/database/configured-owner-billing and the two additional checks passed; Supabase Preview skipped. Configured-browser artifact 11294741633 passed 6 Representative + 3 Owner/cancellation checks | PR head 0fb086582f7e48b58b01cd8a80568ad7f23c6488 |
| Local visual review | Root inspected all eight Details matrix screenshots | Layout, sections, wrapping, and theme passed within captured synthetic scope. Full-page lazy images and fixed navigation limit capture interpretation | C3 tree a8b9 only |
| Database/RLS/RPC | No schema or database contract change in #506 child source | No local database operation. Main CI database job passed at d1 | d1 baseline only |
| Hosted/provider lifecycle | No real hosted account or provider operation authorized for this acceptance preparation | Not run; CI configured-shopper artifact exercises a local service/browser harness | None |
| Canonical production route | No deployment authorized | Not run | None |

## Security and negative proof

- Denied identities/scopes: no authorization or account policy change was composed here.
- Failure handling: #516 preserves fixed errors, abort behavior, and owned cleanup. #505's missing readiness receipt and cause remain explicit.
- Secret/PII handling: #516 evidence uses synthetic identities and allowlisted diagnostic fields; public notes contain no workstation or vault paths.
- Security review: #518 exact-head manual Standards/Spec/security review passed. Sealed static source scan reported zero findings for its exact source/test range; protected Daybreak discovery access was unavailable. No remote or production exposure claim.

## Freeze, checks, and review handoff

1. **Current checkpoint:** #505 stays outside #506. Run 37181623566 passed web/database and failed configured-owner-billing (111375640007) before browser admission. Artifact 11296015973 is a 347-byte extracted report for checkout a219e914f75a82fc5429082b0448e162f8ec5137, SHA-256 2f617062fdea3a790f1d24fdede1c4728c898e66e4534cc9db5e6d19834152f1; cleanup removed. Its 60-attempt readiness diagnostic records 2 fetch failures and 58 HTTP failures (500×1, 502×29, 503×28) before the source's fixed safe startup message. This does not identify the original failure's cause, which stays UNKNOWN. #505 owner is to correct the report/body factually and create a new ordinary candidate. Root owns the next admission decision after that candidate has passed all required CI and root verifies its exact checkout, artifact, and composition. No retry, bypass, source repair, polling loop, or merge is admitted for this map.
2. **Refresh after admission:** only after root records the #505 gate PASS and explicitly admits serial #506 integration, refresh this branch from then-current main. Do not transplant the preserved C3 tree or copy another worktree's files. Verify pinned-baseline ancestry, expected merge parents/tree, and changed paths against the leaf map above. Stop and remap if the accepted report adds a source, test, fixture, or configuration path, or if current main differs from the admitted base.
3. **Freeze the candidate:** record exact base/candidate SHAs and trees, then compute the review fingerprint with `git diff --binary --full-index <base>...<candidate> | git hash-object --stdin`. Freeze affected source/config/fixture/evidence assertions while acceptance checks run. C3 UI evidence remains bound to tree a8b9; reuse it only after path comparison confirms mapped UI, CSS, browser fixtures, and configuration are unchanged. No new local browser or provider operation is admitted by this preparation.
4. **Candidate checks and review:** run `npm run check`, applicable `npm run verify:web`, and all required exact-head CI on the frozen candidate. Refresh only evidence invalidated by changed paths or assertions. Obtain independent exact-SHA Standards/Spec review and any risk-required security review on that same candidate; record verdicts and findings before requesting integration. Recheck current branch protection and keep issue update, PR/merge, hosted, publication, and production gates separate.

Next checkpoint: the #505 owner supplies a factual report/body correction and new ordinary candidate; root verifies exact-head required CI, checkout, artifact, and composition. Until root records PASS, #506 remains BLOCKED and this document remains preparation-only.

## Independent review

- Reviewer: root and independent Standards/Spec reviewers for the completed child candidates
- Standards verdict: PASS for completed child candidates; not yet run on a frozen final #506 candidate
- Spec verdict: PASS for completed child candidates; final parent map remains pending #505
- Final verdict: BLOCKED
- Findings and disposition: candidate bf7b23c failed configured-owner-billing before browser admission. The #505 owner must correct the factual report/body and provide a new ordinary candidate; root then verifies all required CI plus exact checkout/artifact/composition. Only after explicit admission can #506 freeze a composed candidate, refresh affected evidence, run required whole-candidate checks, and obtain independent exact-SHA review. No #506 issue/PR update, merge, deployment, provider mutation, or additional local browser run was performed for this draft; the separately authorized #505 PR update is recorded above.

## Unverified

- A new #505 candidate after the factual report/body correction, its exact-head required CI, root checkout/artifact/composition verification, and final handoff. Candidate bf7b23c66ef87069dd44b525584eb1a1c666ee86 failed configured-owner-billing; its readiness diagnostic is not browser evidence and does not resolve the original cause.
- A frozen final #506 source candidate and its affected-evidence refresh, required checks, independent review, and any authorized main integration.
- Human phone/screen-reader review (#488), hosted account/inbox lifecycle (#428), release recovery/custody and canonical rendered proof (#511/#507).
- No canonical production route, remote production API, or physical assistive-technology claim.

## Invalidation

This map describes current main d1 and C3 local evidence at tree a8b9. The d1 main-push CI run is exact only for d1. Any later product-source, browser fixture/configuration, or evidence-assertion change requires reassessing and rerunning affected proof on the frozen #506 candidate. An unrelated main advance alone does not stale these receipts; check overlap and current branch protection. Update this file with #505's exact pushed SHA, new CI/artifact identities, final candidate SHA, and diff fingerprint before parent acceptance.
