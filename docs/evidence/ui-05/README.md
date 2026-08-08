# UI-05 authentication and private-shopper review

This evidence is generated from the local-only review build. It uses synthetic in-memory identities and data; no password, access token, provider call, or production record is present.

## Start the review build

```powershell
$env:VITE_REVIEW_HARNESS='true'
npm run dev:review -- --host 127.0.0.1 --port 4174
```

Open the URLs below in order. Each URL is deterministic and may be reopened directly.

## Ordered Product Owner review

1. [Review index](http://127.0.0.1:4174/review?reviewAs=shopper-a&reviewState=success) — confirm the banner identifies Shopper A, review paths are ordered, and no credentials are shown.
2. [Create an account](http://127.0.0.1:4174/auth/register?returnTo=%2Fsaved&reviewAs=anonymous&reviewState=success) — submit once empty, then use a fictional email, a 12+ character password, and the 18+ confirmation. Confirm the verification page says no private action was saved.
3. [Sign in](http://127.0.0.1:4174/auth/sign-in?returnTo=%2Fsaved&reviewAs=shopper-a&reviewState=success) — use `shopper-a@local.invalid` and any non-empty synthetic password. For MFA, use `mfa@local.invalid`, then code `123456`. These strings work only in the local review build.
4. [Recovery](http://127.0.0.1:4174/auth/recovery?reviewAs=anonymous&reviewState=success) — submit any fictional email and confirm the response does not disclose whether an account exists.
5. [Expired session](http://127.0.0.1:4174/saved?reviewAs=shopper-a&reviewState=success&reviewSession=expired) and [revoked session](http://127.0.0.1:4174/saved?reviewAs=shopper-a&reviewState=success&reviewSession=revoked) — confirm both hide saved content and return to sign-in.
6. [Shopper A saved stores](http://127.0.0.1:4174/saved?reviewAs=shopper-a&reviewState=success) — only Blue Finch Curios appears. Confirm its card honestly identifies the private record source, links unknown area/category/hours/freshness to store details, and uses a labeled placeholder instead of inventing a photo. Remove it with Space and use the offered Undo.
7. [Shopper B saved stores](http://127.0.0.1:4174/saved?reviewAs=shopper-b&reviewState=success) — only Cedar & Brass appears with the same provenance treatment; no Shopper A data appears.
8. [Shopper A New Since](http://127.0.0.1:4174/new-since?reviewAs=shopper-a&reviewState=success) — choose Topeka and confirm Blue Finch Curios, area, added date, catalog-change provenance, Dismiss, and Mark as seen.
9. [Shopper B New Since](http://127.0.0.1:4174/new-since?reviewAs=shopper-b&reviewState=success) — choose Topeka and confirm Cedar & Brass replaces Shopper A's result.
10. [Shopper A private memory](http://127.0.0.1:4174/stores/blue-finch-curios/memory?reviewAs=shopper-a&reviewState=success) — edit all fields and save. Open delete confirmation and confirm the safe **Keep memory** action appears first, receives focus, and uses a neutral outline treatment while **Yes, delete memory** is clearly rust/destructive. Choose **Keep memory** and confirm focus returns to **Delete memory**. Then delete and Undo. Turn the browser offline and confirm data stays visible while writes pause.
11. [Shopper A correction](http://127.0.0.1:4174/stores/blue-finch-curios/correction?reviewAs=shopper-a&reviewState=success) and [status](http://127.0.0.1:4174/corrections/correction-a?reviewAs=shopper-a&reviewState=success) — submit a correction, follow its status link, and confirm status is reason-neutral.
12. [Shopper B denial check](http://127.0.0.1:4174/corrections/correction-a?reviewAs=shopper-b&reviewState=permission-denied) — confirm no status or Shopper A detail is exposed.
13. [Account controls](http://127.0.0.1:4174/account?reviewAs=shopper-a&reviewState=success) and [Privacy](http://127.0.0.1:4174/account/privacy?reviewAs=shopper-a&reviewState=success) — review sign-out, Export, Delete, History, inactivity, and privacy copy.
14. [Export](http://127.0.0.1:4174/account/export?reviewAs=shopper-a&reviewState=success) — reauthenticate with Shopper A, request an export, and confirm the ready state exposes no access token.
15. [Delete account](http://127.0.0.1:4174/account/delete?reviewAs=shopper-a&reviewState=success) — reauthenticate, confirm the consequence checkbox, schedule deletion, confirm only cancellation/recovery/sign-out remain, then cancel and verify Saved is available again.
16. Repeat a relevant path with `reviewState=loading`, `empty`, `error`, `blocked`, and `permission-denied` using the review index state links.

## Acceptance matrix

| Contract                                   | Deterministic evidence            | Automated check                                                     |
| ------------------------------------------ | --------------------------------- | ------------------------------------------------------------------- |
| Registration, sign-in, MFA, recovery       | Steps 2–4                         | real-form Playwright interactions plus auth unit tests              |
| Expiry and revocation                      | Step 5                            | direct-address session-state test and fail-closed Playwright check  |
| Shopper A/B saved isolation                | Steps 6–7                         | `Shopper A and Shopper B receive distinct Saved and New Since data` |
| New Since account isolation                | Steps 8–9                         | same Playwright contract plus fixture-client unit tests             |
| Memory and correction                      | Steps 10–12                       | save/delete/Undo/submit/status/denial Playwright contract           |
| Export and destructive account lifecycle   | Steps 13–15                       | reauth/export/schedule/cancellation/restoration Playwright contract |
| Loading/empty/error/blocked/denied/success | Step 16                           | UI-05 state test and review-harness state contract                  |
| Keyboard and H1 focus                      | all routes                        | focused-H1 assertions and keyboard harness test                     |
| 200% reflow / 320 CSS px                   | steps 2, 6, 8, 10–13              | exact scroll/client width equality with a forced scrollbar          |
| Minimum 48 × 48 px targets                 | steps 2, 6, 8, 10–13              | rendered target or associated-label hit-area geometry scan          |
| Fixed mobile navigation                    | steps 2, 6, 8, 10–13              | computed fixed/bottom geometry before and after document scroll     |
| Trustworthy private store cards            | steps 6–9                         | card content/provenance assertions and responsive PNG evidence      |
| Destructive confirmation focus             | step 10                           | first-control focus and cancel-to-trigger restoration assertions    |
| Local-only, secret-free harness            | review build and production build | harness activation and production-bundle tests                      |

## Reproduce automated evidence

```powershell
npm run test:e2e:review
$env:CAPTURE_UI05_EVIDENCE='true'
npx playwright test e2e/ui05-auth-shopper.spec.ts --config playwright.review.config.ts --grep "captures ordered"
Remove-Item Env:CAPTURE_UI05_EVIDENCE
```

The capture command writes 73 PNGs: 24 desktop, 24 tablet, and 25 mobile. It includes standalone sign-in, recovery, and MFA screens plus success, empty, loading, error, blocked, permission-denied, offline, destructive confirmation, submitted, expired-session, export-ready, scheduled-deletion, and cancelled-deletion states. The mobile set also includes a true 320 CSS-pixel reflow capture.
