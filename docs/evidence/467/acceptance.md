# Evidence — #467 synthetic catalog provenance

## Candidate

- Issue/spec: [#467 — Align store trust language with synthetic provenance](https://github.com/samarquis/AntiqueTrail/issues/467); [PR #493](https://github.com/samarquis/AntiqueTrail/pull/493).
- Owner/chat: Codex takeover; isolated worktree `ca70/AntiqueTrail`, branch `codex/issue-467-trust-provenance`.
- Risk: standard; public catalog trust and provenance presentation. No authority or data mutation.
- Baseline SHA: integration base `1fd772a436226f0e2fa43136b3dbe33c4af65d90`; ticket admission base `c9bb80250d5087ace3638059da09cd628bc1fad6`.
- Candidate SHA: `6efafa60e4d6f5c221782cbee06a12cd4f4e59c6`.
- Diff fingerprint: `63f1c88e78cab604108b14e0ca942f612d8c8f4b` (`origin/main...6efafa60`).
- Evidence-only descendant: this record is added after the source candidate; final PR head, checks, and reviews are recorded in PR #493.
- Evidence captured: 2026-10-03.

## Scope

Changed outcome: Browse and Details use neutral trust language, show fictional-data disclosure beside freshness/provenance, preserve unavailable fallbacks, and render current, overdue, and unavailable freshness consistently. A bounded `muted` token exception for the Details provenance eyebrow is documented in `DESIGN_SYSTEM.md`; the browser test verifies contrast in both themes.

Excluded scope: verification-age calculation, source/date fabrication, real-store verification, database or provider mutation, and deployment.

Overlapping branches/worktrees checked: integration includes PR #470 at `1fd772a436226f0e2fa43136b3dbe33c4af65d90`; no #470 source hunks changed. The issue admission comment also records the #490 dependency integration and bounds this presentation work.

Pre-existing failures or unrelated work: lint reports 16 existing warnings and no errors. JSDOM emits a nonfatal unsupported-navigation message during unit tests.

## Acceptance

| Criterion                           | Observable pass condition                                                                         | Verification method                           | Result/evidence                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Trust headings match evidence       | No independent-verification promise; displayed date is named accurately                           | Component tests and rendered details          | Pass: neutral “Listing information”; “Verification date” retained for the actual date field             |
| Fictional disclosure stays adjacent | Disclosure appears beside freshness in Browse and provenance in Details                           | Component and browser tests                   | Pass across all 12 synthetic fixtures                                                                   |
| Missing values remain unavailable   | No source or date invented                                                                        | Component tests                               | Pass; unavailable labels remain explicit                                                                |
| Freshness states agree              | Current, overdue, and unavailable fixtures show matching state in Browse and Details              | Browser test, light and dark                  | Pass for all three states                                                                               |
| Text remains readable and exposed   | Disclosure is visible and not under `aria-hidden`; provenance eyebrow has at least 4.5:1 contrast | Browser test                                  | Pass in both themes; theme persists across every Browse/Details navigation                              |
| Preserve #416 action bound          | Save remains inside 800px viewport with controlled 12px card-density delta                        | Existing focused Chromium/mobile browser test | Pass on source candidate `1438f822`; runtime layout unchanged since, and exact-head CI reruns the suite |

## Verification

| Layer                      | Command or flow                                                                                                     | Result                                                                                                                                                                   | Applies to SHA/environment                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Focused tests              | `npx vitest run src/features/catalog/components.test.tsx src/features/catalog/query.test.ts src/app/styles.test.ts` | 93/93 passed                                                                                                                                                             | `9348a88`; component and style behavior unchanged in `6efafa60`                      |
| Type/lint/format/build     | `npm run check`                                                                                                     | Pass: typecheck, lint (0 errors, 16 existing warnings), formatting, 1109 Vitest passed/1 skipped, 164 release tests passed, production build and seed-media verification | `6efafa60`, local Windows worktree                                                   |
| Database/RLS/RPC           | GitHub Actions run [37127368430](https://github.com/samarquis/AntiqueTrail/actions/runs/37127368430)                | `database` passed; no application schema change                                                                                                                          | Exact source candidate `6efafa60`, hosted CI ephemeral database                      |
| Desktop/mobile UI          | `npx playwright test e2e/issue-467-provenance.spec.ts --project=chromium --retries=0`; CI `web` job                 | Local 1/1 passed; exact-head web job passed                                                                                                                              | `6efafa60`; local Chromium and hosted Chromium/mobile projects                       |
| Accessibility/error states | Provenance E2E checks visible DOM text, no `aria-hidden` ancestor, persisted theme, and computed contrast ≥4.5:1    | Pass for light/dark and current/overdue/unavailable                                                                                                                      | `6efafa60`, local and hosted browser runs; no assistive-technology session performed |
| Hosted/provider lifecycle  | Exact-head CI: `configured-owner-billing` passed; Supabase Preview skipped                                          | Pass for CI gate; no external provider mutation                                                                                                                          | `6efafa60`                                                                           |
| Canonical production route | No deployment requested or performed                                                                                | Not verified; production acceptance excluded                                                                                                                             | Not applicable to this issue                                                         |

## Security and negative proof

- Denied identities/scopes: not applicable; no authorization boundary changed.
- Failure and timeout behavior: no server or state transition changed.
- Secret/PII handling: no new secret or personal-data handling.
- Security review: exact-head repository security contract and dependency audit steps passed in CI; no security-sensitive code changed.

## Independent review

- Reviewer: independent Spec and Standards reviews at exact source candidate `6efafa60e4d6f5c221782cbee06a12cd4f4e59c6`, against base `1fd772a436226f0e2fa43136b3dbe33c4af65d90`.
- Standards verdict: PASS.
- Spec verdict: PASS.
- Final verdict: `WOWED`.
- Findings and disposition: documented the narrow provenance-eyebrow contrast exception and asserted actual theme persistence after navigation. Nonblocking text-inference and repeated-paragraph smells were judged acceptable for the ticket’s synthetic-data boundary; no change made.

## Unverified

Canonical production rendering was not tested because deployment is out of scope. Supabase Preview was skipped. No real-store verification or screen-reader session is claimed.

## Invalidation

Local and hosted results above apply to the candidate SHA and environments named in each row. The evidence-only descendant changes no runtime source; PR #493 records its exact head and final hosted checks. Any relevant source, test, configuration, or integration change requires refreshed affected checks and review.
