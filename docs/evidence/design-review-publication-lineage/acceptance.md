# Publication lineage evidence for issue #499

## Candidate

- Issue: [#499](https://github.com/samarquis/AntiqueTrail/issues/499)
- Baseline in the issue: `81703453ee5e445ee3bdb1c38ef2cf8f81a362ee`
- Source candidate inspected: `68751a42c9a05d1ffd7c129d8f1f409dccd1775a` (`main`)
- Live remote `main` matched the local source candidate at capture time.
- Work branch: `codex/issue-499-publication-lineage`
- Evidence owner: issue #499 diagnostic worker.
- Evidence captured: 2026-10-03 18:22:45 UTC
- Risk: low. This change records source and publication evidence only.
- Diff fingerprint: recorded in the PR description for `git diff --binary <baseline> <candidate> -- docs/evidence/design-review-publication-lineage/acceptance.md | git hash-object --stdin`.

The source SHA names the repository state inspected. Verify it with the [GitHub commit record](https://github.com/samarquis/AntiqueTrail/commit/68751a42c9a05d1ffd7c129d8f1f409dccd1775a). No file hash is used.

## Scope

This report compares the account, trust, and missing-cover fixes in `main` with the evidence available for the documented canonical catalog. It does not change product code or provider state.

The report covers the source changes from #466, #467, and #470. Issue #496 and its contrast correction are recorded as a separate merged change so this report does not reopen or duplicate that work.

Source identity uses the inspected Git commit, not a file hash. Any browser follow-up must wait for measured page content and confirm the settled theme after each navigation.

## Source results at `68751a42`

| Symptom | Source evidence | Source result |
| --- | --- | --- |
| Account action reads like a generic sign-in requirement | [`CatalogPrivateActions`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/features/shopper/components.tsx#L425-L445) renders "Saving stores is paused for this public-test stage. Existing accounts can still sign in." when the catalog-only public-test stage is active. The details view also says correction drafts are available while submission is paused. | Fixed in source. The active branch is conditional on stage configuration. |
| Listing trust wording exceeds the shown provenance | [`CatalogCard`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/features/catalog/components.tsx#L299-L410) shows freshness and conditionally renders the fictional-listing disclosure. [`DetailsPage`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/features/catalog/components.tsx#L1488-L1505) labels the section "Source & freshness," conditionally repeats the disclosure, and gives explicit unavailable values for missing source and dates. | Fixed in source. No real-store verification is claimed. |
| Missing cover appears cramped | [`CatalogCard`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/features/catalog/components.tsx#L354-L364) renders “Photo coming soon” and exposes unavailable-image status to assistive technology. [`styles.css`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/src/app/styles.css#L1747-L1783) uses the catalog card ratio, spacing, and theme tokens. | Fixed in source. Rendered examples remain uninspected. |

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

No rendered-browser lease was available at capture time. The following observations remain unrecorded:

| Route or example | Result |
| --- | --- |
| `/stores` | Not inspected. Live account-action text is unknown. |
| `/stores/clockwork-cabinet` | Not inspected. Live trust, disclosure, and provenance wording are unknown. |
| Two missing-cover cards on `/stores` | Not identified in the rendered catalog. Source fixtures were not substituted for live examples. |

No live text, theme, screenshot, or visual match is claimed.

## Publication lineage

The source configuration at the inspected SHA sets `git.deploymentEnabled` to `false` in [`vercel.json`](https://github.com/samarquis/AntiqueTrail/blob/68751a42c9a05d1ffd7c129d8f1f409dccd1775a/vercel.json#L1-L5). A merge to `main` therefore does not establish that Vercel published the change.

The [five newest GitHub deployment records](https://github.com/samarquis/AntiqueTrail/deployments) returned during inspection were non-production. The newest record was for `shared-alpha`, used source `6f390a4f32db4c270e6761dce25ad494d324e9be`, and its [status](https://api.github.com/repos/samarquis/AntiqueTrail/deployments/6555038738/statuses) was `waiting` on 2026-09-20. The record for `main` was also `shared-alpha`, used source `ecda106078df2a0da6588a92ef745b39a548906d`, and was dated 2026-09-19. Neither record binds the canonical alias to the inspected source.

The configured Vercel connector returned no teams, and this worktree has no linked `.vercel/project.json`. No accepted publication receipt, artifact identity, deployed configuration identity, or source-to-alias binding was available to this worker at capture time. This records the worker's access limit; it does not prove that no deployment exists.

**Result:** source lineage is proved through `main` at `68751a42`. Published lineage is unavailable. The production gate remains blocked. A visual match cannot replace an exact source and artifact receipt.

## Acceptance

| Criterion | Observable condition | Result |
| --- | --- | --- |
| Source fixes already in `main` | Each closed issue maps to a merged PR and its merge commit is in the inspected source SHA. | Pass |
| Current anonymous account and trust text | Observe the named canonical routes and compare their text with source. | Blocked. No rendered-browser lease was available. |
| Missing-cover examples | Observe two coverless cards on the canonical `/stores` route. | Blocked. No rendered-browser lease was available. |
| Published source identity | Bind the canonical alias to exact source, artifact, and configuration using a provider or accepted receipt. | Blocked. No current receipt or provider project access was available. |
| No duplicate product issue | Preserve the closed #466, #467, #470, and adjacent #496 work. | Pass |
| Public evidence privacy | Omit secrets, actor identifiers, private admission receipts, credential-bearing URLs, and workstation paths. | Pass |

## Verification

| Layer | Command or flow | Result | Environment |
| --- | --- | --- | --- |
| Source and issue history | `gh api repos/samarquis/AntiqueTrail/commits/main --jq .sha`; `git rev-parse refs/remotes/origin/main`; `gh issue view` and `gh pr view` for the linked issues and PRs; `git merge-base --is-ancestor` for each merge commit | Merged source facts verified at `68751a42` | Local source and GitHub |
| Focused tests | Not run. This change contains evidence documentation only. | Not applicable | Local |
| Vercel metadata | Read-only team lookup and available GitHub deployment records | No team or current production receipt available | Provider metadata |
| Canonical production route | Anonymous browser review of the routes above | Not run. Awaiting the shared browser lease. | Production |
| Human review | Independent Standards and Spec review | Pending on the exact documentation PR head | GitHub PR |

## Unverified

- The current rendered text and settled theme on `/stores` and `/stores/clockwork-cabinet`.
- Two live missing-cover card examples and their rendered fallback.
- The exact source, artifact, and deployed configuration behind the canonical alias.
- Any conclusion that the merged fixes are published.

The designated release owner must provide the existing publication receipt. This ticket does not start another deployment or alter provider state.

## Invalidation

Source claims apply only to `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`. A source or deployment change requires fresh lineage checks. Route observations, if added, must record their capture time, route, settled theme, and observed text separately from the source SHA.
