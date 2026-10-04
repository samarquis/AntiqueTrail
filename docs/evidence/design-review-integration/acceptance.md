# Design-review integration acceptance map

Status: #505 report-only acceptance is merged and issue #505 is CLOSED. This map records composed #506 criteria and evidence boundaries; exact candidate, check, and review receipts belong to its pull request.

## Candidate

- Issue/spec: [#506](https://github.com/samarquis/AntiqueTrail/issues/506), under [parent #498](https://github.com/samarquis/AntiqueTrail/issues/498)
- Owner/chat: #506 serial integration owner
- Risk: Low; this candidate composes acceptance evidence only and changes no product source, tests, fixtures, or configuration.
- Original pinned baseline: 81703453ee5e445ee3bdb1c38ef2cf8f81a362ee
- Current main baseline: 4fc62585f8d43a0df072203325cf8187fec42f62/tree f04d2dedb4d005c2e5b25cbabf1c146878d11446 (PR #508 merge).
- Final candidate SHA: recorded with tree and diff fingerprint in the #506 pull request description; this file avoids self-referential hashes.
- Diff fingerprint: computed after the final map edit and recorded in the #506 pull request description.
- Worktree/branch: codex/issue-506-design-review-integration; refreshed by ordinary merge commit 997791784e1a36eb96735b6e671dbb086b209966 with parents b8f9a070ef2e375fdacf7e9f1f370d79f982a603 and current main 4fc62585f8d43a0df072203325cf8187fec42f62. C3 snapshot 378c53d7e350aa82fea46bf9b99e34fad0888586/tree a8b9f232dc5e480f6033642eb50b1a428bedc009 remains preserved by tag codex/issue-506-c3-a8b9-preserved.
- Evidence captured: 2026-10-04 UTC

## Scope

Changed outcome: durable acceptance map for the reviewed design-review leaves on current main, including the accepted #505 report-only leaf and remaining human, hosted, and release gates.

Excluded: resolving the original #505 503 cause, browser/provider operation for that report, publication/deployment, physical assistive-technology acceptance, hosted account/inbox proof, release recovery/custody, and any #498/#506/#507 closure.

Overlapping work checked: #496, #500, #502, and #516 product changes are on main; #499, #501, #503, #504, and #505 report leaves are integrated. No dirty files or commits were copied from the #505 owner worktree.

Pre-existing failure: #505 records historical local-service 503/other/zero-row observations and a separately admitted same-source retry with 200/one-row observations. The original readiness receipt is missing, so its cause remains UNKNOWN. The later readiness diagnostic, #516 helper, and green CI do not establish causality.

## Integrated source and evidence owners

| Leaf | Integrated result | Main identity |
| --- | --- | --- |
| #496 contrast | Selector-local category/Browse-context correction and full-main contrast test | PR #497 head b44d67ecf37659e421376604598ac66f52a279c1; merge 68751a42c9a05d1ffd7c129d8f1f409dccd1775a |
| #500 stage notice | One display-only notice, tests, and report | PR #510 head ba37d52c20e78414b0006fd8df6d1055e11fb61e; merge eef88400418711745c0076683be852c7c321e182 |
| #502 filter commit | Draft/applied snapshot, Apply/Search/Enter commit, Clear reset, and focus correction | PR #514 head 9d902f5ff94f4bfc82194b17604150f3850c29fc; merge fbd5f6ce6d87ca9f81c0bed4092500ef7131a777 |
| #516 readiness | Helper-only configured-shopper readiness guard, typed contract, deterministic tests, and acceptance report | PR #518 head 0fb086582f7e48b58b01cd8a80568ad7f23c6488; merge d1c6b3062af0cbf36cebf23a17d06534adce6182 |
| #499, #501, #503, #504 | Bounded reports; no additional product-source changes | Merged reports in PRs #509, #512, #513, and #515 |
| #505 availability | Corrected report-only evidence integrated; #505 closed for this bounded report, with original 503 cause unresolved | PR #508 corrected head 7656c8c1ce4c16cb49e55adc1801bbdbb02724bc on d1; earlier candidate bf7b23c66ef87069dd44b525584eb1a1c666ee86 failed configured-owner-billing in run 37181623566 before browser admission. Failed artifact 11296015973 contained a 347-byte status-unavailable report, not the separate readiness counters from its job log. Corrected test-merge e7f8ba808d40cb383879a75fffab90dcf00a3ef7/tree f04d2dedb4d005c2e5b25cbabf1c146878d11446. Required run 37183247765 passed web, database, and configured-owner-billing; Supabase Preview skipped. Exact-head review PASS: comment 5977372604. Merged as 4fc62585f8d43a0df072203325cf8187fec42f62; issue closed at 2026-10-04T06:59:36Z, comment 5977515027. The merge adds only the owned acceptance report; no cause or canonical-production claim. |

PR #518 changed only helper/docs/test paths; it did not change UI components, CSS, review-mode browser fixtures, or browser configuration. PR #508 adds only docs/evidence/design-review-catalog-availability/acceptance.md. C3 UI evidence remains bound to tree a8b9 and is unaffected by these paths; no post-#518 local browser rerun was performed.

## Pinned ancestry, changed regions, and leaf dispositions

Pinned baseline 81703453ee5e445ee3bdb1c38ef2cf8f81a362ee is an ancestor of current main 4fc62585f8d43a0df072203325cf8187fec42f62 (verified). Product merges after the pin: #497 68751a42c9a05d1ffd7c129d8f1f409dccd1775a (#496), #510 eef88400418711745c0076683be852c7c321e182 (#500), #514 fbd5f6ce6d87ca9f81c0bed4092500ef7131a777 (#502), #518 d1c6b3062af0cbf36cebf23a17d06534adce6182 (#516), and #508 4fc62585f8d43a0df072203325cf8187fec42f62 (#505 report). Report merges: #509 b409e7eec387bb2f3782c92a2c2d96ab11f90d67, #512 30ceef8d98c4689ef7d2cf8a127ae68040d87886, #513 2ab62cda5c235edc808714388aa7a436193f3b4c, and #515 d22c51f7f1af7ed0a265e1f5c6772b514f2c407a. Unrelated PR #517 merge 9d0adf1d1164db71e4b29e22fad0a351a58dc103 remains outside #506 criteria.

| Leaf | Disposition on current main | Changed paths and symbol regions |
| --- | --- | --- |
| #496 / PR #497 | Integrated product correction | `src/app/styles.css`: `.catalog-results-heading .eyebrow` and `.catalog-card__categories li`; `DESIGN_SYSTEM.md`; `e2e/issue-496-category-contrast.spec.ts` checks Browse/Details, light/dark contrast, forced colors, and narrow layout. |
| #500 / PR #510 | Integrated display-only stage notice | `src/app/App.tsx` `StoreBrowser`; `src/features/catalog/components.tsx` `BrowsePage` notice prop and placement; `src/features/shopper/components.tsx` `CatalogPrivateActions` Browse-context suppression. `src/app/App.test.tsx`, `src/features/catalog/designReviewNotice.test.tsx`, `src/features/shopper/designReviewNotice.test.tsx`, and `e2e/design-review-stage-notice.spec.ts` cover notice placement and the Details boundary. |
| #502 / PR #514 | Integrated filter snapshot/commit behavior | `src/features/catalog/components.tsx` `CatalogFiltersForm` draft/applied state and Search/Enter/Apply commit path; `src/features/catalog/components.test.tsx`, `src/features/catalog/designReviewFilters.test.tsx`, and `e2e/design-review-filter-commit.spec.ts` cover it. |
| #516 / PR #518 | Integrated local readiness helper only | `scripts/configured-shopper-local.mjs`: `loopbackRequest`, `waitForLocalServiceReadiness`, and `createLocalService` readiness call; `scripts/configured-shopper-local.d.mts` declares the helper, and `scripts/configured-shopper-readiness.test.mjs` covers fixed safe errors, bounded diagnostics, status counts, aborts, and registration behavior. No UI or browser fixture/config changes. |
| #499 / PR #509; #501 / PR #512; #503 / PR #513; #504 / PR #515 | Report-only evidence integrated | Respectively `docs/evidence/design-review-publication-lineage/acceptance.md`, `docs/evidence/design-review-filter-contract/acceptance.md`, `docs/evidence/design-review-browse-proof/acceptance.md`, and `docs/evidence/design-review-details-proof/acceptance.md`; no product-source leaf is claimed for these reports. |
| #505 / PR #508 | Integrated report-only evidence; #505 closed for bounded report | docs/evidence/design-review-catalog-availability/acceptance.md only. PR #508 passed required exact-head CI and exact-SHA review before merge; no product source was added. The initial 503 cause remains UNKNOWN. |
| PR #517 (merge 9d0adf1d1164db71e4b29e22fad0a351a58dc103) | Excluded from #506 criteria; retained in main ancestry | Independent `src/features/catalog/marketAtMacvicarPreview.ts`, `e2e/market-at-macvicar.preview.spec.ts`, and `docs/evidence/market-at-macvicar/local-preview.md`; these do not replace any mapped #506 evidence. |

Conflict disposition: #500 and #502 modify separate BrowsePage and CatalogFiltersForm regions in src/features/catalog/components.tsx; both are present with dedicated tests. PR #517 adds separate preview files. PR #518 changes helper/docs/test paths. PR #508 adds one report path only. Its failed run 37181623566 and passing exact-head run 37183247765 remain distinct; the latter permits bounded report integration but does not resolve the original #505 cause. Preserve the 503/other/zero-row and later 200/one-row observations without causal attribution.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --- | --- | --- | --- |
| Exact composition | Accepted child source is present with no sibling work overwritten; report-only leaves remain report-only | Compare merged PR heads, source paths, and exact main tree | PASS on main 4fc62585f8d43a0df072203325cf8187fec42f62/tree f04d2dedb4d005c2e5b25cbabf1c146878d11446. PR #508 test-merge and merged-main trees match. Final #506 candidate is documentation-only; exact head is recorded in its PR description. |
| Browse controls and #410 | Search, Apply, Clear, keyboard/pointer filtering, visible focus, semantic colors, and draft/applied state remain correct | Existing browse/filter E2E and exact-tree web CI | PASS. The PR #508 required web check passed on test-merge tree f04d; PR #508 changes no UI/test paths. #410 checks actual theme, contrast, location color, results, Apply, and Clear. PR #514 adds draft-preservation and commit coverage. |
| Browse responsive/accessibility | Narrow layout, exactly 800px column count, focus, target size, 200% reflow, text spacing, forced colors, reduced motion, notice boundary, empty/error/retry states | #503 report plus exact-tree C3 local evidence; current-main CI | PASS for mapped automated criteria. C3 DS131 passed 26/26 at source 378c53d7/tree a8b9. Supplemental private packet passed 11/11 browser cases and 2/2 component cases: exact-800 Browse 2/2; Retry click/recovery 1/1 component case; Details matrix 8/8; lower-photo cover 1/1 browser case. Physical device/screen-reader review remains #488. |
| Details layout/photos | 320/390/800/1280 in light/dark, no overflow, target sizing, sections/back focus, empty-media fallback, and lower selection updating the offscreen hero | #504 report plus exact-tree C3 local evidence; current-main CI | PASS for the added local matrix and fallback/selection observations. Matrix was 8/8; empty-media fallback was 1/1 component; lower-photo selection was 1/1 browser. Full-page lazy-photo blanks/fixed navigation are capture limits, not product failures. |
| Freshness and provenance | Exact current/overdue/unavailable dates remain honest; current/stale/unknown provenance and dark/light contrast/axe checks remain intact | src/features/catalog/components.test.tsx; e2e/issue-467-provenance.spec.ts; relevant e2e/theme.spec.ts; main web CI | PASS. Component tests assert exact visible date text and Photos-page empty copy/return link. The provenance browser case checks current/stale/unknown fixtures, actual light/dark theme, disclosure, and contrast; theme cases cover stale-status and dark-route axe. Details media=[] fallback is separate component evidence. These stay bound to their recorded tests and main CI; no broader physical-AT claim. |
| Availability handoff | Distinguish observed local 503 and later 200 responses without inferring a backend cause; integrate only the reviewed #505 report | #505 report, exact-head CI, root review, merged tree, issue state | PASS for bounded report integration: the pre-correction candidate bf7b23c failed configured-owner-billing before browser admission; corrected PR head 7656c8c1ce4c16cb49e55adc1801bbdbb02724bc passed run 37183247765. Artifact 11295928638 report SHA-256 1a87fafa951977a1014a672cdc07860611bc80d4272abcbbb612cce78cfc84cc has sourceSha test-merge e7f8ba808d40cb383879a75fffab90dcf00a3ef7, with parents d1 and the corrected head and tree f04d2dedb4d005c2e5b25cbabf1c146878d11446; this equals merged-main tree. #505 is CLOSED. The original 503 cause remains UNKNOWN; no hosted or canonical-production conclusion. |
| Final candidate gates | Whole-candidate checks, affected proof, exact-SHA Standards/Spec review, and required CI pass after final composition | npm run check, applicable npm run verify:web, exact-head PR CI, independent review | Required before #506 merge; see the #506 PR for candidate-bound receipts. verify:web is not applicable when the final diff remains documentation-only. |
| Release/human/hosted boundary | Keep recovery, publication, phone/AT, and account/inbox gates separate from local and CI evidence | #507, #511, #488, and #428 receipts/owners | OPEN and separate. No canonical production or hosted account acceptance claimed. |

Supplemental C3 evidence is local synthetic review-fixture behavior, not a hosted or production capture. Its private plan SHA-256 is 0f256c902d3af1926bf0408b946b7d00beec9e75266eb8b84f430cbea657b998; root-verified asset manifest SHA-256 is 8e037f666689b8424bb3243acca20c81c9a94e4c27727f9a1dbc8886fb8f1785. The packet is not attached to this repository; these hashes identify the private evidence, not a public reproduction recipe. Original C3 DS131 receipt binds spec SHA-256 aa5583b3f8d9bc5b8ceb02d33a01a29e3d53e4709a2bf8d918ff4c21a5c2975e, runner SHA-256 564f9d7f1af0c91015ed291b25477d765c25f892aa0d9fbf6af07e44b3ae97cb, and execution-summary SHA-256 0a7c39dbf682f61beeb77ac3469c5fd2f36d0d543764b2dc567c20eae66e49f5.

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Child regression suites | PR-linked focused tests and reports | Passed at their reviewed child candidates; see the linked PR acceptance files | Individual child commits, not one final #506 candidate |
| PR #508 and main exact-tree CI | PR run 37183247765 and main push run 37184331116 | PR test-merge e7f8ba808d40cb383879a75fffab90dcf00a3ef7/tree f04d2dedb4d005c2e5b25cbabf1c146878d11446 passed database, web, and configured-owner-billing; Supabase Preview skipped. Main push on 4fc62585f8d43a0df072203325cf8187fec42f62 passed database 111383032443, web 111383032570, and configured-owner-billing 111383442234. Its artifact 11296058330 ZIP SHA-256 0a21ccd5e467c08d431265d234b083565c7d8f8fceb7ad63911fa03b45aa531a; report SHA-256 e05d09770a55fe651c08781123381ef29d6c3482c7082cd3a40950f8fc8c34e8 (2,769 bytes), source exact, sourceDirty false, status passed, cleanup removed, errors empty. | Current main tree f04d2dedb4d005c2e5b25cbabf1c146878d11446; baseline receipt, not final #506 branch CI. |
| PR #518 exact-head CI | Run 37178901879 plus configured-seed-media 37178901921 and session-signout 37178901956 | Required web/database/configured-owner-billing and the two additional checks passed; Supabase Preview skipped. Configured-browser artifact 11294741633 passed 6 Representative + 3 Owner/cancellation checks | PR head 0fb086582f7e48b58b01cd8a80568ad7f23c6488 |
| Local visual review | Root inspected all eight Details matrix screenshots | Layout, sections, wrapping, and theme passed within captured synthetic scope. Full-page lazy images and fixed navigation limit capture interpretation | C3 tree a8b9 only |
| Database/RLS/RPC | No schema or database contract change in #506 child source | No local database operation. Main CI database job passed at d1 | d1 baseline only |
| Hosted/provider lifecycle | No real hosted account or provider operation authorized for this acceptance preparation | Not run; CI configured-shopper artifact exercises a local service/browser harness | None |
| Canonical production route | No deployment authorized | Not run | None |

## Security and negative proof

- Denied identities/scopes: no authorization or account policy change was composed here.
- Failure handling: #516 preserves fixed errors, abort behavior, and owned cleanup. #505 readiness records remain separately attributed; original 503 cause stays UNKNOWN despite its later passing run.
- Secret/PII handling: #516 evidence uses synthetic identities and allowlisted diagnostic fields; public notes contain no workstation or vault paths.
- Security review: #518 exact-head manual Standards/Spec/security review passed. Sealed static source scan reported zero findings for its exact source/test range; protected Daybreak discovery access was unavailable. No remote or production exposure claim.

## Freeze, checks, and review handoff

1. **Current checkpoint:** #505 PR #508 merged as 4fc62585f8d43a0df072203325cf8187fec42f62/tree f04d2dedb4d005c2e5b25cbabf1c146878d11446 after passing required CI and exact-head review. Issue #505 is CLOSED for its report-only scope. The initial 503 cause remains UNKNOWN.
2. **Refresh completed:** merged current origin/main normally into the preserved #506 branch. Integration commit 997791784e1a36eb96735b6e671dbb086b209966 has parents b8f9a070ef2e375fdacf7e9f1f370d79f982a603 and 4fc62585f8d43a0df072203325cf8187fec42f62. Pinned-baseline ancestry passed; no product-path conflict or sibling work was copied. C3 remains preserved under its tag.
3. **Freeze the candidate:** record exact base/candidate SHAs and trees, then compute the review fingerprint with git diff --binary --full-index <base>...<candidate> | git hash-object --stdin. Freeze affected source/config/fixture/evidence assertions during review. C3 UI evidence remains bound to tree a8b9; reuse only because the refreshed PR #508 leaf and final #506 map do not alter mapped UI, CSS, browser fixtures, or configuration. No new local browser or provider operation is admitted.
4. **Candidate checks and review:** run npm run check, applicable npm run verify:web, required exact-head CI, and independent exact-SHA Standards/Spec review on the frozen candidate. The final candidate changes evidence documentation only, so verify:web is not applicable; PR CI still runs required web checks. Record verdicts before any #506 merge. Keep issue update, merge, hosted, publication, and production gates separate.

Merge gate: #506 may merge only after the exact candidate has all required checks and independent root Standards/Spec review. Keep human, hosted, release, and production gates separate.

## Independent review

- Reviewer: root independent Standards/Spec review on the exact final #506 SHA; its receipt belongs to the pull request.
- Standards verdict: completed child candidates PASS; final #506 receipt tracked on its pull request.
- Spec verdict: completed child candidates PASS; final #506 receipt tracked on its pull request.
- Final verdict: integration map only; no #506 merge or production acceptance claimed.
- Findings and disposition: #505 report-only candidate 7656c8c1ce4c16cb49e55adc1801bbdbb02724bc passed required exact-head checks and review, then merged as 4fc62585f8d43a0df072203325cf8187fec42f62/tree f04d. Its evidence preserves the original cause as UNKNOWN. The #506 candidate, exact-head checks, and root review are linked from the pull request. No #506 merge, deployment, provider mutation, or new local browser run is claimed here.

## Unverified

- Original #505 503 cause and canonical production request status remain unresolved. The later readiness diagnostic is not browser evidence and does not identify the earlier cause.
- Exact #506 candidate checks, independent review, and merge remain separate gates; use the pull request for their live receipts.
- Human phone/screen-reader review (#488), hosted account/inbox lifecycle (#428), release recovery/custody and canonical rendered proof (#511/#507).
- No canonical production route, remote production API, or physical assistive-technology claim.

## Invalidation

This map describes current main 4fc62585f8d43a0df072203325cf8187fec42f62/tree f04d2dedb4d005c2e5b25cbabf1c146878d11446 and C3 local evidence at tree a8b9. PR #508 exact-tree CI applies to f04d; the main-push run independently confirms the same tree. Any later product-source, browser fixture/configuration, or evidence-assertion change requires reassessing and refreshing affected proof on the #506 candidate. An unrelated main advance alone does not stale these receipts; recheck overlap and branch protection before integration.
