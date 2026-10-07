# Current Project State

Workflow metadata updated: 2026-09-28. This update did not revalidate every implementation claim below. This document records implementation facts, not live GitHub, provider, credential, deployment, or worktree state. Recheck named evidence and live systems before acting or claiming completion. Evidence applies only to its named SHA and environment.

## Scope reconciliation — 2026-10-06

The Product Owner approved the shopper-first documentation cleanup. [PRD](PRD.md) describes target behavior, not deployed availability. Static inspection at `d075998137c501c6ff7252880ad59500e59bec16` found reusable catalog, trips/private memory and portal code plus gaps in candidate-to-trip/address/location flow; no new runtime or provider proof was run. See [source and backlog reconciliation](docs/plans/shopper-first-scope-review.md). Existing exposure, data and active release work remain intact; no implementation, deployment or issue closure is claimed by this amendment.

## Brand selection — 2026-09-28

The Product Owner selected Vintage Day Out in the scoped direction recorded in issue #370. PRD.md owns the selected name and migration boundary; DESIGN.md owns its stage-appropriate messaging. This plan selection does not rename the application, repository, package, or identity tokens, acquire a domain, clear the name, change a stage, or activate public branding. Those remain separate work and evidence gates.

## Summary

The application and repository still use Antique Trail/AntiqueTrail identifiers pending a separate migration. Vintage Day Out is the selected plan-level product name. The application is a working React/TypeScript/Vite PWA with a Supabase/PostgreSQL backend, in beta on Vercel hobby tier with Supabase. The maintained catalog-only exposure follows ADR 0010 and the exact Macvicar exception in ADR 0011. Wider feature activation requires separate admission and current evidence.

## What is implemented

- Browser storefront: list/搜索 store cards, store details pages
- Shopper saves and trips (trip planning with stores)
- Private ratings and notes
- Store Representative workflows (claim listing, manage hours)
- Administrator workflows
- Review harness (deterministic synthetic catalog)
- Supabase auth (email/password + approved social providers)
- Supabase migrations, RLS, RPC surfaces
- CI

## What is staged off

- **Stripe billing** (`photo_tiers_enabled` = false, prices unset). Stripe is the selected provider (hosted Checkout, webhooks, customer portal). Never collect card details in-app.
- **Public reviews** — server denies public review routes during alpha/beta.
- **Wider public release** remains unapproved. Apply hosting, security and operational requirements to the proposed exposure; a custom domain is not a prerequisite for the existing approved catalog test.

## Business model

- Free listing and optional paid photo capacity; [membership specification](docs/specs/store-membership-spec.md) owns the offer.
- Photos occupy capacity until replaced or explicitly removed. No monthly deletion; paid prices/capacities remain undecided.
- First outing and unpaid owner evaluation do not require billing. Stripe remains selected for separately approved paid activation.

## Where work is tracked

GitHub issues/PRs are the live backlog.

Delivery procedure is defined in `AGENTS.md` and `docs/operations/ENGINEERING_WORKFLOW.md`. Durable acceptance records use `docs/evidence/TEMPLATE.md`; large generated artifacts remain in CI/provider storage.

## Conventions

- `npm run check` must pass from a clean worktree
- Supabase CLI 2.33.9 is broken; use 2.115.0 (see README)
- Local, database, browser, hosted, and canonical-production results are separate evidence gates
