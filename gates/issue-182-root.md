# Gates: Issue #182 historical successor reconciliation

Scope: Reconcile the named closed historical issues with the 2026-08-30 successor tickets without rewriting history or claiming successor completion.

- [x] G1: #123 is recorded as a dated external coordination blocker and #182 is proven next-available before implementation starts.
  EVIDENCE: `main` e6827a4 records #123 as `[!]` with issue comment 5485059361; #182 is open, validates with `validatePlanTicket`, has no open PR or `codex/issue-182-*` branch, and does not depend on #174.

- [x] G2: Every affected historical issue has one factual dated successor comment covering the exact mapping in #182.
  EVIDENCE: 2026-08-31 parent `gh api` readback found each of #20, #27, #28, #87-#90, #113, #118-#120, and #138 remains CLOSED with exactly one dated correction; exact URLs and result are in docs/evidence/issue-182/integration.md.

- [ ] G3: Repository ledgers and open-ticket bodies have one valid dependency direction with no retired tier vocabulary or unsupported completion claim.
  CHECK: node --test scripts/plan-governance-contract.test.mjs
  EXPECT: pass 7
  EVIDENCE: 2026-08-31 ledger audit plus parent integration corrected the false #174 completion claims; plan-governance contract passes 7/7. Remaining required index registration is blocked by the locked-plan amendment rule; see ABANDON G3 and integration.md.

- [x] G4: Before/after mapping, successor-link/state checks, validator results, and limitations are recorded under docs/evidence/issue-182.
  EVIDENCE: successor-map.md, ledger-audit.md, and integration.md record the exact map, state/link readback, validation (plan-governance 7/7; release 65/65), base SHA, corrections, and locked-index limitation.

- [ ] G5: An independent issue-set review approves the exact candidate, required hosted checks pass, and #182 is merged and closed.
  EVIDENCE: pending

ABANDON: G3 `PLANNING_INDEX.md` must register the current ordered execution ledger to satisfy #182's cited current-operational-sources requirement, but that locked plan-file change requires an explicit Product Owner `update plan` directive and formal amendment receipt. No such authorization was provided.
ABANDON: G5 Candidate review, hosted checks, merge, and issue closure are intentionally not attempted while G3's required protected-plan change lacks authorization.
