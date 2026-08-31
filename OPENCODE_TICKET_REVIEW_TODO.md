# OpenCode Ticket Review TODO

Status baseline: 2026-08-31. This is the operational handoff queue between OpenCode implementation and Codex independent review. `OPEN_TICKET_TODO.md` remains the authoritative execution and closure ledger; a queue approval never closes an issue or authorizes a deployment.

## Handoff rules

- `[ ]` means no OpenCode review request; `[~]` means implementation in progress; `[x]` means the implementation author requests independent Codex review of the matching exact PR head.
- `[R]`, `[A]`, `[F]`, and `[!]` are reserved for the independent Codex reviewer. A new PR head invalidates a prior review request or verdict.
- The reviewer must verify the exact handoff on both the issue and PR, then review the full default-branch-to-head diff. This queue does not override live issue state, dependencies, plan governance, hosted checks, or release gates.
- OpenCode must not self-review, approve, merge, or close its own candidate.

## Ordered review queue

Rows mirror the active part of `OPEN_TICKET_TODO.md`. Earlier rows without a review request are unavailable for review; #123 is externally blocked by live #174 repair work.

- [!] 01. #123 — Rejected-media resubmission. External dependency blocker: #174 remains OPEN with active repair PR #189; no review request is active for this branch.
- [ ] 02. #124 — Media-history/resubmit/current-tier pgTAP contract.
- [ ] 03. #126 — Media issue/evidence truth reconciliation.
- [x] 04. #182 — Historical Package 6/10A/10B/13 successor mappings and current-ledger reconciliation. OpenCode implementation author: current implementation thread. Base: `e6827a4d6e40f619005aff2e4eecc653f2038f54`. PR: https://github.com/samarquis/AntiqueTrail/pull/192. The matching `OPENCODE REVIEW REQUEST` on Issue #182 and PR #192 pins the exact final candidate head, changed paths, acceptance mapping, commands, limitations, and requested review lanes.
- [ ] 05. #129 — Saved store to existing/new trip continuation.
- [ ] 06. #137 — Administrator navigation conformance.
- [ ] 07. #130 — Exact-scope Access & Safety.
- [ ] 08. #131 — Narrow D30 View Audit.
- [ ] 09. #140 — Moderation consequence preview and sole confirmation CTA.
- [ ] 10. #168 — Protected Package 10A owner-research artifact.
- [ ] 11. #169 — Eight-owner acquisition usability gate.
- [ ] 12. #170 — Public existing-store claim and staged Free activation.
- [ ] 13. #171 — Add-store intake, duplicate conversion, provenance, and Free publication.
- [ ] 14. #172 — Public Free `/for-stores` acquisition route and stage behavior.
- [ ] 15. #173 — Owner card, QR controls, consent/withdrawal, and aggregate measurement.
- [ ] 16. #135 — Direct-route denial, synthetic exclusion, concurrency, and isolation proof.
- [ ] 17. #117 — Final Packages 9/10A/10B staged-off sweep.
- [ ] 18. #56 — Regional Public MVP human/provider release tracker.
- [ ] 19. #175 — Inactive commercial configuration and value-research controls.
- [ ] 20. #177 — Paid consent, Checkout, webhook upgrade, and pause-race refund.
- [ ] 21. #178 — Paid lifecycle and hidden-photo behavior.

## OpenCode implementation handoff

The current implementation request is complete only when the review queue row is `[x]` and the matching Issue #182 and PR #192 comments name the same exact current PR head. The implementation author has recorded factual successor corrections and current-state ledger reconciliation only; it has not performed an independent review, approval, merge, or ticket closure.
