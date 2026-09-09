# Plan Acceptance and Independent Build Map

Status: linked capability/acceptance map and historical review receipts. It introduces no product, gate, or verification requirement and reports no current readiness. See README.md for current requirement ownership.

## Release dependency chain

Current requirements: [Stage dependencies](PRD.md#stage-dependencies).

## Traceability

| Capability | Controlling behavior/design | Security/authorization | Delivery/evidence owner |
|---|---|---|---|
| Anonymous Store Browser/Details | `PRD.md` Store Browser/Details; `DESIGN.md`; `DESIGN_SYSTEM.md` | Package 1 in `PACKAGE_CONTRACTS.md` | Package 1 |
| Identity/session/MFA/recovery | `PRD.md` authentication; `DESIGN_SYSTEM.md` auth flow | `SECURITY_AND_TRUST.md` Authentication/Authorization | Package 2 |
| Audit and account lifecycle/export | `SECURITY_AND_TRUST.md` lifecycle/portability | Atomic audit, inactivity, retention, backups | Package 2 |
| Saves, private rating/note, New Since, correction report | `PRD.md`; `DESIGN.md` JIT auth | User ownership; operational correction scope | Package 3 |
| Candidate Link/Share/Trip Idea | `PRD.md`; `DESIGN.md` Candidate Share | Reason-neutral resolution, block/report/retention | Package 4 |
| Manual Plan, partner, Go, offline | `PRD.md`; `DESIGN.md` Plan/Go | One trip, one partner, one Navigator/device, ordered replay | Package 5A |
| Startup Learning MVP | `PRD.md` SLM-01 | Separate accounts, Synthetic only, cross-account denial, offline recovery; no external authority | Packages 1, 2, 3, 5A + Product Owner disposition |
| Suggested feasible order | `DESIGN.md` Check My Day | Minimized disclosed provider call; no precise-location logs | Package 5B after routing ADR |
| Partner QR/consent/draft/activation | `PRD.md`; ADR 0002/0003 | Atomic provisional consent/pending identity; verified email/MFA; exact store scope | Package 6 |
| Public listing claim/add-store intake and verification | [PRD Business accounts](PRD.md#business-accounts); `docs/specs/store-membership-spec.md` | Own status/draft, search/duplicate conversion, two authority signals, provenance, atomic store/projection/grant/Free, retention/rollback | Build Synthetic Package 6; validate private Package 10A; enable only Package 10B |
| Store Portal content/hours/media/social/support | `DESIGN.md` Store Representative | Direct/controlled split; media/support lifecycles | Package 6 |
| Admin typed review, revocation, narrow audit | `DESIGN.md` Administrator | No shopper-private access; all-path revocation; atomic audit | Package 7 |
| Synthetic Internal Alpha and first-owner readiness | [PRD Internal Alpha](PRD.md#internal-alpha); [Security External Testing Readiness](SECURITY_AND_TRUST.md#external-testing-readiness) | H-01 shared protection; L-01 before shared privileged mutation; full matrix, DB/Storage recovery, incident rehearsal | Package 8 |
| Three-store controlled pilot | `PRD.md` First Pilot Store Record and Controlled Private Beta Expansion | Cohort isolation, one store at a time, no public UGC/advertising | Package 8B |
| Public ratings/reviews/moderation/appeal | `PRD.md` Review requirements; `DESIGN.md` Public reviews | Server stage flag, eligibility, arithmetic aggregate, privacy, appeal | Package 9; enabled only by Package 10B |
| Topeka readiness evidence | Regional Public Readiness Gate | Bounded fact-only catalog preparation and invited cohort; legal/security/accessibility/browser/support/recovery/incident proof | Package 10A |
| Consent-based product promotion | [PRD Regional launch strategy](PRD.md#regional-launch-strategy) | Channel-specific consent, ordinary QR, no paid ranking/tracking, quota/withdrawal rollback | Prepare 10A; distribute 10B |
| Prospective-owner acquisition and Free claim/add intake | `PRD.md`; `DESIGN.md`; `docs/specs/store-membership-spec.md` | Three QR classes; ordinary account only; separate eligible-owner cohort; approval atomically creates Free; no payment dependency | Build underlying flow Package 6; private/noindex page and owner evidence 10A; public Free-only 10B |
| Topeka public release | Signed Regional Public Readiness receipt | Tested digest, server capabilities, 15m RPO/4h RTO, 99.5% target, monitoring, rollback | Package 10B + Product Owner |
| RG-01 Topeka evidence | `PRD.md` formulas; Package 11 | Authoritative consenting evidence, deterministic frozen/signed receipt, linkage purge | Package 11 + Product Owner |
| First small-community selection | Community Expansion Gate | Separate choice; no automatic import/contact/promotion | Product Owner after RG-01 |
| Small-community activation ordinals 1–3 | Repeatable Package 12 per-area run | Exact area/catalog/owner consent, preactivation receipt, reused 10A/10B promotion/recovery/rollback; current-community gate before any next run | Package 12 + Product Owner |

| Photo-tier upgrades, moderation, and staged-off Stripe billing | `PRD.md` Business accounts; `docs/specs/store-membership-spec.md` | Versioned inactive config; receipt-bound consent/price; composite activation; off/sales/servicing lifecycle | Build Package 13; activate only after 10B, RG-01, three passing community reviews, owner-value/monetization decision, commercial/provider gates, signed composite receipt |

## Provider and external-decision boundary

Current requirements: [Provider and external-action prerequisites](PRD.md#provider-and-external-action-prerequisites).

## Intentional exclusions

Current requirements: [Deferred implementation boundary](PRD.md#deferred-implementation-boundary).

## Independent-builder acceptance

Current requirements: [Plan and implementation verification](PLAN_GOVERNANCE.md#plan-and-implementation-verification).

## Independent review receipt — 2026-08-03

Manifest v2.5 contains 23/23 declared handoff files. Fresh independent adversarial, coherence, design/accessibility, engineering feasibility, product, scope/sequence, and security/privacy reviews of the full manifest each returned zero P1/P2 findings after correction. Deterministic checks found zero missing files, broken local links, unbalanced fences, duplicate headings, unlisted planning artifacts, stale superseded patterns, or missing named gates; `git diff --check` passed with line-ending warnings only.

| Plan-quality category | Score |
|---|---:|
| Product, audience, MVP, and value proof | 15/15 |
| Scope, sequence, gates, and exclusions | 10/10 |
| Security, privacy, authorization, and recovery safety | 20/20 |
| Architecture, hosting, portability, operations, and cost control | 15/15 |
| Design, older-adult usability, accessibility, and reproducibility | 15/15 |
| Implementation contracts, tests, rollback, and evidence | 15/15 |
| Cross-document coherence and independent handoff | 10/10 |
| **Total plan quality** | **100/100** |

This 100/100 rates the original implementation-plan handoff, not the current corpus, implementation completeness, or deployment readiness. Application code, migrations, automated tests, CI, and a Supabase project now exist, but no accepted Vercel deployment, recovery rehearsal, complete provider PASS set, external participant, live Stripe billing, or public release has been established. H-01/E-01/R-01/M-01/L-01/S-01/SEC-01/B-01/HC-01/HC-02 and package acceptance checks remain executable stop gates; a failed or unproved gate blocks its dependent stage and does not reduce the historical plan score by being honestly unresolved at runtime.

## Protected internal synthetic review exception

Scope and constraints: [ADR 0007](docs/adr/0007-protected-internal-synthetic-review.md). This reference supplies no new assessment authorization; see [current assessment boundary](PRD.md#assessment-environment-boundary).


## Governed internal synthetic admission

Scope and constraints: [ADR 0008](docs/adr/0008-governed-internal-synthetic-admission.md). This reference supplies no new assessment authorization; see [current assessment boundary](PRD.md#assessment-environment-boundary).
