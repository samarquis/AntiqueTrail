# Store Details → Add to Trip — local acceptance

Date: 2026-10-07, America/Chicago. **Local synthetic contract passes; integration and real service acceptance remain pending.**

## Candidate and ownership

- User contract: implement the accepted mockup, then “keep going next.” This is #560's first bounded connection; #560 remains owned by its existing planning chat and #487 retains evidence-specification ownership. No issue body or external state changed.
- Owner: Review AntiqueTrail full-site mockup chat; branch `codex/shopper-details-trip`, worktree `C:/Users/samar/.codex/worktrees/shopper-details-trip/AntiqueTrail`.
- Base: `76177ad501b164483506921eb064c12c6d94ca09`.
- Initial independently reviewed source/test candidate: `2abaaaf79830fc806c6a878749e7a6f8d31e63f1`; the publication correction below records the later test-only candidate.
- Three-dot binary/full-index diff fingerprint: `58cc99304f3df9d39ad21961f7de522714486766`.
- Risk: standard local UI connection. Authentication, session/lifecycle enforcement, service authorization and write interfaces are unchanged.
- Before editing: inspected worktrees, attached ownership, current #560 and open PR #561. Primary dirty checkout and the accepted standalone mockup were preserved. No concurrent application writer was identified; the existing scope and visual-baseline owners retain their work.

## Bounded contract

Expose the existing Store Details Add to Trip action only when all of these hold: DEV build, active existing review runtime, exact loopback hostname (`localhost`, `127.0.0.1` or `[::1]`), catalog-only public restriction off, Shopper or anonymous projection, and not the unadmitted Macvicar preview. Existing `CatalogDetailsPage`, `GuardedTrips` and `NewTripPage` own the action, authentication and chooser. No new planner, service, schema, provider or styling was added.

The selected fixture account is explicit. Successful authentication continuation uses a selected Shopper fixture that signs out and signs back in as the same account. The separate Anonymous fixture proves preserved sign-in entry and denial of unauthenticated writes; its clients retain their Anonymous authority. This evidence does not claim arbitrary identity switching, real registration or real account persistence.

## Acceptance

| Criterion                                       | Observed result                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible Details action reaches existing chooser | Clicked the rendered link; exact Blue Finch store UUID survived. No direct trip URL substitutes for this connection.                                                                                                                                                                                              |
| Allowed sign-in retains selected store          | Selected Shopper signed out, opened Details through Browse, clicked Add to Trip, then signed in; chooser reported that exact store on the seeded trip.                                                                                                                                                            |
| Cancellation makes no write                     | Browser cancellation returned to Browse without a result; unit comparison through the public TripClient interface found identical trip data before/after cancellation.                                                                                                                                            |
| Create and repeat without duplicate stop        | Created a dated trip through the chooser; Plan showed exactly one Blue Finch stop. Re-entering through Browse/Details reported the existing membership and offered no second Add action for that trip.                                                                                                            |
| Public and privileged exposure stays denied     | Unit tests deny production, absent review runtime, non-loopback host, catalog-only mode and Owner/Representative/Admin projections. Browser tests deny privileged projections and send anonymous entry through sign-in. Macvicar preview exclusion is retained in source; real-store admission was not exercised. |
| Preserve visual baseline                        | Existing action/chooser styles reused. Desktop Chrome and Pixel 5 emulation captured Details/chooser in light/dark; action measured at least 48×48 CSS pixels, narrow chooser had no horizontal overflow. Inspected mobile light chooser and desktop dark Details captures.                                       |

## Verification and exact-source limits

| Layer                     | Result and source binding                                                                                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test-first                | Initial rendered App test failed because Add to Trip was absent. The minimal App composition change made it pass.                                                                                                                                                                                                          |
| Final focused Vitest      | `npx vitest run src/app/storeDetailsTrip.test.tsx --reporter=dot`: **10 passed**, final test contents identical to `2abaaaf7`.                                                                                                                                                                                             |
| Final browser             | Existing `npm run test:e2e:review -- e2e/ui07-trip-flows.spec.ts --grep 'Details Add to Trip connection' --project desktop --project mobile --output .codex/details-trip/browser-final`: **6 passed**, zero skips/failures, 31.1 seconds, clean `2abaaaf7`.                                                                |
| Repository check          | `npm run check` exited 0: type/lint/format, **1204 Vitest passes +1 skip**, **385 release passes +1 skip**, build and seed-media validation passed. This broader run preceded the final test-only amendment; App source is identical to the final candidate. Do not relabel its unit count as a freshly rerun final suite. |
| Final amended-test checks | Final focused tests, `npm run typecheck`, changed-file ESLint and Prettier passed. Runtime source is unchanged from `8331be4d`; the amendment strengthens cancellation proof and fixes test navigation assumptions.                                                                                                        |
| Impeccable detector       | One App scan returned `[]`. No CSS/design-token change. Reticle tools unavailable; rendered Playwright assertions and screenshots supply browser evidence.                                                                                                                                                                 |
| Independent review        | Spec and Standards independently cleared exact `2abaaaf79830fc806c6a878749e7a6f8d31e63f1`, with no actionable findings.                                                                                                                                                                                                    |

The repository check reported 16 existing ESLint warnings, an existing jsdom navigation diagnostic and two skipped cases; these are recorded rather than hidden. Browser setup reported Node color-environment warnings. Earlier browser runs failed on incorrect test selectors and an assumed More → My trips link; runtime behavior was not changed to accommodate those assumptions. The final selected suite passed after fixing those tests.

## Artifacts and resource release

Local artifacts remain ignored under `.codex/details-trip/`: `contract.md`, `unit.log`, `check.log`, `typecheck-final.log`, `browser-first.log`, `browser-second.log`, `browser-auth.log`, `browser-final.log`, and eight screenshots under `browser-final/`. SHA-256 hashes are retained in `artifact-hashes.json`. Screenshots are synthetic; no response bodies, real credentials or private account material were captured.

Resource lease: this chat, selected review runner, DEV fictional fixtures, loopback 4174; Node 24.11.1/npm 11.13.0, locked install completed. Final runner exited 0; no 4174 listener remained. The existing 4187 standalone mockup server was preserved. No database/container/provider lane was acquired.

## Unverified and handoff

No database/RLS/RPC, hosted account, canonical-production, actual-phone or human-outing acceptance was executed. The branch was subsequently pushed for draft PR #563 as recorded below; main integration remains pending. Current #507 release ownership/hold remains intact.

The existing More menu has no My trips entry; this bounded Details connection does not repair that separate navigation gap. Favorites/public Share and remaining connected-outing work remain under #560. Prepared Macvicar identity/name confirmation, real-store admission, first eligible server-side placement and exact-store media/benefit binding remain separate. No real store was renamed or substituted.

Re-run affected checks/review after relevant source, fixture or integration changes. Later evidence-only commits do not change the candidate above.

## Publication and CI assertion correction

The implementation is published as [draft PR #563](https://github.com/samarquis/AntiqueTrail/pull/563), closing only [#562](https://github.com/samarquis/AntiqueTrail/issues/562) after reviewed integration. The accepted standalone mockup is separately available at `3b403f08cf44cb18bf245f1421684372ae556dce`. Publication is not main merge or website deployment.

Hosted web CI at `6d8e96feff77c6935141242e0069647da87d4dd1` reported **685 passed, 95 skipped, 2 failed**. Both failures were the same existing Store Details assertion in desktop/mobile: it forbade Add to Trip under the default DEV loopback review configuration. The approved contract now permits that action there. Database and configured-owner-billing CI passed; Supabase Preview was skipped.

Test-only candidate `b4330f0dd6c2f27a25964d0941f028d78023ce99` replaces the blanket absence assertion with visible Add to Trip and separate private-memory absence. Runtime and exposure/authorization gates are unchanged. No test was skipped to repair the failure.

- Full affected default-config Store Details suite: **29 passed, 1 existing mobile screenshot skip**, 1.4 minutes; assertions matched the candidate, with a subsequent formatting-only change before commit. Generated screenshots were retained under `.codex/implementation-tickets/ci-correction-screenshots/`; historical tracked screenshots were restored.
- Clean committed candidate rerun: `npx playwright test e2e/store-details.spec.ts --grep "complete visit decision hierarchy" --workers=1`: **2 passed**, no skips/failures, 11.5 seconds.
- Changed-file ESLint passed; Prettier formatting applied. Independent Spec and Standards review cleared exact `b4330f0dd6c2f27a25964d0941f028d78023ce99` with no findings.
- Focused App exposure/denial suite at the committed source/test candidate: **10 passed**, no skips/failures, 7.05 seconds.

Previously published head `30be3e6677b7c365cf25e473e3809571011969f4` passed required hosted `web`, `database` and `configured-owner-billing` checks; optional Supabase Preview was skipped ([CI run](https://github.com/samarquis/AntiqueTrail/actions/runs/37677092349)). That run verifies the source candidate only; it does not claim hosted account/provider, production or human acceptance.
