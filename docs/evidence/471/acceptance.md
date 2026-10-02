# Evidence — #471 owner-intake routes

## Candidate

- Issue/spec: [#471 Reconcile owner-intake routes with canonical source state](https://github.com/samarquis/AntiqueTrail/issues/471)
- Owner/chat: Samar Marquis / #471 task
- Risk: standard; public route presentation, with server-owned intake gates unchanged
- Ticket-admission baseline SHA: c9bb80250d5087ace3638059da09cd628bc1fad6
- Integration base SHA: 5391bd027b4f3df3a3fde85e02c284345d8fe1aa
- Tested source/test SHA: ff41b1907cdb4fd83399baefa97f8992a132404b
- Reviewed PR head SHA: 94440c0fc0e8cc3fae80446bb56f6e85d322a912
- Implementation diff fingerprint: stable Git patch ID f10c20cff8ce26df1bac2564210c96f9ca59304e
- Worktree/branch: C:\Users\samar\.codex\worktrees\2fe1\AntiqueTrail / codex/issue-471-owner-intake-routes
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

| Layer                      | Command or flow                                                                                                       | Result                                                                                                                                                                                                                         | Applies to                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Focused tests              | npx vitest run src/app/App.test.tsx src/features/partners/ownerAcquisitionPage.test.tsx --pool=threads --maxWorkers=1 | Pass: 2 files, 42 tests. The earlier pre-rebase retry timed out before worker launch during shared-runner load; final rebased candidate passed.                                                                                | Source/test SHA ff41b1907cdb4fd83399baefa97f8992a132404b            |
| Typecheck/build            | npm run build                                                                                                         | Pass: tsc -b, Vite transformed 239 modules, PWA generated 18 precache entries.                                                                                                                                                 | Source/test SHA ff41b1907cdb4fd83399baefa97f8992a132404b            |
| Lint                       | npx eslint src/app/App.tsx src/app/App.test.tsx src/features/partners/ownerAcquisitionPage.test.tsx                   | Pass, exit 0.                                                                                                                                                                                                                  | Source/test SHA ff41b1907cdb4fd83399baefa97f8992a132404b            |
| Formatting                 | npx prettier --check on the three changed source/test files                                                           | Pass: all matched files use Prettier code style.                                                                                                                                                                               | Source/test SHA ff41b1907cdb4fd83399baefa97f8992a132404b            |
| Design detector            | Impeccable detect --json src/app/App.tsx                                                                              | Pass: empty findings before rebase; App.tsx content and patch fingerprint are unchanged.                                                                                                                                       | App.tsx at source/test SHA ff41b1907cdb4fd83399baefa97f8992a132404b |
| PR CI                      | PR #481 at reviewed head 94440c0fc0e8cc3fae80446bb56f6e85d322a912                                                     | Pass: web, database, configured-owner-billing. Supabase Preview skipped. CI will rerun for the evidence-only successor head.                                                                                                   | GitHub Actions                                                      |
| Database/RLS/RPC           | Not run                                                                                                               | UI-only change; no database or hosted account test requested.                                                                                                                                                                  | Not applicable                                                      |
| Desktop/mobile UI          | Opened /partner/claim on local Vite at http://127.0.0.1:4174                                                          | Limitation: no-env review harness reports claimsAvailable=true and redirects to synthetic sign-in, so it cannot display the unavailable state. No account/sign-in test was performed; false-flag UI is covered by route tests. | Local dev fixture                                                   |
| Hosted/provider lifecycle  | Read-only Vercel identity checks; vercel.json has git.deploymentEnabled=false                                         | No provider mutation or deployment.                                                                                                                                                                                            | Bound baseline deployment only                                      |
| Canonical production route | Both routes checked before edits on the bound deployment                                                              | Baseline observed. Candidate production rendering remains unverified because no deployment was authorized.                                                                                                                     | dpl_6zUinfmc3LhkpvH7ELAvSHxRyMnT, source c9bb...                    |

### PR check follow-up

PR #481 initially failed web at head e367080b9d4303984ea531e5e6a23fcefcbdef6e because ownerAcquisitionPage.test.tsx expected Page not found. The annotated DOM showed the approved catalog boundary and no acquisition action. The assertion now expects the shared boundary and still forbids the application button/form. Before rebase, web, database, and owner-billing passed at f484a7b9e074383fa5de3cf762824e39baefd544; Supabase Preview was skipped. At rebased head 94440c0fc0e8cc3fae80446bb56f6e85d322a912, web, database, and configured-owner-billing all passed; Supabase Preview was skipped. An evidence-only successor commit is being prepared.

## Security and negative proof

- No authentication, authorization, or availability scopes changed.
- Availability rejection remains fail-closed. Only /for-stores and /partner/claim receive the explanatory fallback; other guards retain NotFound.
- No secrets or personal data introduced or transmitted.
- Exact-head Standards and Spec review passed on 94440c0fc0e8cc3fae80446bb56f6e85d322a912 with no findings.

## Independent review

- Reviewer: root/overseer, reviewed PR head 94440c0fc0e8cc3fae80446bb56f6e85d322a912.
- Standards verdict: PASS, no findings.
- Spec verdict: PASS, no findings.
- Final verdict: PASS for the implementation/test patch at that exact PR head.
- Findings/disposition: isolated route-flag assertions and candidate evidence were addressed; no open review findings. No source or test changes followed the reviewed head.

## Unverified

- Candidate is not deployed; production still reflects the previously bound artifact. User excluded deployment.
- Manual desktop/mobile rendering of the unavailable state was not possible with the stock local review harness.
- CI for the evidence-only successor head, merge, and live issue closure remain pending.
- Project reflection vault was unset and no project memory file was found; no reflection entry was recorded.

## Invalidation

Verification applies to source/test SHA ff41b1907cdb4fd83399baefa97f8992a132404b, review/CI on PR head 94440c0fc0e8cc3fae80446bb56f6e85d322a912, and the named local or baseline-production environment. Evidence-only documentation changes do not alter implementation; re-run affected checks and reviews after any source or integration change.
