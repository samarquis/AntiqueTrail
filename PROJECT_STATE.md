# Antique Trail Current Project State

Status date: 2026-08-30. Baseline: `origin/main` through planning-reconciliation PR #160 at `04fd795` plus the dated updates recorded below.

This file is the current-state index. It reports what is implemented, what is merely specified or scaffolded, what is blocked, and where current work is tracked. It does not replace the product, design, security, package, or ADR contracts in `README.md`.

## State vocabulary

- **Approved**: Product Owner intent is settled and may guide implementation.
- **Implemented**: code or documentation exists on `main`; this is not automatically production-accepted.
- **Verified**: the named local or hosted check has evidence for a specific commit and scope.
- **Staged off**: implementation may exist, but a server-enforced capability or provider gate prevents live use.
- **Release-blocked**: public or external use is prohibited until the named human/provider evidence passes.
- **Historical**: useful evidence from a dated baseline, not a statement about the current tree.

Issue closure proves only the issue's accepted scope. It does not prove provider configuration, production authorization, package acceptance, or public-release readiness unless those were explicit acceptance criteria.

## Product Owner decisions reaffirmed on 2026-08-30

### Locked plan governance

The controlling plan and design are locked by default. Only an explicit Product Owner directive containing `update plan` authorizes a plan amendment; tickets, critiques, prototypes, implementation requests, and pull requests cannot silently change intended behavior. `PLAN_GOVERNANCE.md` controls amendments, decisions, ticket admission, traceability, and closure, while `PLAN_CHANGELOG.md` records authorized amendments append-only.

Repository issue and pull-request templates plus plan-governance workflows enforce the required reason-to-plan-to-acceptance trace. Invalid tickets lose implementation-ready labels, and protected plan changes require both the authorization directive and a changelog receipt. Hosted `main` protection was verified on 2026-08-30: it applies to administrators, requires pull requests with resolved conversations and strict current-branch `web`, `database`, and `plan-governance` checks, and denies force pushes and deletion.

### Current color and visual direction

The existing Daylight Archive light theme, Midnight Archive dark theme, and approved V3 storefront identity are the selected direction. Their current values in `DESIGN_SYSTEM.md` remain controlling. Open issue #142 may improve semantic color-token governance and remove implementation drift, but it must not replace the approved palette. Open issue #146 may publish better mood, voice, and review references, but it must remain consistent with this visual direction.

### Login system

Antique Trail uses Supabase Authentication. Public catalog browsing remains available without an account; private actions use just-in-time sign-in and return the person to the interrupted task. Shopper login supports the repository's email/password and approved social-provider flow; Store Representatives and Administrators retain their stricter verified-email, MFA, admission, recent-authentication, role, and exact-scope requirements. Authentication establishes identity; authorization remains server-enforced through RLS, grants, RPC/Function checks, revocation, and lifecycle controls in `SECURITY_AND_TRUST.md`.

The login UI, auth adapter, callback, recovery, MFA, account-lifecycle, and protected-route surfaces are implemented on `main`. Production readiness still depends on current provider configuration, email delivery where required, hosted allow/deny tests, and the applicable H-01/E-01/security/release evidence. A working review-harness login is not production-auth evidence.

### Stripe payments

Stripe is the selected payment provider for Store Representative photo-tier memberships. The approved boundary is Stripe-hosted Checkout, verified webhooks, and Stripe's customer portal; Antique Trail must never collect or persist card details. Payment does not publish a listing or grant Administrator authority.

The staged-off Stripe groundwork is implemented, including billing functions, subscription mirror state, checkout/portal commands, webhook handling, lifecycle jobs, and the `photo_tiers_enabled` capability. The capability remains false, prices remain unset, and no live billing is authorized. Activation requires the Package 13 contract, relevant #123-#125 media/security/test repairs, provider secrets and webhook verification, tax/terms/refund configuration, current hosted tests, a signed activation receipt, and the still-required monetization/release decision. Free-tier pilot stores remain free and are not removed for nonpayment.

## Current implemented baseline

- The React/TypeScript/Vite PWA, deterministic review harness, Supabase/PostgreSQL data boundary, migrations, RLS/RPC/Edge surfaces, and CI exist.
- Public Store Browser/Details, shopper saves/trips/private memory, Store Representative workflows, Administrator workflows, staged review/release surfaces, and account lifecycle have substantial implemented coverage.
- The 2026-08-28 through 2026-08-30 critique tranche merged improvements for review-harness context (#145), form contrast (#141), Store Portal status grouping (#149), catalog action grouping/detail/readability (#148/#151/#147), trip CTA hierarchy and safe removal (#150), sparse Administrator queue composition (#152), semantic typography (#144), and resilient photo overlays (#143).
- `DESIGN_SYSTEM.md` now contains the semantic typography and public-media overlay contracts. The composition lessons promoted by this reconciliation are also normative there.
- These statements describe repository scope, not a public launch. Synthetic browser evidence remains distinct from production RPC/RLS/provider evidence.

## Open implementation and evidence backlog

Live GitHub state on 2026-08-30 contains these open items:

- P0/P1 product and evidence gaps: #123 rejected-media resubmission, #124 Package 13 pgTAP contract, #125 media-history minimization/storage-key privacy, and #126 media-ticket evidence reconciliation.
- Authorization and role-surface gaps: #130 Access & Safety detail/action flow, #131 Package 7 View Audit, #135 direct-route and cross-store isolation, #137 Administrator navigation, and #139 Store Representative People and access.
- Shopper and moderation UX gaps: #129 Saved-to-trip continuation and #140 staged moderation decisions.
- Design-governance gaps: #142 semantic color-token implementation and #146 governed mood/voice/token references. PR #158 for #146 was open as a draft with passing web/database checks; it is not part of the baseline until merged.
- Verification/release work: #117 staged-off browser sweep and #56 consolidated human/provider release gates.

GitHub is the live authority for issue details and state. This dated list must be refreshed rather than silently treated as permanent.

## Release state

Public release is **NO-GO**. Issue #56 and `docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md` control the remaining provider, human, operational, security, brand/domain, synthetic-checkpoint, and launch receipts. The ledger's 2026-08-23 row counts are historical until re-audited; scaffolding, migrations, green local tests, or a closed implementation ticket do not satisfy those gates.

No document or code change in this reconciliation activates Vercel publication, Supabase shared-stage capabilities, Stripe billing, public reviews, real provider calls, owner outreach, external participation, promotion, or public release.

## Document maintenance rule

Update this file when a decision changes, a material capability merges, the open backlog changes meaningfully, or a release gate receives dated evidence. Preserve historical reviews and execution ledgers as snapshots; add a superseded banner instead of rewriting their original findings. Use `PLANNING_INDEX.md` to decide which document owns a change.
