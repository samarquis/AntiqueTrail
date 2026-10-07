# Evidence — shopper-first scope cleanup

## Candidate

- Spec: Product Owner scope approval on 2026-10-06; [ADR0012](../../adr/0012-shopper-first-scope.md).
- Owner/chat: Grill AntiqueTrail PRD and specs, `01a113b6-534f-77a1-907e-287424db5bf2`.
- Risk: low, documentation and handoff inventory only.
- Baseline SHA: `d075998137c501c6ff7252880ad59500e59bec16`.
- Reviewed scope candidate: `51f5e925eab50b54f3f2d55638754f4d3acbd75a`. The following commit finalizes this receipt only; it does not change the reviewed requirements.
- Reviewed diff fingerprint: `c9310a90043c3e2424152c46b1382418c7dc1c51` (`git diff --binary --full-index <baseline> <candidate> | git hash-object --stdin`).
- Worktree/branch: `ba15/AntiqueTrail`, `codex/shopper-first-scope`.
- Evidence date: 2026-10-06, America/Chicago.

## Scope

Reconcile the approved shopper-first product scope across current requirements, specialist boundaries and entry points. Preserve history and current runtime/data/provider obligations. [Reconciliation](../../plans/shopper-first-scope-review.md) records acceptance, implementation gaps and all 26 open-issue dispositions.

Clean starting checkout, no open PRs at inspection; active registered worktrees and recent project chats inspected. No other checkout edited and no active release assignment taken over. Existing source changes between original inspection and baseline are release/recovery files, outside this documentation boundary.

## Acceptance

| Criterion | Observable pass condition | Result |
|---|---|---|
| Core scope | Discover/favorite/share/Add to Trip/plan/visit/private memory + simple owner/admin appear consistently | PASS — independent Spec review |
| Scope exclusions | Teams/offline/public reviews/AI/advanced billing no longer drive first milestone | PASS — independent Standards and Spec review |
| Commercial boundary | Persistent capacity; no monthly deletion; paid prices/capacities unresolved | PASS — independent Spec review |
| Preservation | No runtime/schema/grant/data/provider change or activation inferred | PASS — all 31 paths are Markdown or handoff manifest |
| Navigation | No newly broken local Markdown references; handoff files exist | PASS — baseline-relative local file/fragment check; no missing manifest files |
| Backlog | Every inspected open issue accounted for without fabricated closure or duplicate tickets | 26 open issues classified; no GitHub writes |

## Verification

| Layer | Check | Result at reviewed candidate |
|---|---|---|
| Whitespace/diff | `git diff d075998137c501c6ff7252880ad59500e59bec16 51f5e925eab50b54f3f2d55638754f4d3acbd75a --check` | PASS |
| JSON formatting | `npx --no-install prettier --check manifest.json` | PASS |
| Local references | Python scan of Markdown relative targets/heading fragments against baseline | Zero new broken references; 30 preexisting broken references in changed historical documents remain |
| Handoff inventory | Parse manifest and verify every listed file exists | PASS |
| Change boundary | Baseline-relative path inspection | 31 documentation/handoff paths; no application/schema/provider changes |
| Independent review | Fixed-candidate Standards and Spec axes | PASS; findings below resolved |

No application tests, browser, database or provider runs are applicable to this documentation-only diff; none are claimed. Remote URL availability and historical preexisting broken references were not repaired or certified by the local link check.

## Independent review

Matt Pocock two-axis review, independent agents:

- Standards: `governance_history`, PASS at `51f5e925eab50b54f3f2d55638754f4d3acbd75a`. Initial P2 conflicting store-first brand sequencing and P3 frozen URLs labeled current were repaired and re-reviewed.
- Spec: `shopper_product`, no actionable findings at the same candidate, including corrective delta and Store News pet-photo clarification.
- Final documentation verdict: PASS. User approval is scope authority, not evidence that product implementation is complete. This receipt-only follow-up does not extend runtime proof.

## Unverified

Runtime gaps, configured service behavior, real outing, owner usability, paid offer, hosted and canonical deployment remain unverified by this amendment. Existing historical broken links are baseline debt; newly broken history links are pinned to the original commit rather than redirected to different semantics.

## Invalidation

Re-run affected document/link checks and review after semantic changes. This receipt never substitutes for application, retained-data, provider or release proof.
