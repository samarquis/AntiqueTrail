# Evidence — issue #485

## Candidate

- Issue/spec: [#485](https://github.com/samarquis/AntiqueTrail/issues/485), draft-only corrections in catalog-only public test
- PR: [#492](https://github.com/samarquis/AntiqueTrail/pull/492), draft pending final CI and reviews
- Owner/chat: `samarquis`, Codex task `#485`
- Risk: high (authorization boundary and untrusted correction input)
- Baseline SHA: `07e8610d8cd1cf9a941d0b6de6a0f3aeb87c304a`
- Implementation, test, and contract SHA: `e342241e3bd1f88c4aaf0b8f28b81e5fbc41c47d`
- Implementation diff fingerprint (excluding this evidence report): `63beaba2c3f6df1f91daf75f9f85f221ca782529`
- Worktree/branch: `C:\Users\samar\.codex\worktrees\1b64\AntiqueTrail`, `codex/issue-485-correction-drafts`
- Evidence captured at: 2026-10-03
- This evidence file is a documentation-only addition after the implementation SHA; final CI and review must use the PR head containing this report.

## Scope

Changed outcome: Public Help, Store Details, and the direct correction route describe and support a browser-tab draft only. Public-test UI omits sign-in and submit actions, keeps drafts in `sessionStorage`, handles blocked storage without losing current form input, and returns to the same store. The server-only `PUBLIC_TEST_MODE=true` guard rejects correction requests before session verification or database submission. `SECURITY_AND_TRUST.md`, `product-capabilities.md`, `DESIGN.md`, and `PUBLIC_TEST_ADMISSION.md` now state this same boundary; `PLAN_CHANGELOG.md` records the Product Owner direction from #468.

Excluded scope: enabling correction submission now; schema/RLS changes; provider settings; hosted account/data tests; Edge deployment; production publication. A future submission capability needs its own approved implementation and release gates.

Overlapping branches/worktrees checked: #485 had no assignee or matching PR at claim; this task assigned itself. The shared dependency fix merged as PR #491 at baseline `07e8610`. #470 owns disjoint files; no correction implementation overlap was found.

Pre-existing failures or unrelated work: an initial whole-Store-Details axe scan found existing color contrast violations on `.catalog-card__categories > li` and `.store-detail__provenance > .eyebrow`. No styles in those regions changed. Final axe checks cover the public Help and correction-form surfaces. The unrelated Store Details contrast finding remains open outside this ticket's accepted surfaces. This branch changes no package manifests or lockfiles. Current-main `npm ci` reported 5 moderate and no high audit findings after PR #491.

## Acceptance

| Criterion                  | Observable pass condition                                                                                                                                   | Verification method                          | Result/evidence                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Consistent public guidance | Help and Store Details describe draft-only behavior and unavailable submission; Details links to the selected store's correction route.                     | Focused App tests and rendered browser spec. | PASS: focused tests and browser test 1/2.                                                                     |
| Draft-only direct route    | Fields remain labelled and keyboard-operable; tab draft persists; cancel returns to same store; no sign-in or submit control; form submit sends no request. | Focused App tests and rendered browser spec. | PASS: focused tests and browser test 2/2, including reload, `sessionStorage`, cancel, and zero Edge requests. |
| Server denial              | With `PUBLIC_TEST_MODE=true`, handler rejects before verifier or gateway calls; ordinary mode remains unchanged.                                            | Correction Edge unit tests.                  | PASS: focused regressions and full local suite.                                                               |

## Verification

| Layer                      | Command or flow                                                                                                   | Result                                                                                                                                                          | Applies to SHA/environment                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused regressions        | Vitest on `publicTestDisplay`, `App`, `correctionGateway`, and shopper components.                                | PASS: 4 files, 97 tests.                                                                                                                                        | Content committed as `e342241`; Windows, clean install from current lockfile.                                                                                          |
| Full local check           | `npm run check`                                                                                                   | PASS: typecheck; lint (16 existing warnings, 0 errors); format; 1,109 tests passed and 1 skipped; 164 release tests; production build; seed-media verification. | Exact working-tree content committed as `e342241`; Windows.                                                                                                            |
| Security contract          | `npm run security:contract`                                                                                       | PASS: secrets, licenses, action pins, migrations, and tier vocabulary.                                                                                          | Exact working-tree content committed as `e342241`; Windows.                                                                                                            |
| Playwright selection       | Default and dedicated Playwright `--list` commands.                                                               | PASS: default selection has no issue-468 spec; dedicated selection contains exactly 2 tests.                                                                    | `e342241`, local config discovery.                                                                                                                                     |
| Desktop browser            | `npx playwright test --config=playwright.issue-468.config.ts`                                                     | PASS: 2 Chromium tests; guidance, draft-only flow, reload, cancel, and no Edge request. Receipt `test-results/.last-run.json` reports `passed`.                 | `2495fcb`; `VITE_PUBLIC_TEST_CATALOG_ONLY=true`; synthetic Blue Finch Curios; port 4185. UI source is unchanged in `e342241`; E2E spec/config formatting changed only. |
| Final-head browser and CI  | GitHub Actions on [PR #492](https://github.com/samarquis/AntiqueTrail/pull/492)                                   | Pending after refreshed test and contract changes; check all jobs on the final PR head.                                                                         | GitHub runner; evidence-file commit also requires checks.                                                                                                              |
| Database/RLS/RPC           | No database/schema/RLS changes. Handler denial uses injected local verifier/gateway fakes.                        | N/A; local unit proof.                                                                                                                                          | No database or hosted data used.                                                                                                                                       |
| Mobile browser             | Not run; issue acceptance is keyboard operation and route behavior, exercised in desktop Chromium.                | Not applicable to current acceptance.                                                                                                                           | No mobile rendering claim.                                                                                                                                             |
| Accessibility/error states | Axe on public Help and correction form; keyboard focus assertion; blocked `sessionStorage` behavior in App tests. | PASS on ticket-owned surfaces; pre-existing whole-Details contrast finding recorded above.                                                                      | `2495fcb` E2E plus `e342241` focused tests.                                                                                                                            |
| Hosted/provider lifecycle  | Not run; issue excludes hosted tests and provider mutation.                                                       | Not applicable.                                                                                                                                                 | No hosted environment used.                                                                                                                                            |
| Canonical production route | Not run; Edge/site deployment remains separately gated.                                                           | Not authorized/in scope.                                                                                                                                        | No production claim.                                                                                                                                                   |

## Resource lease

- Owner/task: `samarquis`, Codex task `#485`, ticket #485
- Browser-tested source: `2495fcb0caf4f00c160b51d6f05cc50dbb1c17fc`
- Runner: `npx playwright test --config=playwright.issue-468.config.ts`
- Run receipt: `test-results/.last-run.json` (`status: passed`, no failed tests)
- Project ID: none; local browser-only Vite app with synthetic catalog client
- Loopback port: `127.0.0.1:4185`; no listener after the run
- Fixture mode: `VITE_PUBLIC_TEST_CATALOG_ONLY=true`; synthetic Blue Finch Curios listing
- Release: Playwright exited, browser contexts closed, and port 4185 released for #470/#467.
- Preflight note: `docker info` could not connect to the Linux engine. This route uses no Docker, database, or provider, so Docker was not a prerequisite.

## Security and negative proof

- Denied identities/scopes: public-test correction requests are denied even for authenticated sessions; `PUBLIC_TEST_MODE=true` check precedes session verification or RPC gateway.
- Failure behavior: blocked session storage keeps current field values visible and announces that the tab could not save the draft; ordinary public server errors remain generic `Unavailable`.
- Secret/PII handling: no credentials or personal data used. Test draft text is synthetic.
- Security review: pending exact-head `codex-security:security-diff-scan` over all 18 PR files, including CI, both Playwright configs, canonical security/product/design/admission docs, and this report.

## Independent review

- Reviewer: pending independent exact-head Standards/Spec review
- Standards verdict: pending
- Spec verdict: pending
- Final verdict: pending
- Findings and disposition: pending

## Unverified

Hosted `PUBLIC_TEST_MODE` value, Edge deployment identity, hosted correction denial, mobile layout, full PR CI at the final head, exact-head security scan, and independent review remain unverified. Hosted/deployment proof is excluded by issue #485 and needs a separate gate; CI and both reviews are required before merge.

## Invalidation

Source, test, config, fixture, integration, or baseline changes invalidate affected evidence. The report-only addition does not alter those files; refresh CI and exact-head reviews on the final PR head before merge.
