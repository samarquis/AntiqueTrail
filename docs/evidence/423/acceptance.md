# Evidence — issue #423 approved 423-B delta

## Candidate

- Issue/spec: #423-B; approved inventory selection of #410 Browse styling and #412 documentation-only freshness guidance
- Owner/chat: samarquis / current Codex task
- Risk: standard, public visual styling
- Baseline SHA: `29491d879451b77a17664a984e41a94d25f39f78`
- Candidate SHA: `d765914b6855742a13d32b79a55f20e609856925`
- Diff fingerprint: `3adce93c08580d946928ca4d64e836d3845761ed`
- Worktree/branch: `C:\Users\samar\.codex\worktrees\0315\AntiqueTrail` / `codex/issue-423-browse-ui`
- Evidence captured at: `2026-09-30T00:28:18Z`

## Scope

Changed outcome: public Browse search-first spacing, desktop filter grid, compact mobile search control, token-based dark button/default/disabled colors; DESIGN_SYSTEM.md now states the 30-calendar-day freshness rule.

Excluded scope: freshness runtime code, navigation, trip UI, prototypes, account/backend work, Store Details/Gallery, PR #408/#394 full-scope integration, CI publication, deployment, and production claims.

Overlapping branches/worktrees checked: worktree list showed the separate `codex/browse-density` checkout; PR #408 remains OPEN at `02d966f1b517af597bc1288c8e4e33a03357cac3`; PR #394 remains OPEN at `a97930da15aad52aa6e57c92f6e91ccf2d6e98e4`. No other issue #423/#410 branch was active before this branch was created.

Pre-existing failures or unrelated work: lint reports 14 warnings in untouched files and zero errors. Installed npm is 11.13.0 while package.json pins npm 11.13.1; Node is 24.11.1 and Playwright is 1.62.1. Docker Linux engine did not answer `docker info`.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| #410 theme contrast | Search, Apply, Clear text reaches 4.5:1 in light and dark at 320px and desktop | Rendered `e2e/issue-410-browse-controls.spec.ts` plus token calculation | BLOCKED for rendered proof. Dark token calculation: ink/card 12.34:1, disabled-muted/recess 7.70:1, dusty-blue/card border 4.75:1; these are not browser measurements. |
| #410 interaction | Search/filter results work using keyboard and pointer | Existing Playwright spec | BLOCKED; local browser acceptance was not run. Existing spec covers keyboard Enter search and pointer Apply/Clear, but does not explicitly keyboard-activate Apply. |
| #412 documentation | Exact 30-day, overdue, unknown, and older-date precedence guidance appears after color-alone rule | Exact diff review | PASS; paragraph matches approved PR #408 wording. |
| #412 runtime | Date-derived freshness behavior remains on current main; no fallback/status-parser changes | Inherited 423-A source inventory; this candidate changes no runtime code | Inherited from baseline; not retested here. |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| -------------------------- | --------------- | ------ | -------------------------- |
| Focused tests | `npm test -- src/app/styles.test.ts` | PASS, 34 tests | Candidate `d765914b`; Windows local |
| Type/lint/format/build | `npm run typecheck`; `npm run lint`; `npm run format`; `npm run build` | Typecheck PASS; lint 0 errors/14 warnings; format PASS; build PASS | Candidate `d765914b`; Windows local |
| Database/RLS/RPC | None | Not applicable; no database changes | Candidate `d765914b` |
| Desktop/mobile UI | `npm run test:e2e -- e2e/issue-410-browse-controls.spec.ts --project=chromium --workers=1 --retries=0` | NOT RUN. The test harness starts Vite review mode and has no explicit Docker command/dependency, but `docs/operations/LOCAL_PROOF_PREFLIGHT.md` requires `docker info` to succeed before local browser acceptance; the Linux engine was unavailable. | Candidate `d765914b`; rendered result unverified |
| Accessibility/error states | Existing spec uses keyboard Enter and pointer Apply/Clear; no browser run or screen-reader pass | BLOCKED / partial | Candidate `d765914b` |
| Hosted/provider lifecycle | None | Not run; no hosted change authorized | Not applicable |
| Canonical production route | None | Not run; no deployment authorized | Not applicable |

## Security and negative proof

- Denied identities/scopes: not applicable; no authorization code changed.
- Failure and timeout behavior: not applicable to this CSS/docs slice.
- Secret/PII handling: no secrets or personal data touched.
- Security review: not requested by the change risk; independent Standards and Spec review completed.

## Independent review

- Reviewer: separate Standards and Spec review agents
- Standards verdict: PASS; no documented violations or smell findings. The dark `--teal` token resolves to documented dusty blue `#8795B5`; default CSS excludes hover/active/disabled states.
- Spec verdict: Scope and implementation PASS; rendered verification partial because browser proof is unavailable.
- Final verdict: `BLOCKED`
- Findings and disposition: original review caught a dark-hover cascade issue and off-scale `0.8rem` spacing. Final candidate scopes the dark default rule away from hover/active/disabled and uses `0.75rem` (12px), then reruns checks.

## Unverified

Rendered theme contrast and keyboard/pointer browser flows remain unverified because the Docker Linux engine is unavailable and the repository preflight gate requires a successful `docker info`. The test harness itself is Vite-only, so it is technically Docker-independent, but local proof was not run against the documented gate. The current test does not explicitly activate Apply by keyboard. No CI, hosted, deployment, or canonical-route proof was produced. Current `main` remained `29491d879451b77a17664a984e41a94d25f39f78`; #423, #408, and #394 were not changed.

## Invalidation

Evidence applies to source candidate `d765914b6855742a13d32b79a55f20e609856925` and the local environment above. Rerun affected review and checks after any source/configuration/fixture change, and run the blocked browser proof after the Linux engine responds.
