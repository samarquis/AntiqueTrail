# Plan: Close or honestly gate all 11 open GitHub tickets (#56,#101,#104,#113–121)

Depth: tree 3   Mode: orchestrated (8 concurrent leaf slots, shared-resource serialization)

## Contract

Fixed BEFORE fan-out. Violations get sent back.

**Shared resources (exclusive ownership, no hope-based coordination):**
- Local Supabase stack (docker containers, `db reset`, `supabase test db`, psql): Phase 1 owned by leaf-121 ONLY. Every other leaf writes code/tests but defers ALL live DB execution to Phase 2. Driver schedules Phase 2 slot-by-slot.
- Review dev server port 4174 (`playwright.review.config.ts`): Phase 1 owned by leaf-116 ONLY. leaf-117 prepares its spec, executes in Phase 2.
- `REVIEW_VERDICTS.md`: NO leaf edits it. Sweep leaves append to `docs/testing/draft-verdicts-<issue>.md`; driver integrates sequentially at merge.
- Git: NO agent runs any git write command (add/commit/push/checkout). Driver integrates and commits per verified leaf. Read-only git OK. `gh issue view`/`gh issue create` (sweeps filing defect tickets) allowed; NO `gh issue close` by agents — driver closes with evidence comments.

**File ownership (disjoint):**
| Leaf | Owns |
|---|---|
| 121 | supabase/tests/0062*.sql, 0063*.sql, 0067*.sql (and only these unless root cause proves a migration defect) |
| 101 | scripts/stress/* (new seeder file ok), migration `20260824110000_profile_state_error_distinction.sql`, supabase/tests/0071_*.sql |
| 104 | docs/stress/DECISIONS.tsv (append), docs/operations/RUNBOOK_LOCAL_FUNCTIONS_GATEWAY.md (new), README local-runbook section, supabase/config.toml [functions] if needed |
| 113 | PACKAGE_CONTRACTS.md (Package 13 section), PLAN_ACCEPTANCE.md, SECURITY_AND_TRUST.md authorization matrix additions |
| 114 | src/** admin-moderation-queue code (new files + minimal route wiring), co-located *.test.tsx, e2e/ui09-admin-moderation.spec.ts |
| 115 | src/** store-portal rejection/resubmit code, e2e/ui08-partner-portal.spec.ts |
| 118 | migration `20260825000000_package13_store_tier_state.sql` (+ down), supabase/tests/0073_store_tier_state.sql |
| 119 | media intake RPC/function edits for cap validation, supabase/tests/0074_intake_tier_enforcement.sql |
| 120 | migration `20260824120000_store_membership_capabilities.sql`, supabase/tests/0072_stripe_flag_off_inert.sql, supabase/functions/store-* (new), src/** billing gating (new files), package.json if a dep is truly required |
| 116 | docs/testing/draft-verdicts-116.md, new/edited e2e specs for 6A/6B/7 gaps, gh defect tickets |
| 117 | docs/testing/draft-verdicts-117.md, e2e/ui11-staged-off-inert.spec.ts (new), gh defect tickets |

**Conventions:** migrations `YYYYMMDDHHMMSS_snake_name.sql` (idempotent where possible, with down where feasible); pgTAP `NNNN_name.sql` red-first; capability-flag pattern mirrors `20260814101000_package_10b_capabilities.sql` (release_private.release_capabilities) — Package 13 adds `photo_tiers_enabled` there, default false everywhere, flip only via receipt-bound promote command; vitest for unit/component, Playwright review harness for browser evidence; commit style imperative + `(#NNN)`.

**Dependency chain (from docs/specs/TDD_DEVELOPMENT_PLAN.md W2/W3, corrected):**
#113 → (owner review) → #118 → {#119, #114} → #115; #120 after #113. Sweeps independent of W2 code.

## Tree

- 1 All open tickets closed or at their named human gate
  - 1.1 DB & stress correctness ......... gates/node-1.1.md
    - 1.1.1 #121 pgTAP suite green (stack owner P1) ... gates/leaf-121.md
    - 1.1.2 #101 profiles creation/seeder/errors ...... gates/leaf-101.md
    - 1.1.3 #104 local functions gateway .............. gates/leaf-104.md
  - 1.2 Package 13 chain .................. gates/node-1.2.md
    - 1.2.1 #113 contract completion + OWNER REVIEW GATE gates/leaf-113.md
    - 1.2.2 #118 tier-state migration (needs 1.2.1 approved) gates/leaf-118.md
    - 1.2.3 #119 intake enforcement (needs 1.2.2) ..... gates/leaf-119.md
    - 1.2.4 #114 admin moderation queue ............... gates/leaf-114.md
    - 1.2.5 #115 portal rejection/resubmit (needs 1.2.4) gates/leaf-115.md
    - 1.2.6 #120 Stripe staged-off integration ........ gates/leaf-120.md
  - 1.3 Verification sweeps ............... gates/node-1.3.md
    - 1.3.1 #116 sweep 6A/6B/7 (port owner P1) ........ gates/leaf-116.md
    - 1.3.2 #117 sweep 9/10A/10B (after 1.3.1) ........ gates/leaf-117.md
  - 1.4 #56 program gate: refresh ledger only; stays OPEN (human/provider actions). gates/leaf-56.md

## Status log

Append-only.

- 2026-08-24 plan written, contract fixed
- 2026-08-26 issue #122: eight-agent bounded investigation dispatched; portal type-safety fix integrated in main worktree; issue-focused checks green; full-suite concurrent UI timeout failures recorded as non-gate observation.
- 2026-08-27 CLI caveat: removed stale user-level GITHUB_TOKEN override; activated valid keyring login; gh can read issue #122.
