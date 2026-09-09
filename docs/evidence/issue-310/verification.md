# Issue 310 — Full-width Store Details plan amendment

Date: 2026-09-09. Scope: documentation amendment only. Baseline: `fd8382f9adbe7bbd85c37b1a07a368cc9db490a2`. The PR head identifies the immutable candidate containing this receipt; no application code, assets, migrations, or configuration are changed.

## Authority and acceptance mapping

The Product Owner's exact directive was `update plan for this full-width store layout.` [PLAN_CHANGELOG.md](../../../PLAN_CHANGELOG.md#2026-09-09--full-width-desktop-store-details-composition) records the reason, evidence, sources, consequences, and issue boundaries.

| Criterion | Evidence |
| --- | --- |
| 1 — Section order and journey | [Store Details scroll sequence](../../../DESIGN.md#store-details-scroll-sequence): introduction, exploration, visit planning, listing context, continuation; ordinary section jumps; unchanged Browse, gallery, and sign-in/cancel continuations. |
| 2 — Reproducible layout | [Full-width Store Details](../../../DESIGN_SYSTEM.md#full-width-store-details): desktop page width, content gutters, local prose/table bounds, component grid, narrow/intermediate reflow, media failures, sticky/focus behavior, and later application acceptance. |
| 3 — Consistent authority | DESIGN and DESIGN_SYSTEM own their rules, PRODUCT_DECISIONS links them, and the changelog appends authorization. All four changed owners already appear in the 53-file manifest. The separate 50-photo proposal in #309 is neither approved nor implemented. |
| 4 — Verification and delivery | Local checks below passed. Independent candidate review, required hosted checks, merge, and issue closure must be verified on GitHub before this amendment is called complete. |

## Local verification

- `node --test scripts/plan-governance-contract.test.mjs`: 10 passed, 0 failed.
- The repository's `validatePlanTicket` accepted the five-section issue body; live issue #310 was read back after creation.
- `validatePlanPullRequest` accepted the dedicated amendment body and four changed plan files, including full changelog before/after contents normalized to Git line endings.
- `git diff --check`: passed. Changelog diff contains additions only, and its normalized prior content is an exact prefix of the amendment.
- Parsed `manifest.json`, verified all 53 listed paths exist, and confirmed all four changed plan owners are already in that manifest.
- Checked all 255 Markdown local file/heading references across manifest-owned Markdown files: 0 missing files/headings, 0 baseline or newly introduced failures. The new reference from this evidence file to the dated changelog was separately verified against its actual heading.
- Compared DESIGN_SYSTEM's existing color, typography, and identity token section with the baseline: unchanged. Compared DESIGN's complete dedicated `Store photo gallery page` section with the baseline: unchanged.
- Searched current owning product/design/capability documents for stale Store Details width rules. The former desktop-only 720px constraint is replaced in its current owner; the intermediate 801–1023px centered layout and other route limits remain intentional.

The deterministic manifest/reference/body checker and its JSON report are task-local review tools; they are not new application scripts or product authority. The above checks do not execute or accept the later UI implementation.

## Review coverage

The candidate must be independently assessed under these seven lenses, with findings preserved before repair: (1) authorized product scope and connected journey, (2) document ownership and manifest/reference consistency, (3) visual/component reproducibility, (4) responsive/accessibility/keyboard/focus states, (5) private-action/authentication and privacy boundaries, (6) media entitlement/quality/failure behavior and the separate gallery route, and (7) delivery, evidence, fixture, and activation boundaries. This receipt records review scope, not an independent verdict; the actual candidate review is recorded with the PR evidence.

## Concept evidence boundary

The owner reviewed a local interactive four-photo concept using the maintained synthetic Blue Finch imagery and existing font files. The prior concept checks demonstrated full-width desktop imagery, narrow layouts without horizontal product overflow, in-page section jumps, photo enlargement, arrow-key navigation, Escape close, and focus return. The main implementation still contains its previous width rules. This amendment is not production browser acceptance, backend/provider proof, a full accessibility audit, recruited-participant evidence, or a release/paid/fixture-expansion authorization.
