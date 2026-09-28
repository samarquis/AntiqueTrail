# Current Project State

Workflow metadata updated: 2026-09-28. This update did not revalidate every implementation claim below. This document records implementation facts, not live GitHub, provider, credential, deployment, or worktree state. Recheck named evidence and live systems before acting or claiming completion. Evidence applies only to its named SHA and environment.

## Brand selection — 2026-09-28

The Product Owner selected Vintage Day Out in the scoped direction recorded in issue #370. PRD.md owns the selected name and migration boundary; DESIGN.md owns its stage-appropriate messaging. This plan selection does not rename the application, repository, package, or identity tokens, acquire a domain, clear the name, change a stage, or activate public branding. Those remain separate work and evidence gates.

## Summary

The application and repository still use Antique Trail/AntiqueTrail identifiers pending a separate migration. Vintage Day Out is the selected plan-level product name. The application is a working React/TypeScript/Vite PWA with a Supabase/PostgreSQL backend, in beta on Vercel hobby tier with Supabase. Public release is not authorized yet.

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
- **Public release** — NO-GO. Blocked on hosting upgrade, domain purchase, security/operational evidence.

## Business model

- Free tier: claim listing, upload 5 photos/month
- Paid tier: $30/month unlimited photos
- Stripe Checkout for subscription purchase

## Where work is tracked

GitHub issues/PRs are the live backlog.

Delivery procedure is defined in `AGENTS.md` and `docs/operations/ENGINEERING_WORKFLOW.md`. Durable acceptance records use `docs/evidence/TEMPLATE.md`; large generated artifacts remain in CI/provider storage.

## Conventions

- `npm run check` must pass from a clean worktree
- Supabase CLI 2.33.9 is broken; use 2.115.0 (see README)
- Local, database, browser, hosted, and canonical-production results are separate evidence gates
