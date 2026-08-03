# ADR 0004: Start with one React PWA and server-enforced role boundaries

- Status: Accepted for implementation scaffold
- Date: 2026-07-30

## Context

Antique Trail needs public shopper routes, private trip workflows, a Store Portal, and Administrator workflows. Earlier documents disagreed between a monorepo with separate web/admin applications and one deployable PWA. No second deployment cadence or reusable package boundary has been proven.

## Decision

Build one React/TypeScript/Vite PWA. Use Supabase Auth, PostgreSQL, Storage, and Edge Functions as the approved platform baseline from `CODEX_START_PROMPT.md` and `PHASE_0_REVIEW.md`.

Keep shopper, Store Portal, and Administrator routes in one deployable. Enforce separation at database RLS, storage policy, server-function, and scoped-grant boundaries; frontend route visibility is not authorization. Direct client database access is limited to simple RLS-protected public reads and owner-scoped private writes. Privileged transitions and provider calls use server functions.

Start with the single-app repository structure in `IMPLEMENTATION_PLAN.md`. Do not create a monorepo, shared package layer, or second Administrator application until a second deployable, separate release cadence, or measured isolation need exists.

Mapping/routing, hosting, analytics, email, store-data, and future shopper-image moderation providers require separate ADRs and data/cost review before dependent implementation.

## Consequences

- One build and deployment path reduces initial operational and accessibility work.
- Server-enforced authorization remains mandatory across every route and role.
- UI code may share components without sharing data permissions.
- A later split remains possible when evidence justifies its migration cost.
