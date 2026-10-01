# Evidence — issue 450

## Candidate

- Issue: #450, retain sanitized configured-shopper failure diagnostics.
- Owner/chat: 01a0f3d7-265d-7c91-b68d-1de69253bb1d; GitHub assignee samarquis.
- Risk: high privacy boundary (untrusted failure data in uploaded CI summary).
- Refreshed baseline: `401e7482329f642101c5a06817048a38a127755a`; replaces stale issue base a1a32fa.
- Candidate: final PR head, with exact-head verification/review receipts linked in the PR before merge.
- Branch: `codex/issue-450-sanitized-diagnostics`; isolated ticket worktree.
- Captured: 2026-09-30.
- Source-only SHA-256: `7b09dc3d9113ab1106459aa6259adc545dddbc1127d0a4018773de651304bde5`.

Reproduce using raw Git bytes; scope is every changed tracked path except `docs/**` (workflow and direct tests). Replace HEAD with the final candidate to compare revisions.

```python
import hashlib, subprocess
raw = subprocess.check_output([
    'git', 'diff', '--binary', '--full-index',
    '401e7482329f642101c5a06817048a38a127755a', 'HEAD',
    '--', '.', ':(exclude)docs/**',
])
print(hashlib.sha256(raw).hexdigest())
```

## Scope

The existing browser parser classifies failures safely; the configured seed-media upload projection previously discarded that classification. The projection now retains only a positive safe-integer source line, one existing fixed assertion identifier, and strict boolean timeout/locator flags. Passing checks omit failure metadata. Existing report/check metadata remains unchanged; arbitrary diagnostic fields and raw errors are not forwarded.

Only `.github/workflows/seed-media.yml` and `scripts/configured-free-shopper-summary.test.mjs` change behavior/proof. The test executes the actual workflow Node block against isolated temporary report files, then reads the exact JSON upload path. No duplicated summary implementation or new runtime helper is introduced.

Excluded: application/runtime/catalog behavior, database/provider mutations, deployment, and raw browser report upload. Primary dirty checkout, completed #422 worktree, historical clean wt/450-452 and unrelated PRs remain preserved. No active competing #450 assignment/PR/chat found before claim.

## Acceptance

| Criterion                | Observable pass condition                                                                                        | Proof                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Refreshed base           | Candidate starts from current main containing completed #422                                                     | Baseline 401e7482; claim comment records refresh                                                                  |
| Useful bounded failure   | Actual uploaded JSON retains line/assertion/timeout/strict locator                                               | Workflow-execution tests: classified, timeout, strict locator, location fallback, absent location                 |
| Privacy preserved        | Raw messages/stacks, URLs, credentials, environment and user content absent                                      | Secret-bearing parser inputs, extra top-level fields, malformed diagnostic values and exact output-key assertions |
| Passing checks unchanged | Successful check has name/project/status only                                                                    | Passing-check regression                                                                                          |
| Malformed input          | Invalid check collection fails without publishing report; malformed failure fields cannot escape typed allowlist | Failure-field/collection negative cases                                                                           |
| Configured workflow      | Exact-head configured seed-media job succeeds and uploads bounded JSON                                           | Pending CI; final run/artifact receipt must be recorded in PR before merge                                        |

## Verification

- Test-first: six new expectations failed because failure metadata was missing; passing and malformed-collection cases passed on baseline.
- Focused: `node --test scripts/configured-free-shopper-report.test.mjs scripts/configured-free-shopper-summary.test.mjs` — ten tests PASS after minimal fix.
- Formatting: direct test formatted with repository Prettier; no timeout/retry changes.
- Full local `npm run check`: initial run caught missing explicit Node imports in the new test; repaired, final full rerun pending at capture. Actual result to be recorded in PR.
- Clean exact-head CI, configured seed-media workflow and uploaded artifact inspection: required before merge, pending at capture.
- Database schema/RPC and rendered UI changes: none. Existing CI checks remain enforced; no new local database/browser run claimed.
- Hosted workflow proof means GitHub's disposable CI runner, not hosted application/provider lifecycle or production acceptance.

## Security and negative proof

Failure projection reconstructs its object; it never spreads arbitrary failure properties. Unknown assertion strings and invalid source-line values are omitted; flag strings cannot become booleans. Raw report errors, environment values and browser origins remain outside the summary. Existing trusted static check titles/project identifiers and report envelope are preserved rather than changing their contract.

## Independent review and completion

Exact-candidate Standards, Spec and completed security-diff scan required. Final acceptance is pending these reviews, all required CI checks and actual artifact inspection. Immutable PR receipts must record final SHA, source digest, verdict and workflow/artifact results; historical or dirty-checkout proof cannot substitute.

## Unverified and invalidation

No deployment, canonical production or hosted disposable-account lifecycle claim. Local Docker was unavailable during prior #422 work; #450 uses workflow-execution tests and clean CI for configured proof. Any affected workflow/test change invalidates corresponding checks/reviews. Verify merged main SHA/tree and actual issue state independently after merge.
