# Plan: close the ordered GitHub ticket sequence

Depth: tree 5   Mode: orchestrated, strictly serial

## Contract

- Process the user-supplied sequence exactly: `152, 151, 150, 149, 148, 147, 146, 144, 143, 142, 141, 140, 139, 138, 137, 135, 133, 132, 131, 130, 129, 126, 125, 124, 123, 117, 56`.
- A ticket has one terminal outcome: it is closed after verified implementation and GitHub evidence, or it remains open only after a dated GitHub comment explains the concrete blocker and required next authority/action.
- No later ticket begins before the prior ticket reaches one of those terminal outcomes. Agents do not write Git history or change GitHub ticket state; the driver verifies, integrates, and performs the GitHub action.
- Preserve all pre-existing local changes, including the prior plans and `gates/leaf-121.md`. Do not treat missing dependencies, synthetic harness results, or an agent claim as acceptance proof.
- The driver independently reruns each leaf's gates and relevant focused checks before closing or commenting. Shared source ownership is serialized by the ticket order.

## Tree

- 1 Ordered ticket completion
  - 1.1 UX/design sequence: #152 through #137
  - 1.2 Safety/portal sequence: #135 through #123
  - 1.3 Verification/release sequence: #117 and #56
  - 1.4 Root reconciliation: all 27 terminal GitHub outcomes recorded in `gates/ticket-sequence-2026-08-29.md`

## Status log

- 2026-08-29: Serial plan and terminal-outcome ledger created. #152 implementation leaf dispatched first.
