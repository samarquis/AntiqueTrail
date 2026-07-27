# Codex Start Prompt

You are working on a new commercial-grade public Progressive Web App with the working name **Antique Trail**.

Read every Markdown file in this folder before proposing architecture or writing code.

## Product goal

Build an easy-to-use application that antique shoppers can use before, during, and after a shopping trip. The product should be professional and trustworthy enough that antique-store owners will display printed flyers and QR codes promoting it at their registers.

## Core product promise

> Discover antique stores that match your interests, plan an efficient shopping route, and keep track of every place and piece you find.

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

## First assignment

Do not begin implementation immediately.

1. Review the PRD and identify contradictions, missing launch requirements, and unresolved product decisions.
2. Produce a concise architecture proposal.
3. Produce a threat model and authorization matrix.
4. Propose an MVP scope that can be launched regionally.
5. Create a phased backlog with acceptance criteria.
6. Recommend a repository structure.
7. Identify external services and expected cost/risk areas.
8. Wait for approval before scaffolding the application.

Treat the documentation as the source of truth. Record major technical choices as Architecture Decision Records.
