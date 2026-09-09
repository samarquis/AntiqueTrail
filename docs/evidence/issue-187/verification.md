# Issue 187 verification

Scope: exact-SHA read-only handoff queue. Controlling requirements are
PLAN_GOVERNANCE.md, Ticket-to-closure traceability, and OPEN_TICKET_TODO.md, Review.

The executable contract suite is `node --test scripts/opencode-review-queue-contract.test.mjs`.
It maps acceptance 1 to strict request parsing, candidate ancestry and evidence
resolution; acceptance 2 to stable keys, scheduled replay, stale-head detection,
and independently reviewed evidence deltas; acceptance 3 to separate trusted
GitHub reviewer identity, preserved findings, and absence of write operations;
acceptance 4 to one bounded atomic queue snapshot; acceptance 5 to scheduled
end-to-end API-double polling and the live candidate handoff recorded on PR #188.

API-double tests are synthetic, not hosted/provider evidence. The live scheduled
poll receipt, exact source SHA, independent review and hosted results are recorded
on the PR after pushing the candidate, avoiding a self-referential commit hash.
The hourly GitHub schedule becomes available after landing; the same consumer's
bounded local schedule can verify live handoff/replay before landing. No review
PASS, merge, issue closure, or public activation is implied by queue eligibility.
