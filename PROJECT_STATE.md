# Antique Trail Current Project State

Status date: 2026-09-03. Code baseline: `origin/main` at `ab8cee725a7f33b0db2a4f6186657db372ec4af9`.

This file is the current-state index. It reports what is implemented, what is merely specified or scaffolded, what is blocked, and where current work is tracked. It does not replace the product, design, security, package, or ADR contracts in `README.md`.

## State vocabulary

- **Approved**: Product Owner intent is settled and may guide implementation.
- **Implemented**: code or documentation exists on `main`; this is not automatically production-accepted.
- **Verified**: the named local or hosted check has evidence for a specific commit and scope.
- **Staged off**: implementation may exist, but a server-enforced capability or provider gate prevents live use.
- **Release-blocked**: public or external use is prohibited until the named human/provider evidence passes.
- **Historical**: useful evidence from a dated baseline, not a statement about the current tree.

Issue closure proves only its accepted repository outcome or external gate. It does not imply another gate or public-release readiness.

## Product Owner decisions through 2026-09-03

### Locked plan governance

The controlling plan and design are locked by default. Only an explicit Product Owner directive containing `update plan` authorizes a plan amendment; tickets, critiques, prototypes, implementation requests, and pull requests cannot silently change intended behavior. `PLAN_GOVERNANCE.md` controls amendments, decisions, ticket admission, traceability, and closure, while `PLAN_CHANGELOG.md` records authorized amendments append-only.

Repository templates and workflows enforce a short problem-to-plan-to-outcome-to-evidence trace. Implementation tickets contain one outcome and at most five acceptance criteria; external activation evidence belongs in separate gate issues. Protected plan changes still require both the authorization directive and an append-only changelog receipt.

### Current color and visual direction

The existing Daylight Archive light theme, Midnight Archive dark theme, and approved V3 storefront identity are the selected direction. Their current values in `DESIGN_SYSTEM.md` remain controlling. Issue #142 completed semantic color-token conformance in merged PR #166 without replacing the approved palette. Issue #146 was closed under its recorded plan-governance disposition; any future mood, voice, or review-reference amendment must remain consistent with this visual direction and receive the required authorization.

### Login system

Antique Trail uses Supabase Authentication. Public catalog browsing remains available without an account; private actions use just-in-time sign-in and return the person to the interrupted task. Shopper login supports the repository's email/password and approved social-provider flow; Store Representatives and Administrators retain their stricter verified-email, MFA, admission, recent-authentication, role, and exact-scope requirements. Authentication establishes identity; authorization remains server-enforced through RLS, grants, RPC/Function checks, revocation, and lifecycle controls in `SECURITY_AND_TRUST.md`.

The login UI, auth adapter, callback, recovery, MFA, account-lifecycle, and protected-route surfaces are implemented on `main`. Production readiness still depends on current provider configuration, email delivery where required, hosted allow/deny tests, and the applicable H-01/E-01/security/release evidence. A working review-harness login is not production-auth evidence.

### Stripe payments

Stripe is the selected payment provider for Store Representative photo-tier memberships. The approved boundary is Stripe-hosted Checkout, verified webhooks, and Stripe's customer portal; Antique Trail must never collect or persist card details. Payment does not publish a listing or grant Administrator authority.

The staged-off Stripe groundwork is implemented, including billing functions, subscription mirror state, checkout/portal commands, webhook handling, lifecycle jobs, and the current Boolean `photo_tiers_enabled` capability. It remains false, prices remain unset, and no live billing is authorized. The amended plan now requires later implementation to replace/derive that Boolean from `off_prelaunch | sales_open | servicing_only`, bind Checkout to versioned commercial consent/configuration, and use a composite activation receipt; none of those amendments is implemented by this document change. Free-tier pilot stores remain free and are not removed for nonpayment.

### Prospective-store acquisition amendment

The Product Owner approved the public owner-acquisition plan on 2026-08-30. The controlling plan now specifies a dedicated `/for-stores` page, a separate prospective-owner QR/card, public Free claim/add-store intake after Package 10B, and Administrator approval that atomically creates the listing/scope/Free before any optional later paid upgrade. This is approved plan intent only: the route, card, public add-store state machine, Free-provisioning transaction, renamed tier values, commercial copy/config/consent, sales lifecycle, and composite activation are not established as implemented or live by this amendment. Prices remain unset and the current Boolean remains false; paid activation additionally requires signed Package 10B, RG-01, three separately approved passing community reviews, an inactive commercial-research authorization, signed owner-value packet, final monetization decision ratifying the exact config, Package 13/current provider evidence, and a signed composite activation receipt.

## Current implemented baseline

- The React/TypeScript/Vite PWA, deterministic review harness, Supabase/PostgreSQL data boundary, migrations, RLS/RPC/Edge surfaces, and CI exist.
- Public Store Browser/Details, shopper saves/trips/private memory, Store Representative workflows, Administrator workflows, staged review/release surfaces, and account lifecycle have substantial implemented coverage.
- The 2026-08-28 through 2026-08-30 critique tranche merged improvements for review-harness context (#145), form contrast (#141), Store Portal status grouping (#149), catalog action grouping/detail/readability (#148/#151/#147), trip CTA hierarchy and safe removal (#150), sparse Administrator queue composition (#152), semantic typography (#144), and resilient photo overlays (#143).
- `DESIGN_SYSTEM.md` now contains the semantic typography and public-media overlay contracts. The composition lessons promoted by this reconciliation are also normative there.
- These statements describe repository scope, not a public launch. Synthetic browser evidence remains distinct from production RPC/RLS/provider evidence.

## Backlog and repository synchronization

GitHub issues and pull requests are the only live backlog. `OPEN_TICKET_TODO.md` defines workflow but contains no status ledger. After this amendment merges, each open issue must be classified as keep, split/replace, close, or external gate; live issue state and comments hold the result.

On 2026-09-03, current `main` passed `npm run check` and `npm run security:contract` from a clean worktree. Every committed local branch/worktree tip found during the reconciliation was pushed to a remote preservation branch; remaining untracked files were left untouched and are not part of `main`. This proves recoverability, not that every preserved branch should merge.

## Release state

Public release is **NO-GO**. Issue #56 and `docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md` control the remaining provider, human, operational, security, brand/domain, synthetic-checkpoint, and launch receipts. The ledger's 2026-08-23 row counts are historical until re-audited; scaffolding, migrations, green local tests, or a closed implementation ticket do not satisfy those gates.

This plan amendment does not activate Vercel publication, Supabase shared-stage capabilities, Stripe billing, public reviews, real provider calls, owner outreach, external participation, promotion, or public release.

## Document maintenance rule

Update this file when a decision, material capability, or release state changes. Do not copy live issue lists into it. Preserve historical reviews and ledgers as snapshots; add a superseded banner instead of rewriting their original findings.
