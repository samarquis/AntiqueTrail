# Issue #325 focused human accessibility worksheet

## Purpose and boundary

This worksheet records the bounded human evidence requested by GitHub issue
[#325](https://github.com/samarquis/AntiqueTrail/issues/325). It is for one
named operator using an actual device, browser, and (where used) assistive
technology against the local synthetic review build. It is **not** a public
release accessibility claim, the PRD's eight-person human-usability cohort, a
provider/backend test, or permission to recruit participants, deploy, spend,
or use real data.

The operator must complete the blank observation fields themselves. Do not
replace observations with DOM, screenshot, browser-automation, or persona
results. Automated checks may be attached as preparation only.

## Candidate and operator record

Record this before starting. A result applies only to this exact source and
local fixture configuration; do not carry it forward to a changed candidate
without a documented retest.

| Field | Operator entry |
| --- | --- |
| Date and local time | |
| Operator name or stable participant identifier | |
| Operator role (operator only; not a release-cohort claim) | |
| Source SHA from `git rev-parse HEAD` | |
| Branch/ref | |
| Node version | |
| Review-build command and loopback origin | |
| Device make/model and OS version | |
| Browser and version | |
| AT, input, zoom/text-size, display, or motor adaptation and version | |
| Fixture identity/data confirmation | Synthetic local review harness only; no real account or store data |
| Interrupted, unavailable, or untested combinations (with reason) | |

## Local setup

From a checkout at the recorded SHA, start an isolated fixture-only review
build. The port below is intentionally outside the earlier persona-review
ports; change it only if already occupied and record the actual origin above.

```powershell
$env:VITE_REVIEW_HARNESS='true'
npm run dev:review -- --host 127.0.0.1 --port 43225
```

Wait for the browser page itself to render its named H1 or control before
recording an observation. Do not treat an initial loading frame as the result.
Use the same fresh browser profile for a single run, except where a fresh
profile is specifically needed to recover a stuck state. The synthetic
identities and data reset when the local review build reloads; that reset is a
harness property, not a production-session result.

## Recording rule

For every row, record the exact action, what the operator actually heard or
felt/saw, result (`pass`, `fail`, `partial`, or `unavailable`), and a short
reason. `Pass` means the stated bounded observation occurred for the recorded
combination, not that all users, ATs, or release requirements pass. Record
unexpected activation, lost context, unclear consequences, obscured controls,
and recovery behavior even when the row otherwise passes.

| ID | Route and action | What the operator must assess | Result and firsthand observation |
| --- | --- | --- | --- |
| HAT-01 | `http://127.0.0.1:43225/stores?reviewAs=anonymous&reviewState=success`; open **Blue Finch Curios**, then use browser Back | Reading order and the route-change announcement/focus: does the new page begin at a useful H1/main landmark, and does return preserve understandable context? | |
| HAT-02 | `/stores/blue-finch-curios?reviewAs=anonymous&reviewState=success`; select a gallery image, activate **Enlarge image**, then **Close enlarged image** or Escape | Spoken/visible photo identity, dialog entry, dialog reading order, and focus returning to the same opener. Note whether image alternative text conveys useful fictional image content. | |
| HAT-03 | On the same detail page choose **Sign in to save store**, deliberately submit the sign-in form empty or invalid, then choose **Cancel and return without saving** | Error-summary/field reading order, error association, cancellation consequence, no accidental save, and return focus/context. | |
| HAT-04 | Representative: `/store-portal/changes?reviewAs=representative&reviewState=success`; submit a fictional address-change request. Administrator: `/admin/access?reviewAs=administrator&reviewState=success`; preview revoke, record the consequence, then either complete **Confirm revoke Blue Finch Curios scope** or leave it unconfirmed and record the cancel/Back route | Phone operation of one representative and one administrator confirmation/cancel path using fictional data. Record which branch was used, any accidental action, and whether consequences/next recovery action were clear. | |
| HAT-05 | Repeat HAT-02 and HAT-04 at 200% browser zoom or the actual device's equivalent text-size setting, including any relevant motor or low-vision adaptation | No required control is obscured, clipped, unreachable, or ambiguous. Record viewport/device size and exact zoom/text-size. | |

## Deferred historical coverage

The following rows were retained from the earlier worksheet as historical
findings and future preparation. They are not current #325 acceptance tasks
under the adopted store-first internal-showcase scope, and their absence of a
result must not block this documentation packet:

| Historical area | Preserved routes/actions | Current disposition |
| --- | --- | --- |
| Private memory | `/stores/blue-finch-curios/memory?reviewAs=shopper-a&reviewState=success`; Delete, Keep, Undo | Deferred private visit-history feature |
| Offline save | `/saved?reviewAs=shopper-a&reviewState=success`; offline Save/private change and reconnect | Deferred offline feature |
| Trip conflict | `/trips/trip-a/plan?reviewAs=shopper-a&reviewState=success`; queue/replay/resolve | Deferred trip planning feature |
| Navigator | `/trips/trip-a/go?reviewAs=shopper-a&reviewState=success`; Start, Skip/Undo, Arrived, Done | Deferred Go/offline navigation feature |

Do not record synthetic persona output as human evidence for these historical
areas. If a later approved scope selects one, copy its exact route and actions
into a refreshed candidate-bound worksheet and obtain the required firsthand
observations then.

## Failure and retest record

Create one entry per independently reproducible failure. A fail is not a
product-plan amendment; route it to a scoped conforming repair issue with these
facts. Retest only against a recorded new source SHA.

| Failure ID | Candidate SHA | Device/browser/AT | Exact route and steps | Expected bounded behavior | Actual firsthand result | Screenshot/video/log reference (optional; no sensitive data) | Repair issue/PR | Retest SHA and result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |

## Completion statement for the operator

Complete this only after all rows have a result or an explicit unavailable
reason. Paste the operator's own words; do not have an agent synthesize a
quote.

> I performed the rows marked above on the recorded candidate and device/AT
> combination. My overall accessibility observations, unresolved concerns, and
> any unavailable combinations are: _[operator entry]_.

Operator/identifier: ____________________  Date: ____________________

## Gate disposition

The issue may close only after this completed worksheet names the actual
operator and candidate, contains firsthand results for the issue's required
rows (or truthful unavailable combinations), and links any reproduced failures
and retests. It must still state that the scope does **not** establish full
public-release accessibility or satisfy PRD.md `Human usability acceptance`.

Until then, issue #325 remains open and labeled as a human gate. This prepared
worksheet and any automated preparation evidence do not satisfy its acceptance
on their own.

## Preparation checks (not human evidence)

These current review-harness checks can confirm that the named local routes and
controls are available before the operator begins. They do not prove spoken
announcements, physical touch, low-vision perception, or human recovery.

```powershell
npx playwright test e2e/store-details.spec.ts e2e/ui05-auth-shopper.spec.ts e2e/ui08-partner-portal.spec.ts e2e/ui09-admin-moderation.spec.ts --config playwright.review.config.ts
```

The runner owns its own review server on port 4174. Do not run it against the
manual port 43225 or substitute its pass result for the completed worksheet.
