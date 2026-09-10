# Issue 316 — Fixture-only 50-photo synthetic store-wall evaluation plan amendment

Date: 2026-09-09. Scope: documentation amendment only. Baseline: `8f74805`. The PR head identifies the immutable candidate containing this receipt; no application code, assets, migrations, or configuration are changed.

## Authority and acceptance mapping

The Product Owner provided `update plan` for the 50-photo evaluation on 2026-09-09 and chose the fixture-only evaluation profile over any tier/entitlement change. [PLAN_CHANGELOG.md](../../../PLAN_CHANGELOG.md#2026-09-09--fixture-only-50-photo-synthetic-store-wall-evaluation-profile) records the reason, evidence, sources, consequences, and ticket boundaries.

| Criterion | Evidence |
| --- | --- |
| 1 — Profile, store set, count, boundary | PRD.md — Next milestone: Free private experience evaluation now names the fixture-only 50-photo evaluation profile with a designated store set and an approximate 50-photo count, and Official Store Profile Photos states the profile is a separate internal surface that never changes public capacity. |
| 2 — DESIGN.md scope | New [Fixture-only 50-photo evaluation profile](../../../DESIGN.md#fixture-only-50-photo-evaluation-profile) defines the 12 designated Synthetic Stores, the approximate 50-photo count, internal-only labels, provenance, meaningful alt text, and the separate sparse/empty-media boundary; the existing Store photo gallery page interaction contract is unchanged. |
| 3 — DESIGN_SYSTEM.md surface | Production navigation and routes now records `/stores/:slug/photos` as the full store photo gallery page with Back/keyboard/lightbox/reduced-motion/missing-image/return-to-details contracts; Shared asynchronous-state matrix adds a Photo wall row covering loading, empty, failure, and success states. |
| 4 — Consistent authority | PRD, DESIGN, and DESIGN_SYSTEM own their rules; PRODUCT_DECISIONS links them; the changelog appends authorization. All changed owners already appear in the manifest. |
| 5 — Verification and delivery | Local governance, manifest, reference, JSON, whitespace, and append-only checks below passed. Independent candidate review, required hosted checks, merge, and issue closure must be verified on GitHub before this amendment is called complete. |

## Local verification

- `node --test scripts/plan-governance-contract.test.mjs`: passes existing suite.
- The repository's `validatePlanTicket` accepts the five-section dedicated body; live issue #316 was read back after creation.
- `validatePlanPullRequest` accepts the dedicated amendment body, the changed protected plan files, and the append-only changelog receipt (full before/after contents normalized to Git line endings).
- `git diff --check`: passed. Changelog diff contains additions only; its normalized prior content is an exact prefix of the amendment.
- Parsed `manifest.json`, verified all listed paths exist, and confirmed all changed plan owners are already in the manifest.
- Validated local file/heading references introduced by the amendment (DESIGN.md anchor to PRD.md, DESIGN_SYSTEM.md anchors to DESIGN.md, PRODUCT_DECISIONS link to changed headings) against actual headings.
- Confirmed the existing Store photo gallery page contract wording is preserved (only a new appended profile heading follows it) and no public photo entitlement or real-media gate is weakened anywhere.

The deterministic manifest/reference/body checker is a task-local review tool, not a new application script or product authority. The above checks do not execute or accept the later fixture implementation.

## Review coverage

The candidate must be assessed under the lenses from the governing amendment pattern: (1) authorized product scope and connected journey, (2) document ownership and manifest/reference consistency, (3) profile/store-set/count precision, (4) non-confusability with public tiers and real-media gating, (5) gallery interaction, accessibility, and sparse/empty boundary preservation, and (6) delivery, evidence, fixture, and activation boundaries. This receipt records review scope, not an independent verdict; the actual candidate review is recorded with the PR evidence.

## Delivery boundary

This amendment authorizes the plan change only. The 50-photo fixture records, asset files, deterministic checks, browser journeys, and the exact-candidate deployment read-back are issue #309's separate governed work that may begin only after this amendment is reviewed, check-passing, and merged.