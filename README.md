# Antique Trail — Codex Handoff

This repository contains the approved product, design, security, architecture, and implementation baseline for Antique Trail. Planning work is active; application coding remains held until Scott gives a separate explicit start instruction.

## Start here

1. Read `CODEX_START_PROMPT.md` for current authority and stop conditions.
2. Read `PRODUCT_DECISIONS.md` for approved and unresolved product choices.
3. Read `PRD.md` for product requirements.
4. Read `DESIGN.md` and `DESIGN_SYSTEM.md` for interaction and reproducible visual rules.
5. Read `SECURITY_AND_TRUST.md` for trust, privacy, and operational controls.
6. Read `IMPLEMENTATION_PLAN.md` for delivery order and the Package 1 contract.
7. Read `PACKAGE_CONTRACTS.md` for Packages 2–12.
8. Read `PHASE_0_REVIEW.md` for the threat model, authorization matrix, architecture baseline, and remaining feature gates.
9. Read `PLAN_ACCEPTANCE.md` for the cross-document dependency and independent-build map.
10. Use `USER_RESEARCH.md` and `COMPETITIVE_LANDSCAPE.md` as research evidence, not current requirements.

## Source precedence

| Question | Controlling source | Supporting source |
|---|---|---|
| Current authorization and stop conditions | `CODEX_START_PROMPT.md` | `PRODUCT_DECISIONS.md`, `IMPLEMENTATION_PLAN.md` |
| Approved scope or unresolved product choice | `PRODUCT_DECISIONS.md` | `PRD.md` |
| Product behavior and acceptance requirement | `PRD.md` | `PRODUCT.md` |
| Interaction, screen flow, and copy intent | `DESIGN.md` | `DESIGN_SYSTEM.md` |
| Exact visual tokens, responsive rules, and component states | `DESIGN_SYSTEM.md` | `DESIGN.md` |
| Security, privacy, authorization, retention, and operations | `SECURITY_AND_TRUST.md` | `PHASE_0_REVIEW.md` threat model/matrix |
| Delivery order and Package 1 execution contract | `IMPLEMENTATION_PLAN.md` | ADRs |
| Packages 2–12 execution contracts | `PACKAGE_CONTRACTS.md` | `IMPLEMENTATION_PLAN.md`, ADRs |
| Cross-document dependency/acceptance index | `PLAN_ACCEPTANCE.md` | All controlling sources above |
| Architecture decision | Most recent accepted ADR | `PHASE_0_REVIEW.md` architecture baseline |
| Historical discovery evidence | `USER_RESEARCH.md`, `COMPETITIVE_LANDSCAPE.md` | Not normative |

If two controlling sources conflict, stop the dependent work and reconcile the documents. Do not choose whichever instruction is easier.

Architecture baseline is recorded in ADR 0004. ADR 0005 selects Cloudflare Pages Free plus Supabase Free for shared startup work, requires `$0` recurring infrastructure/no automatic overage, and blocks public release until the approved 15-minute RPO is funded or otherwise proven. Email, routing, media, support/status, and optional analytics retain their named feature gates. `manifest.json` is the documentation handoff inventory, not the installable PWA web-app manifest.

## Product direction

Build a professional, public-facing Progressive Web App for antique shoppers.

The implementation baseline leads with:

- Antique-store discovery
- Trustworthy store details, photos, hours, updates, and official links
- Store-hours-aware multi-stop trip planning
- One-trip handoff from a researcher/creator to an assigned navigator
- One-stop-at-a-time navigation handoff to Waze or Google Maps
- Private saves, personal ratings, notes, trips, and visit memory
- Verified Store Representative and Administrator workflows

Public reviews enter only in the Regional Public MVP after moderation controls pass. Finds, households, personalization, shopper photos, and owner review responses remain deferred. The original discovery work came from one household's antiquing habits, but the product must contain no personal data or implicit household access.
