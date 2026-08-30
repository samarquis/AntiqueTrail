# Plan Acceptance and Independent Build Map

Status: normative dependency and acceptance index derived from the 2026-08-03 handoff. It adds no product behavior, does not report current implementation, and never overrides the source-precedence table in `README.md`. Package 1 is contracted in `IMPLEMENTATION_PLAN.md`; Packages 2–13 are contracted in `PACKAGE_CONTRACTS.md`. The original coding hold is historical; current implementation and release state live in `PROJECT_STATE.md`.

## Release dependency chain

```text
Package 1 local catalog
  -> Package 2 identity/audit/lifecycle
     -> Package 3 private actions/corrections
        -> Package 4 Candidate Share (separate branch)
        -> Package 5A manual trip/collaboration/Go/offline -> SLM-01 checkpoint
           -> R-01 -> Package 5B provider-backed Check My Day
     -> Package 6 Synthetic partner onboarding/Store Portal
        -> E-01 gates real email; M-01 gates real media; both plus H/S/HC gate external use
        -> Package 7 Administrator review/Access & Safety
           -> H-01 + L-01 for shared privileged cycles + S-01 + HC-01 -> Package 8 full Synthetic Internal Alpha + External Testing Readiness
              -> Package 8B three-store Controlled Private Beta
              -> Package 9 public reviews + human dress rehearsal, still disabled in beta
              -> Package 10A Step 0 CAT-01 -> HC-02 + accepted gates -> remaining controlled Regional Readiness
                 -> Package 10B, after Product Owner signature, Topeka release
                    -> signed receipt + passing smoke/monitoring + no active stop -> Package 11 RG-01
                       -> separate Product Owner first-community selection -> Package 12 run 1 activation -> passing current-community gate + next selection -> Package 12 runs 2–3, one area each
```

No arrow authorizes real data, external contact, paid service, promotion, public access, or geography expansion. The applicable evidence gate and Product Owner signature do.

## Traceability

| Capability | Controlling behavior/design | Security/authorization | Delivery/evidence owner |
|---|---|---|---|
| Anonymous Store Browser/Details | `PRD.md` Store Browser/Details; `DESIGN.md`; `DESIGN_SYSTEM.md` | Catalog RPC boundary in `IMPLEMENTATION_PLAN.md` | Package 1 |
| Identity/session/MFA/recovery | `PRD.md` authentication; `DESIGN_SYSTEM.md` auth flow | `SECURITY_AND_TRUST.md` Authentication/Authorization | Package 2 |
| Audit and account lifecycle/export | `PRODUCT_DECISIONS.md` lifecycle/portability | Atomic audit, inactivity, retention, backups | Package 2 |
| Saves, private rating/note, New Since, correction report | `PRD.md`; `DESIGN.md` JIT auth | User ownership; operational correction scope | Package 3 |
| Candidate Link/Share/Trip Idea | `PRD.md`; `DESIGN.md` Candidate Share | Reason-neutral resolution, block/report/retention | Package 4 |
| Manual Plan, partner, Go, offline | `PRD.md`; `DESIGN.md` Plan/Go | One trip, one partner, one Navigator/device, ordered replay | Package 5A |
| Startup Learning MVP | `PRODUCT_DECISIONS.md` SLM-01 | Separate accounts, Synthetic only, cross-account denial, offline recovery; no external authority | Packages 1, 2, 3, 5A + Product Owner disposition |
| Suggested feasible order | `DESIGN.md` Check My Day | Minimized disclosed provider call; no precise-location logs | Package 5B after routing ADR |
| Partner QR/consent/draft/activation | `PRD.md`; ADR 0002/0003 | Atomic provisional consent/pending identity; verified email/MFA; exact store scope | Package 6 |
| Public listing claim intake/verification | `PRD.md`; `PRODUCT_DECISIONS.md` scalable claim policy | Claimant-owned status, two authority signals, conflict/transfer review, exact grant/revocation | Package 6 |
| Store Portal content/hours/media/social/support | `DESIGN.md` Store Representative | Direct/controlled split; media/support lifecycles | Package 6 |
| Admin typed review, revocation, narrow audit | `DESIGN.md` Administrator | No shopper-private access; all-path revocation; atomic audit | Package 7 |
| Synthetic Internal Alpha and first-owner readiness | `PRODUCT_DECISIONS.md`; `IMPLEMENTATION_PLAN.md` | H-01 shared protection; L-01 before shared privileged mutation; full matrix, DB/Storage recovery, incident rehearsal | Package 8 |
| Three-store controlled pilot | `PRODUCT_DECISIONS.md` Private Beta gates | Cohort isolation, one store at a time, no public UGC/advertising | Package 8B |
| Public ratings/reviews/moderation/appeal | `PRD.md` Review requirements; `DESIGN.md` Public reviews | Server stage flag, eligibility, arithmetic aggregate, privacy, appeal | Package 9; enabled only by Package 10B |
| Topeka readiness evidence | Regional Public Readiness Gate | Bounded fact-only catalog preparation and invited cohort; legal/security/accessibility/browser/support/recovery/incident proof | Package 10A |
| Consent-based product promotion | `PRODUCT_DECISIONS.md`; `PRD.md` launch strategy | Channel-specific consent, ordinary QR, no paid ranking/tracking, quota/withdrawal rollback | Prepare 10A; distribute 10B |
| Topeka public release | Signed Regional Public Readiness receipt | Tested digest, server capabilities, 15m RPO/4h RTO, 99.5% target, monitoring, rollback | Package 10B + Product Owner |
| RG-01 Topeka evidence | `PRD.md` formulas; Package 11 | Authoritative consenting evidence, deterministic frozen/signed receipt, linkage purge | Package 11 + Product Owner |
| First small-community selection | Community Expansion Gate | Separate choice; no automatic import/contact/promotion | Product Owner after RG-01 |
| Small-community activation ordinals 1–3 | Repeatable Package 12 per-area run | Exact area/catalog/owner consent, preactivation receipt, reused 10A/10B promotion/recovery/rollback; current-community gate before any next run | Package 12 + Product Owner |

| Photo-tier memberships, moderation, and staged-off Stripe billing | `PRODUCT_DECISIONS.md` photo-tier decisions; `docs/specs/store-membership-spec.md` | `PACKAGE_CONTRACTS.md` Package 13; `SECURITY_AND_TRUST.md` authorization matrix; receipt-bound capability | Package 13; activation remains separately gated |

## Provider and external-decision boundary

An independent team may build only the provider-neutral contract until the named ADR is accepted. The ADR must select the provider/version/plan and record data sent, processor role and retention, region, authentication, quotas/cost caps, timeouts/retry/idempotency, outage fallback, observability without private payloads, replacement path, legal review, and executable contract tests.

- Routing ADR blocks only Package 5B; Package 5A remains manual-order/hours-only.
- Transactional-email ADR blocks real invitation/status delivery and Package 6 external use, not Synthetic UI tests.
- ADRs 0005/0006 and H-01 block any shared environment until Vercel plan eligibility, disabled automatic Git deployment, protection of every reachable hostname, and Alpha restore/quotas pass. Startup has `$0` recurring infrastructure/no overage unless separately funded. Regional Public remains blocked until 15-minute RPO is funded or independently proven at `$0`; no paid ceiling is approved.
- L-01 blocks privileged shared/external mutation until a separately administered append-only chain-root sink passes at `$0` for startup; no sink means local-only privileged testing.
- SEC-01 independent security review and B-01 final brand/domain block Package 10B.
- M-01 blocks real Official Store media/support screenshots; placeholders/text remain. Claim-document upload is not Regional Public MVP scope.
- S-01/HC-01 block first owner contact; HC-02 blocks public promotion. An AI cannot be on-call backup or independent reviewer.
- Analytics remains off; it is never a launch dependency.
- Shopper-image moderation remains post-MVP and off.
- A named independent break-glass reviewer is required only to enable break-glass. Without that artifact the safer disabled state remains mandatory and does not grant an exception.

## Intentional exclusions

D31 full Audit History UI/export, households, finds/collections, personalization, shopper/review photos, owner review responses, structured Events, Vendor Contributor, paid placement/ad products, Android packaging, marketplace, AI valuation/authentication, embedded social feeds, and national expansion are not Regional Public MVP work. Consent-based Antique Trail product promotion is release work, not monetization. Empty scaffolding for deferred items is prohibited.

## Independent-builder acceptance

Before a package starts, its execution contract must satisfy every field in `IMPLEMENTATION_PLAN.md` and resolve every dependency shown above. Before the package closes, a clean checkout must reproduce its migrations/fixtures, all allow-and-deny tests must pass, required UI states must be visually and accessibly verified, failure/rollback must be exercised, security/privacy artifacts must contain no forbidden data, and the evidence receipt must be attached to GitHub Issue #1. AI output is never a substitute for a failed executable check or required human gate.

Security closure additionally requires exact Postgres privilege/FORCE-RLS tests; every session-revocation surface; auth/invitation fragment/cache/referrer denial; stage/capability matrix across route/RLS/Storage/RPC/Function/job; case-scoped sibling/bulk denial; SSRF limit corpus; field/XSS/Unicode boundaries; offline 36-hour/7-day lifecycle; DB/Auth/Storage restore with deletion/revocation replay; audit-chain external-root failure; quota/no-charge degradation; and header/CSP/CI artifact-digest assertions. A plan statement is not evidence of runtime behavior.

The plan itself is accepted only when a fresh seven-lens review of the current full manifest finds no material P1/P2 contradiction, omission, untestable gate, privacy/security defect, design reproducibility defect, or unauthorized scope path. A numerical score is reported only with that finding set; the document cannot self-award 100.

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
