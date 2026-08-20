# Codex Start Prompt

You are working on a new commercial-grade public Progressive Web App with the working name **Antique Trail**.

Read every Markdown file in this folder before proposing architecture or writing code.

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

Product discovery and the 2026-08-03 adversarial plan hardening are approved. D31 full Audit History UI/export, B-01 final public name/domain, paid production recovery budget, H-01/L-01 provider receipts, SEC-01 reviewer, named human backup/reviewers, and first post-Topeka community remain unresolved. Each blocks only its dependent stage. The product owner's 2026-07-31 coding hold remains controlling. Do not write application code until the Product Owner gives a separate explicit start instruction.

1. Read `PRD.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `PRODUCT_DECISIONS.md`, `SECURITY_AND_TRUST.md`, `IMPLEMENTATION_PLAN.md`, `PACKAGE_CONTRACTS.md`, `PHASE_0_REVIEW.md`, and `PLAN_ACCEPTANCE.md` before editing.
2. When and only when coding is explicitly authorized, begin with the bounded single-PWA Synthetic Store Browse/Details slice in `IMPLEMENTATION_PLAN.md`.
3. Treat unresolved decisions as gates only for their dependent feature or release; do not invent policy.
4. Do not add a real store, contact an owner, admit an external participant, advertise, or launch publicly before the documented gates pass.
5. Keep D31 full Audit History UI and export out of scope until approved; retain append-only privileged events for two years and implement only narrow D30 `View Audit` access.
6. Treat Package 1 as the first coding slice, `SLM-01` as a later private Synthetic checkpoint after Packages 1/2/3/5A, Packages 1–10B as Regional Public MVP delivery, Package 11 as postlaunch RG-01, and Package 12 as one separately approved small-community activation. No milestone authorizes the next one.
7. H-01 precedes any shared environment; E-01 real email; R-01 Package 5B routing/geocoding; M-01 real media; L-01 privileged shared/external mutation; S-01/HC-01 first owner contact; SEC-01/B-01/HC-02 and public recovery precede Package 10B; A-01 optional analytics. Regional Public remains blocked until 15-minute RPO/four-hour RTO is proven.
Use the source-precedence table in `README.md` when documents differ. Record major technical choices as Architecture Decision Records.
