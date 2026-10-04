# Design-review integration acceptance map

Status: preparation only; BLOCKED for final #506 acceptance while #505's exact-head CI runs. This map is based on current main d1c6b3062af0cbf36cebf23a17d06534adce6182/tree 0a8a29749d686b53fdbaf44e9a5a56c15e657fa4. No final #506 candidate exists.

## Candidate

- Issue/spec: [#506](https://github.com/samarquis/AntiqueTrail/issues/506), under [parent #498](https://github.com/samarquis/AntiqueTrail/issues/498)
- Owner/chat: #506 serial integration owner
- Risk: standard integration and evidence mapping; no new product behavior in this preparation
- Original pinned baseline: 81703453ee5e445ee3bdb1c38ef2cf8f81a362ee
- Current main baseline: d1c6b3062af0cbf36cebf23a17d06534adce6182/tree 0a8a29749d686b53fdbaf44e9a5a56c15e657fa4
- Final candidate SHA: none; #505's reviewed report-only candidate is pushed at bf7b23c66ef87069dd44b525584eb1a1c666ee86 with required CI running
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
| #505 availability | Report-only refresh remains owned by its worker; not integrated | PR #508 is OPEN/DRAFT at pushed head bf7b23c66ef87069dd44b525584eb1a1c666ee86, based on d1c6b3062af0cbf36cebf23a17d06534adce6182. Its test-merge a219e914f75a82fc5429082b0448e162f8ec5137 has parents d1 + head and tree 4fd953673b4b193dafc6c2c103e98e3b833ce112, matching the reviewed candidate. It adds only the owned report path, with five #509-to-#510 reference corrections across four lines. Root Standards/Spec/privacy-security review passed in [comment 5977140614](https://github.com/samarquis/AntiqueTrail/pull/508#issuecomment-5977140614); raw diff is 27,730 bytes, SHA-256 dfdf8e6ddaed4935473dfecda836e7e27026a7e3bc5a6ffefef08dea444841c0, Git object ee0e885dff853bb061626602a40bff1f3d7dd1f8. Required CI run 37181623566 is running web and database; configured-owner-billing is pending, Supabase Preview is skipped. No merge admission. |

PR #518 changed only docs/evidence/configured-catalog-readiness/acceptance.md, scripts/configured-shopper-local.d.mts, scripts/configured-shopper-local.mjs, and scripts/configured-shopper-readiness.test.mjs. It did not change UI components, CSS, review-mode browser fixtures, or browser configuration. C3 UI evidence remains correctly bound to tree a8b9; no post-#518 local browser rerun was performed.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --- | --- | --- | --- |
| Exact composition | Accepted child source is present with no sibling work overwritten; every report-only leaf stays report-only | Compare merged PR heads, source paths, and exact main tree | PASS for current d1 baseline. Main tree is 0a8a29749d686b53fdbaf44e9a5a56c15e657fa4. Not final #506 composition while #505 remains pending. |
| Browse controls and #410 | Search, Apply, Clear, keyboard/pointer filtering, visible focus, semantic colors, and draft/applied state remain correct | Existing e2e/issue-410-browse-controls.spec.ts and e2e/design-review-filter-commit.spec.ts; exact-main CI | PASS on current d1 web CI. The #410 test checks actual theme, contrast, location color, results, Apply, and Clear. PR #514 adds direct draft-preservation and commit coverage. |
| Browse responsive/accessibility | Narrow layout, exactly 800px column count, focus, target size, 200% reflow, text spacing, forced colors, reduced motion, notice boundary, empty/error/retry states | #503 report plus exact-tree C3 local evidence; current-main CI | PASS for mapped automated criteria. C3 DS131 passed 26/26 at source 378c53d7/tree a8b9. Supplemental private packet passed 11/11 browser cases and 2/2 component cases: exact-800 Browse 2/2; Retry click/recovery 1/1 component case; Details matrix 8/8; lower-photo cover 1/1 browser case. Physical device/screen-reader review remains #488. |
| Details layout/photos | 320/390/800/1280 in light/dark, no overflow, target sizing, sections/back focus, empty-media fallback, and lower selection updating the offscreen hero | #504 report plus exact-tree C3 local evidence; current-main CI | PASS for the added local matrix and fallback/selection observations. Matrix was 8/8; empty-media fallback was 1/1 component; lower-photo selection was 1/1 browser. Full-page lazy-photo blanks/fixed navigation are capture limits, not product failures. |
| Freshness and provenance | Exact current/overdue/unavailable dates remain honest; current/stale/unknown provenance and dark/light contrast/axe checks remain intact | src/features/catalog/components.test.tsx; e2e/issue-467-provenance.spec.ts; relevant e2e/theme.spec.ts; main web CI | PASS. Component tests assert exact visible date text and Photos-page empty copy/return link. The provenance browser case checks current/stale/unknown fixtures, actual light/dark theme, disclosure, and contrast; theme cases cover stale-status and dark-route axe. Details media=[] fallback is separate component evidence. These stay bound to their recorded tests and main CI; no broader physical-AT claim. |
| Availability handoff | Distinguish known local 503 and later 200 observations without inferring a backend cause; integrate only reviewed #505 report | #505 report review, owner's exact SHA, focused evidence, required CI, root review | PENDING CI. Candidate bf7b... passed root Standards/Spec/privacy-security review; PR #508 is pushed against d1 and its exact-head web/database checks are running. Configured-owner-billing is pending. Root must verify all required checks and composition before any #506 merge. #516 does not prove #505 cause. |
| Final candidate gates | Whole-candidate checks, affected browser proof, exact-SHA Standards/Spec review, and required CI pass after final composition | npm run check, applicable npm run verify:web, required PR CI, independent review | PENDING. Current-main success is a baseline receipt, not proof for a future #505-integrated candidate. |
| Release/human/hosted boundary | Keep recovery, publication, phone/AT, and account/inbox gates separate from local and CI evidence | #507, #511, #488, and #428 receipts/owners | OPEN and separate. No canonical production or hosted account acceptance claimed. |

Supplemental C3 evidence is local synthetic review-fixture behavior, not a hosted or production capture. Its private plan SHA-256 is 0f256c902d3af1926bf0408b946b7d00beec9e75266eb8b84f430cbea657b998; root-verified asset manifest SHA-256 is 8e037f666689b8424bb3243acca20c81c9a94e4c27727f9a1dbc8886fb8f1785. The packet is not attached to this repository; these hashes identify the private evidence, not a public reproduction recipe. Original C3 DS131 receipt binds spec SHA-256 aa5583b3f8d9bc5b8ceb02d33a01a29e3d53e4709a2bf8d918ff4c21a5c2975e, runner SHA-256 564f9d7f1af0c91015ed291b25477d765c25f892aa0d9fbf6af07e44b3ae97cb, and execution-summary SHA-256 0a7c39dbf682f61beeb77ac3469c5fd2f36d0d543764b2dc567c20eae66e49f5.

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| --- | --- | --- | --- |
| Child regression suites | PR-linked focused tests and reports | Passed at their reviewed child candidates; see the linked PR acceptance files | Individual child commits, not one final #506 candidate |
| Current-main CI | GitHub push run 37180201315: database 111371057275, web 111371057321, configured-owner-billing 111371516323 | All three passed on exact d1. Configured-browser artifact 11294887365 metadata SHA-256 e889b9302db804761a6ef050f1fec9f4f9b898b57a1a34263a930425443cf108; extracted report SHA-256 e06031bee673c9142b8a091f737eb98cacb94b947c32bc8689d2c15d642cbd33 confirms clean source, cleanup removed, errors [], 6 Representative + 3 Owner/cancellation pass, zero unexpected/skipped/flaky | Merged main d1; GitHub CI, synthetic/local-service browser harness |
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

## Independent review

- Reviewer: root and independent Standards/Spec reviewers for the completed child candidates
- Standards verdict: PASS for completed child candidates; not yet run on a frozen final #506 candidate
- Spec verdict: PASS for completed child candidates; final parent map remains pending #505
- Final verdict: BLOCKED
- Findings and disposition: one remaining dependency is successful required CI and root composition verification for the pushed #505 report candidate. Then freeze the composed candidate, refresh only affected evidence, run required whole-candidate checks, and obtain independent exact-SHA review. No #506 issue/PR update, merge, deployment, provider mutation, or additional local browser run was performed for this draft; the separately authorized #505 PR update is recorded above.

## Unverified

- #505 candidate bf7b23c66ef87069dd44b525584eb1a1c666ee86's required CI, root composition verification, and final handoff.
- A frozen final #506 source candidate and its affected-evidence refresh, required checks, independent review, and any authorized main integration.
- Human phone/screen-reader review (#488), hosted account/inbox lifecycle (#428), release recovery/custody and canonical rendered proof (#511/#507).
- No canonical production route, remote production API, or physical assistive-technology claim.

## Invalidation

This map describes current main d1 and C3 local evidence at tree a8b9. The d1 main-push CI run is exact only for d1. Any later product-source, browser fixture/configuration, or evidence-assertion change requires reassessing and rerunning affected proof on the frozen #506 candidate. An unrelated main advance alone does not stale these receipts; check overlap and current branch protection. Update this file with #505's exact pushed SHA, new CI/artifact identities, final candidate SHA, and diff fingerprint before parent acceptance.
