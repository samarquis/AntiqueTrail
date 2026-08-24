# TDD Development Plan

**Date**: 2026-08-23 Â· **Status**: Tickets cut; coding NOT started â€” awaits explicit Product Owner start instruction (IMPLEMENTATION_PLAN.md line 5)
**Inputs**: DEEP_SPEC_REVIEW.md (2026-08-16 browser review), REVIEW_VERDICTS.md, docs/specs/store-membership-spec.md (#87), PRODUCT_DECISIONS.md Â§Photo moderation criteria (#92) + Â§Photo-tier memberships, docs/research/gallery-photo-data-access.md (#95), docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md (#56)

## Situation summary

Schema groundwork exists for Packages 2Bâ€“12 (89 migrations, 31 edge functions), but browser verification covers only Package 4 fully. Eight spec deviations are recorded from the 2026-08-16 review. One entire decided surface â€” photo tiers, moderation UI, Stripe billing â€” has no package contract and no implementation. The local Supabase stack cannot boot (#97â€“#101, #104), which blocks every database-behavior test cycle.

## Workstreams and execution order

### W0 â€” Local stack unbreak (critical path for all DB TDD)
Existing tickets: #97 (CLI boot), #98 (enable_signup mapping), #99 (grants/USAGE), #101 (profiles trigger), #104 (gateway 503). #100 (.env.local service-role secret) is security hygiene, do first or in parallel.
Entry: none. Exit: `npx supabase@2.115.0 start` + `db reset` green; migrations apply clean; public-catalog served locally.

### W1 â€” Spec-drift burn-down (frontend/test work, no DB dependency)
Source: DEEP_SPEC_REVIEW deviations + REVIEW_VERDICTS harness divergence. Dark mode stays mandated per owner ruling 2026-08-23 and is included here.

| Ticket | Slice |
|---|---|
| #105 | [ui] Register `/stores/:slug/updates` route |
| #106 | [ui] Store Browser card "Add to Trip" action |
| #107 | [accessibility] aria-hidden decorative glyphs (back-link chevron, status badges) |
| #108 | [ui] Typography token compliance: forbidden weights + heading sizes |
| #109 | [ui] More menu auth-required signals |
| #110 | [ui] Dark mode: token palette + theme persistence |
| #111 | [testing] Reconcile review-harness Review Hours with production RPC semantics |
| #112 | [testing] Dark mode coverage sweep + e2e |

### W2 â€” Photo-tiers package (staged-off build, owner-approved 2026-08-23)
Contract first, then slices in dependency order. Billing code ships permanently flagged off; monetization stays gated post-RG-01.

| Ticket | Slice | Blocked by |
|---|---|---|
| #113 | [task] Define Package 13 acceptance contract in PACKAGE_CONTRACTS.md â€” OWNER REVIEWS BEFORE MIGRATION | â€” |
| #118 | [db] Migration: store tier state + cap resolution | #113, W0 |
| #119 | [task] Intake enforcement: approved-count vs tier validation + over-cap copy | #118 |
| #114 | [ui] Administrator moderation queue for `awaiting_review` uploads | #118 |
| #115 | [ui] Portal rejection reason visibility + resubmit flow | #114 |
| #120 | [task] Stripe integration behind capability flag (checkout, webhooks, portal, grace/downgrade) | #113, W0 |

### W3 â€” Contract verification sweep (interleave after W1)
| Ticket | Slice |
|---|---|
| #116 | [testing] Browser verification: Packages 6A/6B/7 partner+admin surfaces; file defect tickets for failures |
| #117 | [testing] Browser verification: Packages 9/10A/10B staged-off synthetic surfaces |

### W4 â€” Provider/human gate prep (NOT ticketed yet â€” trigger-based)
Cut tickets only when their trigger fires: E-01/M-01/R-01/L-01/H-01 drill scripts when provider selection starts; S-01/HC-02 rehearsal packs when human names exist. Tracked by #56 ledger rows. Do not cut early â€” ticket rot.

## Deferred-decision triggers (decisions NOT made now, by design)

| Decision | Trigger to revisit | Blocks |
|---|---|---|
| Provider selections (E-01, R-01, M-01, L-01, hosting config) | Start of each gate's drill prep (W4) | activation only, not code |
| Legal entity + insurance | Before owner outreach | outreach |
| Human ops names | Before S-01/HC-02 rehearsal | those gates |
| SEC-01 reviewer appointment | Before Package 10B entry | release |
| Photo-tier price points | Post-RG-01 monetization Product Decision | flag flip only |
| SLM-01 Continue/Revise/Stop | After W0+W1 stabilize the stack and journeys | Internal Alpha entry |

## Start conditions

1. Owner gives the explicit start instruction (this plan does not authorize coding).
2. Recommended first move on start: #100 + #97 in parallel, then W1 slices while W0's remaining DB tickets run, then #113 contract for owner review before any W2 migration.
