# Evidence — issue or work item

Copy this file into `docs/evidence/<ticket>/acceptance.md` when durable repository evidence is warranted. Keep large logs, videos, screenshots, and reports in CI/provider artifacts; link them here.

## Candidate

- Issue/spec:
- Owner/chat:
- Risk: low / standard / high
- Baseline SHA:
- Candidate SHA:
- Diff fingerprint:
- Worktree/branch:
- Evidence captured at:

## Scope

Changed outcome:

Excluded scope:

Overlapping branches/worktrees checked:

Pre-existing failures or unrelated work:

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
|           |                           |                     |                 |

## Verification

| Layer                      | Command or flow | Result | Applies to SHA/environment |
| -------------------------- | --------------- | ------ | -------------------------- |
| Focused tests              |                 |        |                            |
| Type/lint/format/build     |                 |        |                            |
| Database/RLS/RPC           |                 |        |                            |
| Desktop/mobile UI          |                 |        |                            |
| Accessibility/error states |                 |        |                            |
| Hosted/provider lifecycle  |                 |        |                            |
| Canonical production route |                 |        |                            |

## Security and negative proof

- Denied identities/scopes:
- Failure and timeout behavior:
- Secret/PII handling:
- Security review:

## Independent review

- Reviewer:
- Standards verdict:
- Spec verdict:
- Final verdict: `WOWED` / `REWORK` / `BLOCKED`
- Findings and disposition:

## Unverified

List unavailable evidence, why it is unavailable, and consequence. Empty only when every applicable layer is proved.

## Invalidation

Evidence applies only to candidate and environment named above. Re-run affected checks and review after any relevant candidate or integration change.
