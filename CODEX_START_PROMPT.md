# Codex Start Prompt

You are working on a new commercial-grade public Progressive Web App with the working name **Antique Trail**.

Read `PROJECT_STATE.md`, `PLANNING_INDEX.md`, and the controlling sources named below before proposing architecture or writing code. Historical reviews, ticket plans, and gate ledgers are evidence, not global current authority.

## Product goal

Build an easy-to-use application that antique shoppers can use before, during, and after a shopping trip. The product should be professional and trustworthy enough that antique-store owners will display printed flyers and QR codes promoting it at their registers.

## Core product promise

> Antique Trail makes a fun day of antique shopping easy to see, easy to plan, and easy to trust.

## Critical constraints

- This is a public multi-user application, not a personal app.
- Do not include names, personal photos, household details, or private preference assumptions from the original product discovery.
- Public store ratings must behave like a general 1–5 star aggregate rating.
- Personal store ratings, notes, finds, trips, collections, and preference profiles are private by default.
- Public ratings, personal ratings, and personalized match scores are separate concepts.
- Security, privacy, moderation, authorization, logging, backups, and incident response are launch requirements.
- Do not trust the frontend for authorization.
- Use deny-by-default database access policies.
- Never expose service-role credentials or private storage URLs to clients.
- Precise location should be collected only when needed and should not become hidden background location history.
- Build PWA-first and preserve a future path to an Android package through Capacitor.
- Use ADR 0006 for Vercel frontend deployment and ADR 0005 for the retained free-first Supabase/recovery/cost topology. No automatic paid upgrade/overage is authorized. If the selected Vercel plan is ineligible or cannot meet a stage's access, security, recovery, or availability gate, block the stage.

## Initial technical direction

Preferred stack unless a documented architectural reason changes it:

- React
- TypeScript
- Vite
- Supabase/PostgreSQL
- Supabase Authentication
- Supabase Storage
- Row Level Security
- A mapping/routing provider selected through an architecture decision
- Waze and Google Maps deep-link handoff
- Capacitor later for Android packaging

## Current implementation status

The 2026-07-31 coding hold is historical: subsequent Product Owner-directed implementation is present on `main`. Continue only work explicitly requested by the Product Owner or already authorized in a controlling contract; do not infer permission for live provider activation, billing, external contact, real-store data, promotion, or release. `PROJECT_STATE.md` is the dated implementation/backlog/release index. D31 full Audit History UI/export, the final public domain, paid production recovery authority, provider receipts, independent security review, named human operational roles, and post-Topeka expansion choices remain gated as documented.

1. Read `PROJECT_STATE.md`, `PLANNING_INDEX.md`, `PRD.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `PRODUCT_DECISIONS.md`, `SECURITY_AND_TRUST.md`, `IMPLEMENTATION_PLAN.md`, `PACKAGE_CONTRACTS.md`, and `PLAN_ACCEPTANCE.md` before editing.
2. Treat the Package 1 starting instruction in `IMPLEMENTATION_PLAN.md` as historical sequencing; inspect current code, live issues, and accepted contracts before selecting work.
3. Treat unresolved decisions as gates only for their dependent feature or release; do not invent policy.
4. Do not add a real store, contact an owner, admit an external participant, advertise, or launch publicly before the documented gates pass.
5. Keep D31 full Audit History UI and export out of scope until approved; retain append-only privileged events for two years and implement only narrow D30 `View Audit` access.
6. Treat Package 1 as the first coding slice, `SLM-01` as a later private Synthetic checkpoint after Packages 1/2/3/5A, Packages 1–10B as Regional Public MVP delivery, Package 11 as postlaunch RG-01, and Package 12 as one separately approved small-community activation. No milestone authorizes the next one.
7. H-01 precedes any shared activation; E-01 gates real email; R-01 gates provider-backed routing/geocoding; M-01 gates real media; L-01 gates privileged shared/external mutation; S-01/HC-01 gate first owner contact; SEC-01/B-01/HC-02 and public recovery precede Package 10B; A-01 analytics remains optional. Stripe is selected for store photo-tier payments, but `photo_tiers_enabled` remains false until its signed activation and release gates pass. Regional Public remains blocked until 15-minute RPO/four-hour RTO is proven.
Use the source-precedence table in `README.md` when documents differ. Record major technical choices as Architecture Decision Records.
