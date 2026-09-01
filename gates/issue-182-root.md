# Gates: Issue #182 historical successor reconciliation

Scope: Reconcile the named closed historical issues with the 2026-08-30 successor tickets without rewriting history or claiming successor completion.

- [x] G1: The ordered-queue blocker marks that were cited as proving #182 next-available are corrected, and #182 makes no false queue-bypass claim.
  EVIDENCE: The prior candidate used invalid `[!]` external-blocker marks on #174 and #123 in `OPEN_TICKET_TODO.md` and the review queue to claim #182 was next-available. Those marks are withdrawn per the FAIL review: #174 is an in-scope repository repair and #123 only sits behind it, so neither is an external blocker. This head restores #174 and #123 to plain `[ ]` scheduling states and does not claim #182 bypasses the ordered queue; #182's deliverable is the scoped historical-successor reconciliation described in issue #182, not a queue-position claim.

- [x] G2: Every affected historical issue has one factual dated successor comment covering the exact mapping in #182.
  EVIDENCE: 2026-08-31 parent `gh api` readback found each of #20, #27, #28, #87-#90, #113, #118-#120, and #138 remains CLOSED with exactly one dated correction; exact URLs and result are in docs/evidence/issue-182/integration.md.

- [x] G3: Repository ledgers and open-ticket bodies have one valid dependency direction with no retired tier vocabulary or unsupported completion claim.
  CHECK: node --test scripts/plan-governance-contract.test.mjs
  EXPECT: pass 7
  EVIDENCE: 2026-08-31 ledger audit plus parent integration corrected the false #174 completion claim; plan-governance contract passes 7/7. The Product Owner issued `update plan` for this head, so `PLANNING_INDEX.md` now registers `OPEN_TICKET_TODO.md` and `OPENCODE_TICKET_REVIEW_TODO.md` as current operational sources, with the amendment receipt appended to `PLAN_CHANGELOG.md` (see integration.md).

- [x] G4: Before/after mapping, successor-link/state checks, validator results, and limitations are recorded under docs/evidence/issue-182.
  EVIDENCE: successor-map.md, ledger-audit.md, and integration.md record the exact map, state/link readback, validation (plan-governance 7/7; release 65/65), base SHA, corrections, and the authorized index-registration amendment.

- [ ] G5: An independent issue-set review approves the exact candidate, required hosted checks pass, and #182 is merged and closed.
  EVIDENCE: pending

ABANDON: G5 Candidate review, hosted checks, merge, and issue closure are intentionally not attempted on this head; they remain pending the separate independent-review receipt on the exact new head SHA.

RECORDED: The prior head's invalid `[!]` queue-skip on #174/#123 is withdrawn in this head (see G1). The `PLANNING_INDEX.md` registration that was previously blocked is now authorized by Product Owner `update plan` and completed (see G3 and PLAN_CHANGELOG.md).
