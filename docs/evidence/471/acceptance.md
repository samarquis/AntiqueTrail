# Evidence — #471 owner-intake routes

## Candidate

- Issue/spec: [#471 Reconcile owner-intake routes with canonical source state](https://github.com/samarquis/AntiqueTrail/issues/471)
- Owner/chat: Samar Marquis / current #471 task
- Risk: standard — public route presentation; server-owned intake gates unchanged
- Ticket-admission baseline SHA: `c9bb80250d5087ace3638059da09cd628bc1fad6`
- Integration base SHA: `2a97fa2234dd00ded5e3607cdc7cb91821d4630c` (includes #477; only `e2e/review-harness.spec.ts` changed after admission)
- Candidate SHA: `1d473670d170d24da550bdb837327609188baec5` (implementation commit)
- Diff fingerprint: stable Git patch ID `51ff4bedd2c7093a58bc5d9df97fa804f7954902`
- Worktree/branch: `C:\Users\samar\.codex\worktrees\2fe1\AntiqueTrail` / `codex/issue-471-owner-intake-routes`
- Evidence captured at: 2026-10-02 UTC

## Scope

Changed outcome: When owner intake is unavailable on `/for-stores` or `/partner/claim`, show one shared catalog-only explanation and a `Browse stores` return link. Keep the server availability response as the route gate.

Excluded scope: Enabling applications, invitations, claims, or activation; changing availability authority; hosted data or provider mutation; publication or deployment.

Overlapping branches/worktrees checked: No existing #471 branch or PR at admission. #473 was held from the shared `App.tsx` seam and notified after the source classification; see [#473 handoff](https://github.com/samarquis/AntiqueTrail/issues/473#issuecomment-5955939885). The written source classification is [on #471](https://github.com/samarquis/AntiqueTrail/issues/471#issuecomment-5955924300).

Pre-existing failures or unrelated work: None identified. The test-first red run failed because the new message was absent, as expected; it passed after the route fix.

## Acceptance

| Criterion                                    | Observable pass condition                                                                                                 | Verification method                                                    | Result/evidence                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bind source before interpreting routes       | Canonical alias, deployment, source SHA, and artifact receipt identify the same release                                   | Read-only Vercel inspect/alias data and merged PR #465 release receipt | Pass: alias `antique-trail.vercel.app` → `antique-trail-1xnz1ydq2-scott-marquis-projects.vercel.app`; deployment `dpl_6zUinfmc3LhkpvH7ELAvSHxRyMnT`; source `c9bb80250d5087ace3638059da09cd628bc1fad6`; artifact SHA-256 `D8F3C8980BB8E08CE5D3A88722B4E3082F8528845B037CEB26AC5605E0183940`. Receipt: [PR #465](https://github.com/samarquis/AntiqueTrail/pull/465#issuecomment-5952156359). |
| Recheck both routes against bound deployment | Both routes show the observed baseline state                                                                              | Direct anonymous browser checks before edits                           | Pass: `/for-stores` and `/partner/claim` both showed `Page not found` on the bound `c9bb...` deployment.                                                                                                                                                                                                                                                                                     |
| Explain intentional public-test withholding  | Both gated routes show the same catalog-only message and `/stores` link when their server flag is false or unavailable    | `src/app/App.test.tsx` direct-route assertions                         | Pass: both route tests verify shared heading, body, return link, and absence of intake form/actions.                                                                                                                                                                                                                                                                                         |
| Preserve fail-closed behavior                | False or failed availability never renders owner application or claim flows; other guarded routes keep `NotFound` default | Focused route tests and full `App.test.tsx` file                       | Pass: existing positive availability route test also passes; default private-route fallback is unchanged.                                                                                                                                                                                                                                                                                    |
| Keep hosted evidence separate                | Candidate is not represented as production behavior                                                                       | Read-only Vercel/source review; no deployment performed                | Pass: candidate is local source only; production remains on `c9bb...`.                                                                                                                                                                                                                                                                                                                       |

## Verification

| Layer                      | Command or flow                                                                                                                                               | Result                                                                                                                                                                            | Applies to SHA/environment                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Focused tests              | `npx vitest run src/app/App.test.tsx --maxWorkers=1`                                                                                                          | Pre-rebase pass: 37 tests on `ee67c854c7998c8d4a5226d03245d34b237d535d`. Post-rebase attempt timed out before worker launch under shared #476/#466 load; exact-head retry pending | Same `App.tsx`/`App.test.tsx` content as pre-rebase source                 |
| Type/lint/format/build     | `npm run build`; `npx eslint src/app/App.tsx src/app/App.test.tsx`; `npx prettier --check src/app/App.tsx src/app/App.test.tsx`                               | Pre-rebase build (239 modules), lint, and source formatting passed. Post-rebase lint passed; build retry pending after shared-host load                                           | Same `App.tsx`/`App.test.tsx` content as pre-rebase source                 |
| Design detector            | Impeccable `detect --json src/app/App.tsx`                                                                                                                    | Pass: `[]` before rebase; `App.tsx` is unchanged                                                                                                                                  | Same `App.tsx`/`App.test.tsx` content as pre-rebase source                 |
| Database/RLS/RPC           | Not run                                                                                                                                                       | UI-only change; no database or hosted account test requested                                                                                                                      | Not applicable                                                             |
| Desktop/mobile UI          | Local Vite opened `/partner/claim` at `http://127.0.0.1:4174`; its no-env review harness reported `claimsAvailable: true` and redirected to synthetic sign-in | Limitation: local fixture does not render the unavailable state. No sign-in or account test performed; false-flag rendering is verified by direct route tests.                    | Local dev fixture, not production                                          |
| Accessibility/error states | Testing Library role queries checked H1, body, Browse link, and no intake form/action; rejected default availability client reaches public boundary fallback  | Passed before rebase on the same app files; exact-head retry pending                                                                                                              | Same app files as pre-rebase source, local DOM tests                       |
| Hosted/provider lifecycle  | Read-only Vercel identity checks; `vercel.json` has `git.deploymentEnabled: false`                                                                            | No provider mutation or deployment.                                                                                                                                               | Bound baseline deployment only                                             |
| Canonical production route | Both routes returned `Page not found` before edits on bound deployment                                                                                        | Baseline observed; candidate was not deployed, so candidate production rendering is unverified by design.                                                                         | Production deployment `dpl_6zUinfmc3LhkpvH7ELAvSHxRyMnT`, source `c9bb...` |

## Security and negative proof

- Denied identities/scopes: no authentication, authorization, or availability scopes were changed.
- Failure and timeout behavior: availability rejection remains fail-closed. Only the two explicitly public routes receive the explanatory fallback; other guards retain `NotFound`.
- Secret/PII handling: none introduced or transmitted.
- Security review: pending exact-head review; no security contract or server authority changes.

## Independent review

- Reviewer: pending parent/overseer review
- Standards verdict: pending
- Spec verdict: pending
- Final verdict: pending
- Findings and disposition: request exact-head review after PR creation.

## Unverified

- Candidate is not deployed; canonical routes still reflect the previously bound production artifact. User excluded deployment.
- Manual desktop/mobile rendering of the unavailable state was not possible with the stock local review harness because it reports route and claim availability as true; no harness behavior was expanded for this UI-only ticket.
- Parent review, CI on PR head, merge, and live issue closure remain pending.

## Invalidation

Evidence applies to implementation SHA `1d473670d170d24da550bdb837327609188baec5` and the named local or baseline-production environment. Re-run affected checks and review after any source or integration change.
