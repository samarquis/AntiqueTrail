# OpenCode Ticket Review TODO

Status baseline: 2026-08-31. This is the handoff queue between OpenCode implementation and Codex independent production review. It is an operational ledger, not a product decision, plan amendment, ticket admission source, or release authorization. `OPEN_TICKET_TODO.md` remains the authoritative ordered execution and closure ledger; its `[x]` continues to mean merged and closed.

## Purpose and authority

OpenCode implements one governed GitHub ticket at a time. When OpenCode has created a reviewable candidate and believes every scoped criterion is complete, it marks the corresponding row below `[x]`. That mark is a request for review, not proof of correctness, not issue closure, and not authorization to merge or deploy.

Codex owns the next action for every `[x]` row: claim the review, perform the independent senior review, record a traceable verdict, and either approve the exact candidate for merge or return concrete findings. Codex must be a different agent from the OpenCode implementation author. The live issue, PR, default branch, hosted checks, controlling plan, and commit SHAs always override this file.

## Status legend

- `[ ]` — OpenCode has not started this ticket in the review queue.
- `[~]` — OpenCode is implementing; no Codex review may begin yet.
- `[x]` — OpenCode declares the candidate complete and requests Codex review. This is the only state that triggers a Codex review claim.
- `[R]` — Codex has posted a valid review claim and is actively reviewing the pinned candidate SHA.
- `[A]` — Codex approved the exact reviewed candidate for merge after all applicable local review gates. Hosted and release gates may still be required.
- `[F]` — Codex found defects or missing evidence. OpenCode must repair, rerun affected checks, create a new candidate SHA, and mark the row `[x]` again.
- `[!]` — an external blocker prevents review or required proof. The issue remains open and the blocker must also be recorded on GitHub.

Only Codex may write `[R]`, `[A]`, `[F]`, or `[!]`. After posting its valid implementation claim, only OpenCode may change its own row from `[ ]` to `[~]`; only OpenCode may change its own `[~]` row to `[x]`. No status transition changes the matching row in `OPEN_TICKET_TODO.md`; that ledger changes only under its own closure protocol.

## Ordered review queue

Mirror the order and ticket numbers from `OPEN_TICKET_TODO.md`. Do not add a later implementation claim or review before every earlier row is `[A]`, `[!]`, or is explicitly unavailable because its implementation has not requested review. A ticket’s actual dependencies and the main TODO's sequencing rules still apply.

- [x] 01. #123 — Rejected-media resubmission against the current server tier resolver. REPAIR REVIEW REQUEST 2026-08-31: base `186e7b7`, repaired code `6b6fc5d`, evidence `fd82155`, PR <pending>. Under direct user authorization, Codex repaired the review findings: shared Portal scope/revocation enforcement, opaque RPC receipt, content-exact retry idempotency, staged-off readable history, and browser coverage. Local verification: `npm run check` (88 Vitest files / 607 tests; 65 release tests; build), full pgTAP (78 files / 2,160 assertions), UI-08 (14 passed; 4 opt-in capture skips), security contract, plan-governance, and `git diff --check`. Requires a separate-agent review of the exact head and hosted checks before merge/closure. Prior failed review: https://github.com/samarquis/AntiqueTrail/issues/123#issuecomment-5483682183. Not merged/closed.
- [ ] 02. #124 — Media-history/resubmit/current-tier pgTAP contract.
- [ ] 03. #126 — Media issue/evidence truth reconciliation.
- [ ] 04. #182 — Historical Package 6/10A/10B/13 successor mappings and ledger reconciliation.
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
- [ ] 22. #179 — Paid-sales pause, servicing, close/reopen, and resume.
- [ ] 23. #176 — Paid-value research and monetization decision.
- [ ] 24. #180 — Composite paid activation and staged presentation.
- [ ] 25. #181 — Live paid-tier activation and independent verification.

## OpenCode completion handoff

Immediately after posting a valid implementation claim, OpenCode changes only its matching queue row from `[ ]` to `[~]` and adds its agent identifier, claim URL, start time, base SHA, and branch beneath the row. Before changing that row to `[x]`, OpenCode must commit a candidate and add the following handoff block to the GitHub issue and pull request. Every field must contain a real value; unavailable proof must be labeled `UNAVAILABLE` or `BLOCKED`, never inferred as passing.

```text
OPENCODE REVIEW REQUEST
Ticket: #<number> <URL>
Implementation author/session: <stable identifier>
Base branch and SHA: <branch> <SHA>
Candidate branch and SHA: <branch> <SHA>
PR: <URL or NONE>
Controlling plan headings: <file and exact heading for each requirement>
Changed paths: <paths>
Acceptance mapping: <criterion -> code/test/evidence path for every criterion>
Commands run: <command -> result>
Required unavailable/blocked proof: <none or exact limitation>
Known risks and non-goals: <text>
Requested review: code, UI/UX, database, security/privacy, accessibility, and evidence as applicable
```

OpenCode must leave its implementation claim/heartbeat in the issue according to `OPEN_TICKET_TODO.md`; it must not replace that claim with a review claim. OpenCode remains responsible for defects found by Codex and may not mark a ticket complete in the main TODO or close the issue.

## Codex review and claim protocol

When a row becomes `[x]`, Codex first refreshes the live state. Codex does not review an unpinned working tree, a stale base, an uncommitted candidate, or a candidate authored by the same agent.

1. Verify the row is the first eligible `[x]` row; read the current `OPEN_TICKET_TODO.md`, live issue, PR, claims, comments, default branch, base SHA, candidate SHA, plan headings, gate file, and submitted evidence.
2. Confirm the implementation claim is valid and no other Codex review claim for the same candidate is active. Post this issue comment before beginning review:

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

Record each finding with severity, file/line or evidence location, impact, required correction, and disposition. Severity `P0`/`P1` defects, unmet acceptance criteria, missing required evidence, or any unreviewed new candidate SHA block approval. Any valid finding changes the row to `[F]`; Codex posts findings on the PR/issue, and OpenCode repeats the handoff process for the new SHA.

## Approval, merge, and production meaning

Codex may change `[R]` to `[A]` only after it has reviewed the final full base-to-head diff, found no open findings, and written `docs/evidence/issue-<N>/independent-review.md` with reviewer identity, base/head SHA, all five applicable lanes, commands/results, findings/dispositions, limitations, and the final verdict. Codex then posts a `FINAL INDEPENDENT REVIEW` PR comment naming the exact head SHA and stating `no open findings`.

`[A]` means **approved for merge for the scoped ticket**, not automatically approved for a production deployment. Production approval additionally requires all applicable final hosted checks on that exact head, branch protection/mergeability, post-merge verification, and every ticket-specific provider, legal, security, and human release gate. Codex must not call a ticket production-approved while any required proof is blocked, unavailable, stale, failed, skipped, neutral, or pending.

After merge, follow the existing main TODO closure protocol: refresh the default branch, rerun the required post-merge checks, post criterion-level closure evidence, close the issue, verify its closed state, and only then let `OPEN_TICKET_TODO.md` use `[x]`. Add a compact final receipt under the queue row with PR URL, merge SHA, final review URL, hosted checks, post-merge result, and the date; retain `[A]` as the review verdict.

## Queue integrity rules

- A queue mark never overrides the governing plan, ticket scope, dependency, GitHub state, or release policy.
- Codex reviews changes; it does not silently repair them while acting as the independent reviewer. Return findings to OpenCode, then review the new candidate afresh.
- The final review must include the review evidence and any bookkeeping changes, not only the initial implementation commit.
- A generic “looks good,” self-review, local test pass, synthetic harness, or a checked task box is insufficient evidence.
- Never deploy, spend money, enable a staged capability, contact people, or use production data solely because a queue row is `[A]`.
