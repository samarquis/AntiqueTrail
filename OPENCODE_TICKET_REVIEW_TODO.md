# Ticket Review Queue

Status baseline: 2026-09-01. This operational queue is an immutable handoff from an implementation system to a different review system. The historical filename remains stable for tooling. `OPEN_TICKET_TODO.md` is the sole authoritative project work source and ordered execution and closure ledger. Its `[x]` means merged and closed.

## Purpose and authority

Any implementation system may work a governed GitHub ticket. That includes OpenCode, Codex, a human developer, or another agent. It creates a reviewable candidate, pushes a draft PR, and commits the matching queue row as `[x]` at that PR's final head. `[x]` requests review. It is not proof of correctness, closure, merge authority, or release approval.

A different review system independently reviews that immutable candidate. The reviewer may be Codex, OpenCode, a human, or another agent, but it must have a different stable identity from the implementation system. The live issue, PR, default branch, hosted checks, controlling plan, and commit SHAs override this file.

Use identities in the form `<platform>/<account-or-host>/<session-or-agent>`. A missing identity, matching identities, or identifiers that cannot distinguish the actors make the request ineligible.

## State model

The committed queue contains implementation states only.

- `[ ]` means no implementation has started this row.
- `[~]` means implementation is active. Review cannot begin.
- `[x]` means the implementation system submitted one immutable review request at the current draft-PR head.

The reviewer records claim, pass, and fail as SHA-pinned GitHub comments on both the issue and the draft PR. It never writes review state into the candidate branch. A committed reviewer state creates a new head and invalidates the candidate.

```text
implementation queue: [ ] -> [~] -> [x]
review comment at exact SHA: unclaimed -> claimed -> PASS or FAIL
new candidate SHA: invalidates every earlier review comment and requires a new [x]
```

## Ordered review queue

Mirror the order and ticket numbers from `OPEN_TICKET_TODO.md`. A later candidate is ineligible until every earlier row is closed `[x]` in the authoritative TODO, or has a valid external `[!]` blocker that does not block it. An earlier row with no candidate may be unavailable. A review failure, failing test, missing code, or unresolved repository defect never makes an earlier row skippable.

- [ ] 01. #187 — OpenCode-to-Codex draft-PR review automation.
- [ ] 02. #123 — Rejected-media resubmission against the current server tier resolver.
- [ ] 03. #124 — Media-history/resubmit/current-tier pgTAP contract.
- [ ] 04. #126 — Media issue/evidence truth reconciliation.
- [ ] 05. #182 — Historical Package 6/10A/10B/13 successor mappings and ledger reconciliation.
- [ ] 06. #129 — Saved store to existing/new trip continuation.
- [ ] 07. #137 — Administrator navigation conformance.
- [ ] 08. #130 — Exact-scope Access & Safety.
- [ ] 09. #131 — Narrow D30 View Audit.
- [ ] 10. #140 — Moderation consequence preview and sole confirmation CTA.
- [ ] 11. #168 — Protected Package 10A owner-research artifact.
- [ ] 12. #169 — Eight-owner acquisition usability gate.
- [ ] 13. #170 — Public existing-store claim and staged Free activation.
- [ ] 14. #171 — Add-store intake, duplicate conversion, provenance, and Free publication.
- [ ] 15. #172 — Public Free `/for-stores` acquisition route and stage behavior.
- [ ] 16. #173 — Owner card, QR controls, consent/withdrawal, and aggregate measurement.
- [ ] 17. #135 — Direct-route denial, synthetic exclusion, concurrency, and isolation proof.
- [ ] 18. #117 — Final Packages 9/10A/10B staged-off sweep.
- [ ] 19. #56 — Regional Public MVP human/provider release tracker.
- [ ] 20. #175 — Inactive commercial configuration and value-research controls.
- [ ] 21. #177 — Paid consent, Checkout, webhook upgrade, and pause-race refund.
- [ ] 22. #178 — Paid lifecycle and hidden-photo behavior.
- [ ] 23. #179 — Paid-sales pause, servicing, close/reopen, and resume.
- [ ] 24. #176 — Paid-value research and monetization decision.
- [ ] 25. #180 — Composite paid activation and staged presentation.
- [ ] 26. #181 — Live paid-tier activation and independent verification.

## Implementation-system handoff

Immediately after posting a valid implementation claim, the implementation system changes only its matching queue row from `[ ]` to `[~]` and adds its stable identity, claim URL, start time, base SHA, and branch beneath the row. It commits and pushes that state with ticket-owned work.

Before changing a row to `[x]`, the implementation system must complete these steps in order:

1. Commit the candidate and run every required local check.
2. Push the branch and create a draft PR. `isDraft` must be true. A ready PR, `PR: NONE`, placeholder URL, or pending PR number is invalid.
3. In the final commit, change only the matching queue row from `[~]` to `[x]`. Record the base SHA, PR URL, and handoff time. Push once. Do not commit to that branch again before review.
4. Query the live PR URL and `headRefOid` after the push. Post the handoff comments with that exact candidate SHA. A commit cannot truthfully record its own final SHA because the record changes the commit.
5. Post the following complete, identical block on both the issue and draft PR. Every field needs a real value. State `UNAVAILABLE` or `BLOCKED` for unavailable proof. Never infer a pass.

```text
IMPLEMENTATION REVIEW REQUEST
Ticket: #<number> <URL>
Implementation identity: <platform/account-or-host/session-or-agent>
Base branch and SHA: <branch> <SHA>
Candidate branch and SHA: <branch> <SHA>
PR: <draft PR URL>
PR is draft: true
Controlling plan headings: <file and exact heading for each requirement>
Changed paths: <paths>
Acceptance mapping: <criterion -> code/test/evidence path for every criterion>
Commands run: <command -> result>
Required unavailable/blocked proof: <none or exact limitation>
Known risks and non-goals: <text>
Requested review: code, UI/UX, database, security/privacy, accessibility, and evidence as applicable
```

The implementation system keeps its issue claim/heartbeat. It fixes valid in-scope findings on the same issue. It may not merge, deploy, close the issue, or mark the default-branch TODO complete.

## Automation visibility contract

The reviewer or review automation lists open draft PRs and retrieves both TODO files at each PR's exact current head. It acts only on the first eligible `[x]` row whose request comments name the same current PR URL, current candidate SHA, `PR is draft: true`, and a different implementation identity. It never infers readiness from a local checkout, a default-branch checkbox, stale SHA, non-draft PR, or placeholder metadata.

A review comment is valid only when its candidate SHA equals the PR's current `headRefOid`. A new head invalidates every prior claim, verdict, check assertion, and approval. The next review begins only after a new immutable `[x]` handoff at the new exact head.

## Independent review and claim protocol

The review system refreshes the live issue, PR, claims, comments, base SHA, candidate SHA, plan headings, gate file, and evidence before reviewing. It does not review an unpinned working tree, stale base, uncommitted candidate, non-draft PR, or candidate from the same stable identity.

Confirm the row is the first eligible `[x]` row, the implementation claim is valid, and no other review claim for the same candidate is active. Post this comment verbatim on both the issue and PR before beginning review. Do not alter the candidate branch.

```text
INDEPENDENT REVIEW CLAIM
Reviewer identity: <platform/account-or-host/session-or-agent>
Started UTC: <ISO-8601>
Base SHA: <SHA>
Candidate SHA: <SHA>
Review queue position: <number>
Scope: senior production review of the exact candidate
```

Independently inspect the full base-to-candidate diff and the complete current code paths. Rerun ticket verification and the relevant repository floor. Perform focused checks needed to challenge submitted evidence. Treat a missing dependency, browser, Docker runtime, credential, provider, or human receipt as unavailable, not a pass. Review every applicable lane below. Do not approve a candidate because it has green tests in an unrelated lane.

### Required senior-review lanes

| Lane | Review obligations |
| --- | --- |
| Code and architecture | Correctness, root-cause fit, type safety, error paths, data flow, maintainability, migrations, call sites, regression and blast radius. |
| UI/UX | Exact plan conformance, role journeys, desktop/tablet/320 CSS-px mobile/reflow, loading/empty/error/retry states, truthful copy, keyboard, focus, screen-reader status, dark and forced-colors behavior where applicable. Use rendered evidence for visual claims. |
| Database and server boundary | Migration safety, RPC/API contracts, RLS/authorization deny cases, tenant/store isolation, concurrency/idempotency, transaction boundaries, privacy/minimization, rollback and fixture realism. Run clean reset/full pgTAP when the ticket requires it. |
| Security and privacy | Authentication/session boundaries, capability staging, validation, secrets, least privilege, retention/export implications, abuse paths, and no client-only enforcement of server rules. |
| Evidence and release | Every acceptance criterion maps to a reproducible exact-SHA artifact; local results are distinguished from hosted CI, production/provider proof, and human approvals; no plan change is hidden in the diff. |

## Findings and successor-ticket policy

Record every finding with severity, file/line or evidence location, impact, required correction, and disposition.

- An unmet acceptance criterion, `P0`/`P1`, security/privacy defect, required evidence gap, or other in-scope defect fails review. The implementation system repairs the same issue, reruns affected checks, makes a new candidate SHA, and submits a new `[x]` request.
- A genuinely independent or out-of-scope defect does not get silently fixed in the candidate. The review system files a governed successor GitHub issue, appends it to `OPEN_TICKET_TODO.md` in a separate reviewed bookkeeping pull request without reordering existing rows, and links it from the review finding. The original may proceed only if the successor is non-blocking for its acceptance criteria.
- Never use the authoritative TODO's `[!]` external blocker state for review findings, test failures, missing implementation, or any repository-resolvable defect. `[!]` requires the main TODO's dated external blocker protocol and a live GitHub blocker comment.
- Any new candidate SHA invalidates the prior review receipt. Self-review, a generic “looks good,” or a test pass does not satisfy this gate.

Post one of these blocks on both the issue and PR, using the exact current candidate SHA:

```text
FINAL INDEPENDENT REVIEW — PASS
Reviewer identity: <identity>
Base SHA: <SHA>
Candidate SHA: <SHA>
Verdict: no open findings
Evidence: <independent-review artifact and commands>
```

```text
FINAL INDEPENDENT REVIEW — FAIL
Reviewer identity: <identity>
Base SHA: <SHA>
Candidate SHA: <SHA>
Open findings: <severity, location, required correction>
Next state: implementation repair and new immutable [x] request
```

## Approval, merge, and production meaning

A PASS requires the final full base-to-head review, no open findings, and the exact-SHA issue and PR receipt with identities, base/head SHA, applicable lanes, commands/results, findings/dispositions, limitations, and verdict. A pass approves only merge for the scoped ticket. It never approves a production release.

On a later run, an automation may make a passed draft PR ready and merge only if the candidate SHA is still current, current required hosted checks for that SHA all succeed, every review conversation is resolved, branch protection and mergeability pass, and all ticket-specific provider, legal, security, and human merge gates are proved. It refreshes the default branch, runs required post-merge verification, posts criterion-level closure evidence, closes and verifies the issue, and confirms the default-branch TODO row. It records a final receipt as a GitHub comment with PR URL, merge SHA, review URL, hosted checks, post-merge result, and date. This workflow never deploys a production release.

## Queue integrity rules

- A queue mark never overrides the governing plan, ticket scope, dependency, GitHub state, or release policy.
- Reviewers do not silently repair implementation changes. They return in-scope findings and review the new candidate from scratch.
- The final review includes review evidence and all bookkeeping changes, not only the initial implementation commit.
- Never deploy, spend money, enable a staged capability, contact people, or use production data solely because a review comment says PASS.
