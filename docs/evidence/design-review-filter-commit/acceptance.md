# Evidence — issue #502 filter commit

## Candidate

- Issue/spec: [#502 accepted contract](https://github.com/samarquis/AntiqueTrail/issues/502#issuecomment-5972412631)
- Owner/chat: `samarquis`, issue #502 worker
- Risk: standard; public catalog filter state only
- Accepted source baseline: `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`
- PR base when candidate was prepared: `30ceef8d98c4689ef7d2cf8a127ae68040d87886`; this advances the accepted baseline only with the #501 evidence record.
- Candidate SHA and raw diff SHA-256: recorded in the PR review receipt so this file does not change its own candidate. Recompute from the repository root with `git diff --binary 30ceef8d98c4689ef7d2cf8a127ae68040d87886 <candidate-sha> -- | node -e "const {createHash}=require('node:crypto');const chunks=[];process.stdin.on('data',chunk=>chunks.push(chunk));process.stdin.on('end',()=>console.log(createHash('sha256').update(Buffer.concat(chunks)).digest('hex')));"`.
- Worktree/branch: isolated #502 worktree, `codex/issue-502-filter-commit`
- Evidence captured at: 2026-10-03

## Scope

Changed outcome: Search text, Category, and Area share a draft snapshot. Search, Enter, and Apply submit the complete normalized snapshot. Applied criteria continue to drive results, counts, active state, and URL until submission. Clear resets draft and applied criteria, including draft-only and zero-result states.

Excluded scope: later-stage filter availability, labels/disclosure, filter API, map behavior, query parsing/serialization and history policy, CSS, provider settings, hosted data, and deployment.

Overlapping branches/worktrees checked: #500 owns the Browse notice region; no notice JSX changed. #503 owns the shared browser lane. #506 owns serial integration. Candidate rebased onto the current main descendant before finalization; no concurrent runtime change was in that update.

Pre-existing failures or unrelated work: the full Vitest run had one 5-second timeout in the unrelated Site Admin revocation test; the same test passed when rerun alone. The run also printed jsdom's existing unsupported-navigation diagnostic while completing affected component tests successfully.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Draft snapshot | Query, Category, and Area edits leave applied URL/results/count/active state/list calls unchanged until submit. | `designReviewFilters.test.tsx`; 47 focused catalog tests | Pass; draft-only interactions do not call the list again or mark filters active. |
| Unified commit | Search, Enter, and Apply submit the same trimmed query plus selected Category and Area. | Parameterized unit tests; E2E spec discovery | Unit pass. Five E2E cases discovered; browser execution pending. |
| Applied state and recovery | Applied query survives draft edits; Clear resets both states; reload restores URL criteria; failures retain submitted values and show an error. | Focused unit tests | Pass, including error and reload cases. |
| Existing Browse contract | Package 1 labels and later-stage gating remain; map receives only applied criteria. | `components.test.tsx` | Pass; map assertion now checks draft isolation before Apply and applied category after Apply. |
| Scope boundaries | No new filter API, private write, location/map flow, or query-policy change. | Exact diff review | Pass; `BrowsePage:updateFilters` and serialization remain unchanged. |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| -------------------------- | --------------- | ------ | -------------------------- |
| Focused tests | `npx vitest run src/features/catalog/designReviewFilters.test.tsx src/features/catalog/components.test.tsx` | Pass: 47 tests | Candidate source; local jsdom/demo catalog |
| Type/lint/format/build | `npm run typecheck`; targeted ESLint/Prettier; `npm run build` | Pass. Repository lint reports 16 warnings in unrelated files. | Candidate source; local |
| Full unit suite | `npm run check` | 1,123 passed, 1 skipped, 1 unrelated timeout; chain stopped there. Timed-out test passed in isolation. | Candidate source; local |
| Release tests | `npm run test:release` | Pass: 165 tests | Candidate source; local |
| Seed media | `node scripts/verify-seed-media.mjs --built-root dist` | Pass: no errors | Candidate build; local |
| E2E discovery | `npx playwright test e2e/design-review-filter-commit.spec.ts --project=chromium --list` | Pass: five cases discovered; no browser launched. | Candidate source; local |
| Desktop/mobile UI | `npx playwright test e2e/design-review-filter-commit.spec.ts --project=chromium --workers=1 --retries=0` | Not run; the shared browser lane belongs to #503. | Browser lane unavailable to #502 |
| Database/RLS/RPC | None | Not applicable; no database access. | — |
| Hosted/provider lifecycle | None | Not run or in scope. | — |
| Canonical production route | None | Not run or in scope. | — |

## Security and negative proof

- Denied identities/scopes: not applicable; no authentication or authorization change.
- Failure and timeout behavior: request errors retain submitted filter values and show the existing failure state; unit test passes.
- Secret/PII handling: no secret or personal data added; no provider or hosted data touched.
- Security review: no security-sensitive source boundary changed.

## Independent review

- Reviewer: exact PR-head Standards and Spec receipts are maintained in the PR description.
- Standards verdict: pending at evidence capture; see PR description for the exact-head receipt.
- Spec verdict: pending at evidence capture; see PR description for the exact-head receipt.
- Final verdict: `BLOCKED` at evidence capture pending independent review, browser evidence, and required CI.
- Findings and disposition: final review and integration receipts are maintained in the PR description; issue closure remains with the serial owner.

## Unverified

Rendered desktop/mobile behavior, theme after real browser navigation, browser focus/target measurements, required GitHub CI, independent exact-head reviews, hosted behavior, and canonical production behavior remain unverified. Local unit evidence does not claim browser or production behavior.

## Invalidation

Evidence applies to the exact PR head and local environment named in the PR review receipt. Any relevant source, test, fixture, or config change invalidates the affected checks and reviews.
