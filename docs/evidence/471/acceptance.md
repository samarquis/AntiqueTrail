# Evidence — #471 owner-intake routes

## Candidate

- Issue/spec: [#471 Reconcile owner-intake routes with canonical source state](https://github.com/samarquis/AntiqueTrail/issues/471)
- Owner/chat: Samar Marquis / #471 task
- Risk: standard; public route presentation, with server-owned intake gates unchanged
- Ticket-admission baseline SHA: c9bb80250d5087ace3638059da09cd628bc1fad6
- Current integration base: de76d381ca7b522b25c61eea20920569085f3b93
- Current source/test commit: 18d8cb9a78239bae4281d962fd1f01911c232353
- Prior implementation review head: 94440c0fc0e8cc3fae80446bb56f6e85d322a912
- Prior evidence and green-CI head: 5d422063011e7497b12cc1ed986a0d10193f19e7, based on 5391bd027b4f3df3a3fde85e02c284345d8fe1aa
- Branch: codex/issue-471-owner-intake-routes
- Evidence captured: 2026-10-02 UTC

## Scope

Changed outcome: When owner intake is unavailable on /for-stores or /partner/claim, show one shared catalog-only explanation and a Browse stores link. The server availability response remains the route gate.

Excluded scope: Enabling applications, invitations, claims, or activation; changing availability authority; hosted data or provider mutation; publication or deployment.

Overlapping work: No existing #471 branch or PR at admission. #473 was held from the shared App.tsx seam and notified after classification: [#473 handoff](https://github.com/samarquis/AntiqueTrail/issues/473#issuecomment-5955939885). Source classification: [#471 comment](https://github.com/samarquis/AntiqueTrail/issues/471#issuecomment-5955924300).

## Acceptance

| Criterion                                    | Observable pass condition                                                                                               | Verification                                                    | Result                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bind source before interpreting routes       | Canonical alias, deployment, source SHA, and artifact receipt identify the same release                                 | Read-only Vercel inspect/alias data and PR #465 release receipt | Pass: alias antique-trail.vercel.app → antique-trail-1xnz1ydq2-scott-marquis-projects.vercel.app; deployment dpl_6zUinfmc3LhkpvH7ELAvSHxRyMnT; source c9bb80250d5087ace3638059da09cd628bc1fad6; artifact SHA-256 D8F3C8980BB8E08CE5D3A88722B4E3082F8528845B037CEB26AC5605E0183940. [Receipt](https://github.com/samarquis/AntiqueTrail/pull/465#issuecomment-5952156359). |
| Recheck both routes against bound deployment | Both routes show observed baseline state                                                                                | Direct anonymous browser checks before edits                    | Pass: /for-stores and /partner/claim both showed Page not found on the bound c9bb... deployment.                                                                                                                                                                                                                                                                          |
| Explain intentional public-test withholding  | Both gated routes show the same catalog-only message and /stores link when their server flag is false or unavailable    | Direct route tests                                              | Pass: both assert the shared heading, body, Browse stores link, and absence of intake actions. /for-stores isolates routeVisible; /partner/claim isolates claimsAvailable.                                                                                                                                                                                                |
| Preserve fail-closed behavior                | False or failed availability never renders owner application or claim flows; other guarded routes keep NotFound default | App route tests                                                 | Pass: unavailable and rejected availability paths show the boundary; the available route test and other private-route default remain covered.                                                                                                                                                                                                                             |
| Keep hosted evidence separate                | Candidate is not represented as production behavior                                                                     | Read-only Vercel/source review; no deployment                   | Pass: production remains on c9bb...; candidate was not deployed.                                                                                                                                                                                                                                                                                                          |

## Verification

| Layer                      | Command or flow                                                                                                       | Result                                                                                                                                                                                                                         | Applies to                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Focused tests              | npx vitest run src/app/App.test.tsx src/features/partners/ownerAcquisitionPage.test.tsx --pool=threads --maxWorkers=1 | Pass after rebase: 2 files, 42 tests.                                                                                                                                                                                          | Source/test commit 18d8cb9a78239bae4281d962fd1f01911c232353 |
| Typecheck/build            | npm run build                                                                                                         | Pass after rebase: tsc -b, Vite transformed 239 modules, PWA generated 18 precache entries.                                                                                                                                    | Source/test commit 18d8cb9a78239bae4281d962fd1f01911c232353 |
| Lint                       | npx eslint src/app/App.tsx src/app/App.test.tsx src/features/partners/ownerAcquisitionPage.test.tsx                   | Pass, exit 0 after rebase.                                                                                                                                                                                                     | Source/test commit 18d8cb9a78239bae4281d962fd1f01911c232353 |
| Formatting                 | npx prettier --check on the three changed source/test files                                                           | Pass after rebase: all matched files use Prettier code style.                                                                                                                                                                  | Source/test commit 18d8cb9a78239bae4281d962fd1f01911c232353 |
| Design detector            | Impeccable detect --json src/app/App.tsx                                                                              | Pass: empty findings at reviewed head 94440; App.tsx remains byte-identical after rebase.                                                                                                                                      | App.tsx                                                     |
| Prior PR CI                | PR #481 head 5d422063011e7497b12cc1ed986a0d10193f19e7, base 5391bd027b4f3df3a3fde85e02c284345d8fe1aa                  | Pass: web, database, configured-owner-billing. Supabase Preview skipped. This check set predates the current main rebase.                                                                                                      | GitHub Actions                                              |
| Current PR CI              | Rebased candidate based on de76d381ca7b522b25c61eea20920569085f3b93                                                   | Prior results are listed separately; rebase invalidates them for the current head. Verify current-head checks through GitHub before merge.                                                                                     | GitHub Actions                                              |
| Database/RLS/RPC           | Not run                                                                                                               | UI-only change; no database or hosted account test requested.                                                                                                                                                                  | Not applicable                                              |
| Desktop/mobile UI          | Opened /partner/claim on local Vite at http://127.0.0.1:4174                                                          | Limitation: no-env review harness reports claimsAvailable=true and redirects to synthetic sign-in, so it cannot display the unavailable state. No account/sign-in test was performed; false-flag UI is covered by route tests. | Local dev fixture                                           |
| Hosted/provider lifecycle  | Read-only Vercel identity checks; vercel.json has git.deploymentEnabled=false                                         | No provider mutation or deployment.                                                                                                                                                                                            | Bound baseline deployment only                              |
| Canonical production route | Both routes checked before edits on the bound deployment                                                              | Baseline observed. Candidate production rendering remains unverified because no deployment was authorized.                                                                                                                     | dpl_6zUinfmc3LhkpvH7ELAvSHxRyMnT, source c9bb...            |

### PR check follow-up

PR #481 initially failed web at head e367080b9d4303984ea531e5e6a23fcefcbdef6e because ownerAcquisitionPage.test.tsx expected Page not found. The annotated DOM showed the approved catalog boundary and no acquisition action. The assertion now expects the shared boundary and still forbids the application button/form. The evidence head 5d422 passed web, database, and configured-owner-billing before main advanced. The candidate is now rebased onto de76d381; pre-rebase checks remain historical and do not replace current-head checks.

## Security and negative proof

- No authentication, authorization, or availability scopes changed.
- Availability rejection remains fail-closed. Only /for-stores and /partner/claim receive the explanatory fallback; other guards retain NotFound.
- No secrets or personal data introduced or transmitted.
- No security contract or server authority changed.

## Independent review

- Root/overseer Standards and Spec review passed with no findings at PR head 94440c0fc0e8cc3fae80446bb56f6e85d322a912.
- Current App.tsx and ownerAcquisitionPage.test.tsx match that reviewed head.
- Current App.test.tsx includes the upstream #480 copy expectation update to “Private account actions are paused”; this test change was not in the reviewed head.
- Fresh exact-head Standards and Spec review is a merge gate because App.test.tsx changed in the rebase.

## Unverified

- Candidate is not deployed; production still reflects the previously bound artifact. User excluded deployment.
- Manual desktop/mobile rendering of the unavailable state was not possible with the stock local review harness.
- Merge and live issue closure remain pending.

## Invalidation

Local verification applies to source/test commit 18d8cb9a78239bae4281d962fd1f01911c232353. Prior remote check results apply only to PR head 5d422063011e7497b12cc1ed986a0d10193f19e7 on base 5391bd027b4f3df3a3fde85e02c284345d8fe1aa. Prior independent review applies to PR head 94440c0fc0e8cc3fae80446bb56f6e85d322a912. Re-run affected checks and obtain fresh review for the current rebase before merge.
