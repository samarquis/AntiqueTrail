# Publication lineage evidence for issue #499

## Candidate

- Issue: [#499](https://github.com/samarquis/AntiqueTrail/issues/499)
- Baseline in the issue: `81703453ee5e445ee3bdb1c38ef2cf8f81a362ee`
- Candidate SHA (source state assessed): `68751a42c9a05d1ffd7c129d8f1f409dccd1775a` (`main`)
- Live remote `main` matched the local source candidate at capture time.
- Work branch: `codex/issue-499-publication-lineage`
- Evidence owner: issue #499 diagnostic worker.
- Evidence captured: 2026-10-03 18:22:45 UTC
- Risk: low. This change records source and publication evidence only.
- Report snapshot reviewed in first review: `a44669c888d1beba1ef47263e7c0e4d7bd2aebb1`.
- Diff fingerprint for that exact report snapshot: `d5d11a2ea4a649d36ffa4082994a75bec97d2e36`.
- Reproduction command: `git diff --binary 68751a42c9a05d1ffd7c129d8f1f409dccd1775a a44669c888d1beba1ef47263e7c0e4d7bd2aebb1 -- docs/evidence/design-review-publication-lineage/acceptance.md | git hash-object --stdin`.
- The source candidate is the implementation state assessed by this report; the report snapshot identifies the exact prior evidence revision. New report revisions are bound to their review through the commit SHA in PR #509.

The source SHA names the repository state inspected. Verify it with the [GitHub commit record](https://github.com/samarquis/AntiqueTrail/commit/68751a42c9a05d1ffd7c129d8f1f409dccd1775a). No file hash is used.

## Scope

This report compares the account, trust, and missing-cover fixes in `main` with the evidence available for the documented canonical catalog. It does not change product code or provider state.

Changed outcome: durable evidence separates merged source fixes, rendered-route observations, and publication lineage. Rendered-route acceptance is partial; published-lineage acceptance remains blocked until its receipt is available.

Excluded scope: product/UI changes, browser or provider mutation, deployment, account access, and starting a new publication.

Overlapping branches/worktrees checked: active worktrees and open issue/PR ownership were inspected before work; the only overlapping catalog evidence PR was #508 for #505 on a different path.

Pre-existing failures or unrelated work: none changed or attributed to this report. The exact-head CI result below is a separate GitHub receipt and does not establish route rendering or deployed publication.

The report covers the source changes from #466, #467, and #470. Issue #496 and its contrast correction are recorded as a separate merged change so this report does not reopen or duplicate that work.

Source identity uses the inspected Git commit, not a file hash. Any browser follow-up must wait for measured page content and confirm the settled theme after each navigation.

## Source results at `68751a42`

| Symptom | Source evidence | Source result |
| --- | --- | --- |
| Account action reads like a generic sign-in requirement | [`CatalogPrivateActions`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/features/shopper/components.tsx#L425-L445) renders "Saving stores is paused for this public-test stage. Existing accounts can still sign in." when the catalog-only public-test stage is active. The details view also says correction drafts are available while submission is paused. | Fixed in source. The active branch is conditional on stage configuration. |
| Listing trust wording exceeds the shown provenance | [`CatalogCard`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/features/catalog/components.tsx#L299-L410) shows freshness and conditionally renders the fictional-listing disclosure. [`DetailsPage`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/features/catalog/components.tsx#L1488-L1505) labels the section "Source & freshness," conditionally repeats the disclosure, and gives explicit unavailable values for missing source and dates. | Fixed in source. No real-store verification is claimed. |
| Missing cover appears cramped | [`CatalogCard`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/features/catalog/components.tsx#L354-L364) renders “Photo coming soon” and exposes unavailable-image status to assistive technology. [`styles.css`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/app/styles.css#L1747-L1783) uses the catalog card ratio, spacing, and theme tokens. | Fixed in source. Two live examples observed; no screenshot or card-specific contrast measurement. |

## Merge receipts

| Issue | Merged PR | PR head | Merge commit | Live issue state |
| --- | --- | --- | --- | --- |
| [#466](https://github.com/samarquis/AntiqueTrail/issues/466) | [#480](https://github.com/samarquis/AntiqueTrail/pull/480) | `efdc323ff746d9d26889bf135fec844a9440e3cd` | `de76d381ca7b522b25c61eea20920569085f3b93` | Closed |
| [#467](https://github.com/samarquis/AntiqueTrail/issues/467) | [#493](https://github.com/samarquis/AntiqueTrail/pull/493) | `20f90bd2acc1ba4974d1dc2ff3cc32f8d5434fa0` | `82c516af77a1798fa618e6b1eecedef622af8ea8` | Closed |
| [#470](https://github.com/samarquis/AntiqueTrail/issues/470) | [#484](https://github.com/samarquis/AntiqueTrail/pull/484) | `5c5ad4df2e5c32ac96ec969ff1687faef0369042` | `1fd772a436226f0e2fa43136b3dbe33c4af65d90` | Closed |
| [#496](https://github.com/samarquis/AntiqueTrail/issues/496), adjacent contrast work | [#497](https://github.com/samarquis/AntiqueTrail/pull/497) | `b44d67ecf37659e421376604598ac66f52a279c1` | `68751a42c9a05d1ffd7c129d8f1f409dccd1775a` | Closed |

Git ancestry confirms the #480, #484, and #493 merge commits are in the inspected `main`. PR #497 merged directly to the inspected source SHA.

## Canonical route observations

The [stable anonymous alias](https://antique-trail.vercel.app) is named in [ADR 0010](../../adr/0010-free-public-test-publication.md). The ADR identifies the intended alias; it does not prove the alias currently serves a particular source.

**Capture:** An anonymous Chrome tab opened `https://antique-trail.vercel.app/stores` on 2026-10-03. CUA supplied no event timestamp. The settled view was 1620×855, `data-theme=dark`, and `color-scheme: dark`; computed body colors were background `rgb(18, 21, 25)` and foreground `rgb(243, 238, 228)`. These are global body values, not card-contrast evidence. The browser did not expose source, artifact, deployed configuration, or alias-to-source binding.

**`/stores`:** The page showed 12 stores to explore, heading “Discover local antiques.”, and tagline “Make a day of the shops, stories, and one-of-a-kind finds waiting around the corner.” Visible catalog copy included “Fictional sample imagery · Antique Trail”, “Fictional listings for safe product review”, and footer “Synthetic catalog · Built for curious local explorers”. Cards showed “Verification overdue · Verified July 15, 2026” and repeated “Account setup paused”. The navigation exposed “Saved stores Requires sign-in”.

**Live missing-cover cards:** Both appeared in the live `/stores` DOM and accessibility tree; no source fixture was substituted.

- **Velvet Veranda** (`/stores/velvet-veranda`, Home Decor): visible fallback “VV” and “HOME DECOR · PHOTO COMING SOON”; accessibility role `img`, name “Store image unavailable”. “VV” had `aria-hidden="true"`.
- **Willow Warehouse** (`/stores/willow-warehouse`, Furniture): visible fallback “WW” and “FURNITURE · PHOTO COMING SOON”; accessibility role `img`, name “Store image unavailable”. “WW” had `aria-hidden="true"`.

No separate accessible description appeared in either card's DOM or accessibility tree.

**`/stores/clockwork-cabinet`:** Not inspected. After `/stores` settled, selected-tab control and accessibility retrieval timed out; the CUA session reset and reconnect failed. No alternate tab or local server was used. Details-route copy, theme, viewport, and product-console output remain unknown.

No screenshot or console output was captured. Card-specific visual contrast was not measured. These observations do not establish a visual match, a source comparison, or publication of the inspected source. Route and fallback criteria remain partial/open in the parent/release acceptance map; this report does not mark parent acceptance complete.

## Reported release-owner checkpoint

The public [#511 recovery gate](https://github.com/samarquis/AntiqueTrail/issues/511) is open and blocked on a compatible isolated restore runtime and protected custom-secret custody. The release-owner checkpoint below was relayed to this task; this worker did not independently inspect its artifact, runs, or canonical deployment. The #511 link supports the recovery-gate status, not each reported count or deployment binding.

| Evidence class | Release-owner report | This report's evidence status |
| --- | --- | --- |
| Merged source | `main` at `68751a42c9a05d1ffd7c129d8f1f409dccd1775a` | Independently verified in this report. |
| Local prebuild | 669-file prebuilt artifact, SHA-256 `e1e0ba11770053e0f8a2448d13e288161aeec393322cd4b037f57cdf7002cc8c`, reported locally approved. | Reported only; artifact not inspected and not accepted as publication proof. |
| Hosted checks | Intercepted artifact reportedly has 32 main Axe scans and 20 hosted catalog HTTP 200 responses. | Reported only; no binding to canonical alias or exact deployed source/configuration. |
| Canonical deployment | Vercel deployment identifier `dpl_6zUinfmc3LhkpvH7ELAvSHxRyMnT` reported. | Not independently verified or bound to source, artifact, deployed configuration, or alias. Current canonical text/theme remain unknown. |

No new deployment, provider mutation, or database action was performed for this report.

## Publication lineage

The source configuration at the inspected SHA sets `git.deploymentEnabled` to `false` in [`vercel.json`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/vercel.json#L1-L5). A merge to `main` therefore does not establish that Vercel published the change.

The [five newest GitHub deployment records](https://github.com/samarquis/AntiqueTrail/deployments) returned during inspection were non-production. The newest record was for `shared-alpha`, used source `6f390a4f32db4c270e6761dce25ad494d324e9be`, and its [status](https://api.github.com/repos/samarquis/AntiqueTrail/deployments/6555038738/statuses) was `waiting` on 2026-09-20. The record for `main` was also `shared-alpha`, used source `ecda106078df2a0da6588a92ef745b39a548906d`, and was dated 2026-09-19. Neither record binds the canonical alias to the inspected source.

The configured Vercel connector returned no teams, and this worktree has no linked `.vercel/project.json`. No accepted publication receipt, artifact identity, deployed configuration identity, or source-to-alias binding was available to this worker at capture time. This records the worker's access limit; it does not prove that no deployment exists.

**Result:** source lineage is proved through `main` at `68751a42`. Published lineage is unavailable. The production gate remains blocked. A visual match cannot replace an exact source and artifact receipt.

## Acceptance

| Criterion | Observable condition | Verification method | Result/evidence |
| --- | --- | --- | --- |
| Source fixes already in `main` | Each closed issue maps to a merged PR and its merge commit is in the inspected source SHA. | Inspect linked GitHub issue/PR records and run `git merge-base --is-ancestor` for each merge commit at the named source SHA. | Pass; merge receipts above. |
| Current anonymous account and trust text | Observe the named canonical routes and compare their text with source. | Anonymous browser flow: visit `/stores` and `/stores/clockwork-cabinet`, wait for measured page text, confirm settled theme after each navigation, compare captured text with source. | Partial/open. `/stores` copy and settled dark theme recorded above; details route and source comparison remain unverified. |
| Missing-cover examples | Observe two coverless cards on the canonical `/stores` route. | Anonymous browser flow: identify two live cards without cover images and record each visible fallback and accessible name/description. | Partial/open. Two live cards and visible fallbacks/names recorded; no separate description, screenshot, or card-specific contrast measurement. |
| Published source identity | Bind the canonical alias to exact source, artifact, and configuration using a provider or accepted receipt. | Read-only provider/deployment receipt lookup; require source SHA, immutable artifact identity, deployed configuration, and canonical alias binding. | Blocked. No current receipt or provider project access was available. |
| No duplicate product issue | Preserve the closed #466, #467, #470, and adjacent #496 work. | Inspect live GitHub issue and merged PR states. | Pass; merge receipts above. |
| Public evidence privacy | Omit secrets, actor identifiers, private admission receipts, credential-bearing URLs, and workstation paths. | Scan the report and PR diff for those data classes. | Pass; no such content found in the report. |

## Verification

| Layer | Command or flow | Result | Environment |
| --- | --- | --- | --- |
| Source and issue history | `gh api repos/samarquis/AntiqueTrail/commits/main --jq .sha`; `git rev-parse refs/remotes/origin/main`; `gh issue view` and `gh pr view` for the linked issues and PRs; `git merge-base --is-ancestor` for each merge commit | Merged source facts verified at `68751a42` | Local source and GitHub |
| GitHub CI for preceding report candidate `c9c184c5895f9d65ba38eb3f9709907c4ab73e9e` | GitHub Actions run [37146685645](https://github.com/samarquis/AntiqueTrail/actions/runs/37146685645) | Web, database, and configured-owner-billing passed; Supabase Preview skipped. This preceding-candidate result does not cover the current report revision or establish browser/publication acceptance. | GitHub PR #509, preceding exact head `c9c184c5895f9d65ba38eb3f9709907c4ab73e9e` |
| Focused tests | Not run. This change contains evidence documentation only. | Not applicable | Local |
| Type/lint/format/build | Not run locally; this change contains evidence documentation only. | Not applicable locally | Local |
| Database/RLS/RPC | Not run; no schema, policy, RPC, or database data changed. | Not applicable | Local/database |
| Desktop/mobile UI | Anonymous browser review of the canonical routes and viewport layouts | Partial; `/stores` observed at 1620×855; no screenshot/mobile viewport, details-route observation, or card-specific contrast measurement | Canonical alias |
| Accessibility/error states | Inspect the live missing-cover fallback, accessible name/description, and route error states | Partial; two live image roles/names and fallbacks recorded; no separate description or product error state observed | Canonical alias |
| Vercel metadata | Read-only team lookup and available GitHub deployment records | No team or current production receipt available | Provider metadata |
| Hosted/provider lifecycle | Read-only lookup for deployment source, artifact, configuration, and alias binding | Blocked; no accepted receipt or provider project access | Provider |
| Canonical production route | Anonymous browser review of the routes above | Partial; anonymous `/stores` text and settled theme recorded; `/stores/clockwork-cabinet` not inspected and source binding unknown | Canonical alias |
| Human review | Independent Standards and Spec review | Pending on the exact documentation PR head | GitHub PR |

## Security and negative proof

- Denied identities/scopes: not applicable; no authenticated route or account flow was attempted.
- Failure and timeout behavior: tab control/accessibility retrieval timed out after `/stores`; the details route was not visited. No product error state was observed. CI/provider results are not treated as route evidence.
- Secret/PII handling: no secrets, private admission receipt, actor identifier, credential-bearing URL, or workstation path is included. Read-only evidence only.
- Security review: no security behavior or source code changed; privacy check covered the report content.

## Independent review

| Reviewer | Standards verdict | Spec verdict | Final verdict | Findings and disposition |
| --- | --- | --- | --- | --- |
| Independent read-only review of snapshot `a44669c888d1beba1ef47263e7c0e4d7bd2aebb1` | REWORK | BLOCKED | BLOCKED | Standards requested candidate/fingerprint, acceptance verification methods, and these template sections; this revision adds them. Spec confirmed source claims were accurate and kept route and publication criteria blocked. Both reviews must be rerun on the updated PR head. |
| Updated PR #509 head | Pending | Pending | Pending | Exact-head review requested after this revision is committed. |

## Unverified

- The rendered text and settled theme on `/stores/clockwork-cabinet`, and source comparison for the observed `/stores` text.
- A separate accessible description, screenshot, and card-specific visual-contrast measurement for the two live missing-cover examples.
- The exact source, artifact, and deployed configuration behind the canonical alias.
- Any conclusion that the merged fixes are published.

The designated release owner must provide the existing publication receipt. This ticket does not start another deployment or alter provider state.

## Invalidation

Source claims apply only to `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`. A source or deployment change requires fresh lineage checks. Route observations are separate from that source SHA; this browser capture has a date but no exact event timestamp because CUA did not return one.
