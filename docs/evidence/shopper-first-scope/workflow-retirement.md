# Legacy workflow retirement

## Authority and boundary

The owner authorized: “clean these up. I want no remaining old workflow and plan to remain anywhere in the workflow.” Baseline: `cf93b91a92dd102d1b7efbe917ebf6c724f6505e`; branch: `codex/shopper-first-scope`; worktree: `ba15`; publication vehicle: PR #559.

This cleanup changes documentation, issue instructions, queue organization, and an obsolete developer command. It does not implement product features, rotate credentials, change providers, deploy, or waive release checks. Historical records remain evidence, not executable instructions.

## Acceptance and disposition

- The engineering workflow is the single delivery procedure. Current issue bodies define bounded outcomes in Product, Maintenance, or Release queues.
- Old implementation, TDD, product-decision, and deployment-checklist material moves to the reference-only planning archive. Compatibility pointers preserve incoming links; product-decision anchors remain bridges.
- The obsolete `npm run handoff` command and executable generator are retired. An inert archive copy preserves its history without regenerating `.planning` instructions.
- Existing ownership, security, recovery, media, account, and publication duties remain intact. Deferred provider operations remain paused.

| Queue | Issues |
| --- | --- |
| Product | #487 |
| Maintenance | #428, #511, #527, #538, #540–#547 |
| Release | #507, #548–#558 |
| Retired orchestration | #498; remaining release obligation stays in #507 |

The three old milestones have no open issues and are candidates for closure as historical organization. Closing orchestration is not a production acceptance claim.

## Prepared publication artifact

All 26 issue bodies were read against current scope and later issue comments. Prepared title/body/label payload SHA-256: `9bf6f8e60239e90bf6b2c5462f8e7af245ef7ec8d873c8959258cb1187940ea2`. Canonical encoding: issue-number order; number/title/body/labels only; sorted JSON keys; compact separators; UTF-8; no trailing newline. Assignees are preserved.

Independent standards and specification reviews found two corrections: preserve explicit response-body and authorization-header redaction in #487, and remove the stale unavailable-restore statement in #511. Both are corrected in this payload. Existing single-account testing authority, account retention, ten-minute leaf boundaries, and the no-rotation pause remain intact.

Publication must compare current title/body against the captured originals before each update, then verify returned bodies, labels, assignees, and closure state. Concurrent changes require reconciliation, not overwrite.

## Verification and limits

Before publication: local Markdown references passed (494 references, zero broken); package/manifest formatting and whitespace checks passed; archived generator contents match the original after line-ending normalization. Full local checks and final publication receipts are recorded below when complete.

GitHub Projects could not be inspected: the existing token lacks `read:project`. No additional OAuth authority was requested. Board configuration is outside verified coverage. GitHub history and old comments are retained with current-body precedence. No project-reflection vault is configured; this receipt records the cleanup rationale without modifying personal memories.

PR #559 remains subject to normal review and CI. The inherited dependency-audit finding for `source-map-js` is not fixed or waived by this workflow cleanup. Main-branch instructions remain unchanged until merge.
