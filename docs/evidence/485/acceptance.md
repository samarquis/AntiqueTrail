# Evidence — issue #485

## Candidate

- Issue/spec: [#485](https://github.com/samarquis/AntiqueTrail/issues/485), draft-only corrections in catalog-only public test
- PR: [#492](https://github.com/samarquis/AntiqueTrail/pull/492), draft; final-head CI and reviews pending
- Owner/chat: `samarquis`, Codex task `#485`
- Risk: high (authorization boundary and untrusted correction input)
- Baseline SHA: `07e8610d8cd1cf9a941d0b6de6a0f3aeb87c304a`
- Implementation, test, and contract SHA: `1cc979dbe43876d3b8f8a5716167a8536af1ac40`
- Implementation diff fingerprint (excluding this evidence report): `65ad6732cc5bd62e40f02a540817280aa467f395`
- Worktree/branch: `C:\Users\samar\.codex\worktrees\1b64\AntiqueTrail`, `codex/issue-485-correction-drafts`
- Evidence captured at: 2026-10-03
- The product implementation is unchanged after `e342241`; later commits strengthen the dedicated E2E proof. This report records that exact test candidate. The evidence-report commit is documentation-only; CI and reviews must bind to the PR head containing it.

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
| Desktop browser            | `npx playwright test --config=playwright.issue-468.config.ts`                                                     | PASS: 2 Chromium tests on `1cc979d`; light/dark axe, forced-color system-palette contrast and visible focus, keyboard Tab+Enter, blocked submission, text spacing, and 640px reflow proxy. Browser-chrome 200% zoom is not emulated. | Windows, `VITE_PUBLIC_TEST_CATALOG_ONLY=true`; synthetic Blue Finch Curios; port 4185; receipt `test-results/.last-run.json` reports `passed`. |
| Playwright selection       | `npx playwright test --list`; dedicated config `--list`                                                            | PASS: default suite excludes this spec (758 tests listed); dedicated config selects exactly 2 tests.                                                            | `1cc979d`; local config discovery.                                                                                                                                   |
| Final-head browser and CI  | GitHub Actions on PR #492 | PASS: CI run 37129121914 completed successfully on exact PR head 083d491a; web, database, configured-owner-billing all passed, and session-signout run 37129121913 passed. This head contains source/test candidate 1cc979d. | GitHub runner; exact head 083d491a. The following evidence-reference correction is documentation-only and needs its own PR checks. |
| Database/RLS/RPC           | No database/schema/RLS changes. Handler denial uses injected local verifier/gateway fakes.                        | N/A; local unit proof.                                                                                                                                          | No database or hosted data used.                                                                                                                                       |
| Mobile browser             | Not run; issue acceptance is keyboard operation and route behavior, exercised in desktop Chromium.                | Not applicable to current acceptance.                                                                                                                           | No mobile rendering claim.                                                                                                                                             |
| Accessibility/error states | Axe on owned surfaces in light/dark; forced-colors axe except its stale `-webkit-text-fill-color` contrast rule, with computed system-palette contrast/focus assertions; keyboard operation; blocked `sessionStorage`. | PASS locally on `1cc979d`; independent exact-head review pending. Pre-existing whole-Details contrast finding remains outside owned surface. | Dedicated E2E plus focused tests. |
| Hosted/provider lifecycle  | Not run; issue excludes hosted tests and provider mutation.                                                       | Not applicable.                                                                                                                                                 | No hosted environment used.                                                                                                                                            |
| Canonical production route | Not run; Edge/site deployment remains separately gated.                                                           | Not authorized/in scope.                                                                                                                                        | No production claim.                                                                                                                                                   |

## Resource lease

- Owner/task: `samarquis`, Codex task `#485`, ticket #485
- Browser-tested source: `1cc979dbe43876d3b8f8a5716167a8536af1ac40`
- Runner: `npx playwright test --config=playwright.issue-468.config.ts`
- Run receipt: `test-results/.last-run.json` (`status: passed`, no failed tests)
- Project ID: none; local browser-only Vite app with synthetic catalog client
- Loopback port: `127.0.0.1:4185`; no listener after the run
- Fixture mode: `VITE_PUBLIC_TEST_CATALOG_ONLY=true`; synthetic Blue Finch Curios listing
- Release: Playwright exited, browser contexts closed, and port 4185 released for #470/#467; no listener remained after the final run.
- Preflight note: `docker info` could not connect to the Linux engine. This route uses no Docker, database, or provider, so Docker was not a prerequisite.

## Security and negative proof

- Denied identities/scopes: public-test correction requests are denied even for authenticated sessions; `PUBLIC_TEST_MODE=true` check precedes session verification or RPC gateway.
- Failure behavior: blocked session storage keeps current field values visible and announces that the tab could not save the draft; ordinary public server errors remain generic `Unavailable`.
- Secret/PII handling: no credentials or personal data used. Test draft text is synthetic.
- Security review: exact final diff scan 2a15422a-9696-4fc6-bcd1-eaf36d60bd72 completed on PR head 083d491a; complete coverage, 11 source/config rows, 0 candidates/findings. The report-only evidence-reference correction does not change source or test files.

## Independent review

- Reviewer: /root/review_485; REWORK on 083d491a for two stale evidence references. Browser source SHA and CI head are now corrected; exact review of the documentation-only follow-up is pending.
- Standards verdict: REWORK on 083d491a; no product-code finding, two evidence-reference corrections made.
- Spec verdict: PASS for draft-only behavior and acceptance coverage.
- Final verdict: pending exact review of the evidence-reference follow-up.
- Findings and disposition: updated browser-tested SHA to 1cc979d; bound CI status to run 37129121914 at 083d491a.

## Unverified

Hosted PUBLIC_TEST_MODE value, Edge deployment identity, hosted correction denial, mobile layout, PR checks on the evidence-reference-only follow-up, and exact-head independent re-review remain unverified. CI and security review passed at 083d491a; the source/test candidate is unchanged by the pending documentation correction. Hosted/deployment proof is excluded by issue #485 and needs a separate gate; both reviews and current PR checks remain required before merge.

## Invalidation

Source, test, config, fixture, integration, or baseline changes invalidate affected evidence. The report-only addition does not alter those files; refresh CI and exact-head reviews on the final PR head before merge.
