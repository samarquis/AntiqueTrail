# OpenCode Ticket Review TODO

Status baseline: 2026-08-31. This is the handoff queue between OpenCode implementation and Codex independent production review. It is an operational ledger, not a product decision, plan amendment, ticket admission source, or release authorization. `OPEN_TICKET_TODO.md` remains the sole authoritative project work source and ordered execution/closure ledger; its `[x]` continues to mean merged and closed.

## Purpose and authority

OpenCode implements one governed GitHub ticket at a time. After it has created a reviewable candidate, pushed a draft pull request, and believes every scoped criterion is complete, it marks the matching row below `[x]` on that draft PR's head. That mark is a request for review, not proof of correctness, issue closure, merge authority, or deployment authorization.

Codex owns the next action for every eligible `[x]` row visible at a draft PR's exact head SHA: claim the review, perform the independent senior review, record a traceable verdict, and either approve the exact candidate for merge or return concrete findings. Codex must be a different agent from the OpenCode implementation author. The live issue, PR, default branch, hosted checks, controlling plan, and commit SHAs always override this file.

## Status legend

- `[ ]` — OpenCode has not started this ticket in the review queue.
- `[~]` — OpenCode is implementing; no Codex review may begin yet.
- `[x]` — OpenCode declares the final draft-PR head complete and requests Codex review. This is the only state that triggers a Codex review claim.
- `[R]` — Codex has posted a valid review claim and is actively reviewing the pinned candidate SHA.
- `[A]` — Codex approved the exact reviewed candidate for merge after all applicable local review gates. Hosted and release gates may still be required.
- `[F]` — Codex found defects or missing evidence. OpenCode must repair the in-scope issue, rerun affected checks, create a new candidate SHA, and mark the row `[x]` again.
- `[!]` — an external blocker prevents review or required proof. The issue remains open and the blocker must also be recorded on GitHub.

Only OpenCode may change its own row from `[ ]` to `[~]` or from `[~]`/`[F]` to `[x]`. Only Codex may write `[R]`, `[A]`, or `[!]`. No status transition changes the matching row in `OPEN_TICKET_TODO.md`; that ledger changes only under its own closure protocol.

## Ordered review queue

Mirror the order and ticket numbers from `OPEN_TICKET_TODO.md`. Do not add a later implementation claim or review before every earlier row is `[A]`, `[!]`, or is explicitly unavailable because its implementation has not requested review. A ticket’s actual dependencies and the main TODO's sequencing rules still apply.

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

## OpenCode completion handoff

Immediately after posting a valid implementation claim, OpenCode changes only its matching queue row from `[ ]` to `[~]` and adds its agent identifier, claim URL, start time, base SHA, and branch beneath the row. It commits and pushes that state with ticket-owned work.

Before changing a row to `[x]`, OpenCode must do all of the following in order:

1. Commit the implementation candidate and run every required local check.
2. Push the candidate branch and create a draft pull request with the required template body. A draft PR is mandatory; `PR: NONE` is invalid.
3. After GitHub assigns the PR number and every acceptance action is complete, change only the matching `OPEN_TICKET_TODO.md` row from `[ ]` to `[x]` using its required `COMPLETE IN PR #<PR>` format.
4. In that same final review-request commit, change only the matching review-queue row from `[~]` or `[F]` to `[x]`, attach the base SHA, final candidate SHA, PR URL, and handoff time, then push.
5. Post the following handoff block on both the issue and the draft PR. Every field must contain a real value; unavailable proof must be labeled `UNAVAILABLE` or `BLOCKED`, never inferred as passing.

```text
OPENCODE REVIEW REQUEST
Ticket: #<number> <URL>
Implementation author/session: <stable identifier>
Base branch and SHA: <branch> <SHA>
Candidate branch and SHA: <branch> <SHA>
PR: <draft PR URL>
Controlling plan headings: <file and exact heading for each requirement>
Changed paths: <paths>
Acceptance mapping: <criterion -> code/test/evidence path for every criterion>
Commands run: <command -> result>
Required unavailable/blocked proof: <none or exact limitation>
Known risks and non-goals: <text>
Requested review: code, UI/UX, database, security/privacy, accessibility, and evidence as applicable
```

OpenCode must leave its implementation claim/heartbeat in the issue according to `OPEN_TICKET_TODO.md`; it must not replace that claim with a review claim. OpenCode remains responsible for in-scope defects found by Codex and may not merge, deploy, close the issue, or mark a ticket complete on the default branch.

## Automation visibility contract

The Codex heartbeat must list open draft pull requests, retrieve `OPENCODE_TICKET_REVIEW_TODO.md` at each PR's exact head SHA, and act only on the first eligible `[x]` row whose handoff block names the same PR URL and candidate SHA. It must never infer review readiness from the default branch, an issue checkbox, a local checkout, or a stale PR head. A new commit after a Codex claim invalidates that claim and requires a new `[x]` request for the new head SHA.

## Codex review and claim protocol

When an eligible row becomes `[x]` at a draft PR's exact head SHA, Codex first refreshes the live state. Codex does not review an unpinned working tree, a stale base, an uncommitted candidate, or a candidate authored by the same agent.

1. Verify the row is the first eligible `[x]` row; read the current `OPEN_TICKET_TODO.md`, live issue, PR, claims, comments, base SHA, candidate SHA, plan headings, gate file, and submitted evidence.
2. Confirm the implementation claim is valid and no other Codex review claim for the same candidate is active. Post this issue and PR comment before beginning review:

   ```text
   CODEX REVIEW CLAIM
   Reviewer/agent: <stable identifier>
   Started UTC: <ISO-8601>
   Base SHA: <SHA>
   Candidate SHA: <SHA>
   Review queue position: <number>
   Scope: senior production review of the exact candidate
   ```

3. Change only that queue row from `[x]` to `[R]`, recording the reviewer, base SHA, candidate SHA, issue URL, and review start time immediately beneath it.
4. Independently inspect the full base-to-candidate diff and the complete current code paths. Rerun the ticket verification and the relevant repository floor; perform focused checks needed to challenge the submitted evidence. Treat a missing dependency, browser, Docker runtime, credential, provider, or human receipt as unavailable, not a pass.
5. Review every applicable lane below. Do not approve a candidate because it has green tests in an unrelated lane.

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

- An unmet acceptance criterion, `P0`/`P1`, security/privacy defect, required evidence gap, or other in-scope defect changes the row to `[F]`. OpenCode must repair it on the same issue, rerun affected checks, and create a new `[x]` handoff for the new SHA.
- A genuinely independent or out-of-scope defect does not get silently fixed in the candidate. Codex files a governed successor GitHub issue, appends it to `OPEN_TICKET_TODO.md` in a separate reviewed bookkeeping pull request without reordering existing rows, and links it from the review finding. The original ticket may proceed only if the successor is non-blocking for its acceptance criteria.
- Any new candidate SHA invalidates the prior review receipt. Self-review, a generic “looks good,” or a test pass does not satisfy this gate.

## Approval, merge, and production meaning

Codex may change `[R]` to `[A]` only after it has reviewed the final full base-to-head diff, found no open findings, and written `docs/evidence/issue-<N>/independent-review.md` with reviewer identity, base/head SHA, all five applicable lanes, commands/results, findings/dispositions, limitations, and the final verdict. Codex then posts a `FINAL INDEPENDENT REVIEW` PR comment naming that exact head SHA and stating `no open findings`.

`[A]` means **approved for merge for the scoped ticket**, not automatically approved for a production deployment. Production approval additionally requires all applicable final hosted checks on that exact head, branch protection/mergeability, post-merge verification, and every ticket-specific provider, legal, security, and human release gate. Codex must not call a ticket production-approved while any required proof is blocked, unavailable, stale, failed, skipped, neutral, or pending.

After merge, follow the existing main TODO closure protocol: refresh the default branch, rerun the required post-merge checks, post criterion-level closure evidence, close the issue, verify its closed state, and only then retain the `OPEN_TICKET_TODO.md` `[x]` row on the default branch. Add a compact final receipt under the queue row with PR URL, merge SHA, final review URL, hosted checks, post-merge result, and the date; retain `[A]` as the review verdict.

## Queue integrity rules

- A queue mark never overrides the governing plan, ticket scope, dependency, GitHub state, or release policy.
- Codex reviews changes; it does not silently repair them while acting as the independent reviewer. Return in-scope findings to OpenCode, then review the new candidate afresh.
- The final review includes review evidence and all bookkeeping changes, not only the initial implementation commit.
- Never deploy, spend money, enable a staged capability, contact people, or use production data solely because a queue row is `[A]`.
