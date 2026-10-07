# Free private evaluation packet

Current acceptance follows the [complete outing milestone](../../../PRD.md#next-milestone-one-complete-shopping-outing): two shoppers favorite/share a public store, open it anonymously, sign in and Add to Trip, add an unlisted stop, review driving/hours suggestions, navigate, and recover private memories after a later visit. Include basic owner listing/hours/approved-photo/update maintenance and exact-store denial. Observe computer and phone use with actual human feedback.

The existing runner below is a reusable historical fixture packet. It does not yet prove every connected step; unsupported steps remain unverified. The [store-first showcase handoff](STORE_FIRST_HANDOFF.md) is historical supporting material, not the current milestone.

This packet implements the repository-controlled preparation for issue #251. It is a
local, synthetic evaluation of the current review harness, not a hosted test and not
owner, provider, server-authorization, cohort, release, or paid-activation evidence.

## Run

### First couple's outing

The [2026-10-06 readiness rehearsal](../../evidence/shopper-first-scope/outing-readiness.md) found that the connected outing is **not ready for real use**. Existing fixture tests pass but bypass the missing Store Details-to-trip connection. Use the sequence below as acceptance after the gaps are fixed and the environment is admitted; it is not an instruction to enable the current public site's private features.

Choose two or three stores and one unlisted shop. Each person uses their own account. Start on a computer, repeat the important steps on an actual phone, then take the outing:

1. Your wife finds and favorites a store, then shares its public link using her normal messaging app. The link contains no private notes or trip information.
2. You open that link signed out. Choose Add to Trip, sign in, and confirm the same store is still selected. Add it to a new dated trip; add a second store to that trip without creating a duplicate.
3. Add the unlisted shop with its name, confirmed address, optional source link/hours and browsing time. It stays private and creates no public listing.
4. Set departure/start location. Review an order based on driving and known opening hours, then adjust the order yourself. Unknown hours and service failure must be understandable; a manual-only fallback does not prove routing works.
5. At the outing, open navigation for each intended address and mark visited/skipped. Confirm the external map destination before driving. Use ordinary maps if the app is unclear; record where the app failed.
6. Record “Found a brass item,” a rating and whether you would return. Close and reopen the app in a later session. Find that memory, record another visit and confirm the original remains. Repeat for the unlisted stop; your wife's account must not expose your private notes.
7. Each of you records where help was needed, what felt unnecessary, and whether you would use this instead of your current text-message/Maps process. Choose continue, revise or stop and explain why.

Keep a separate short owner walkthrough: an admitted owner confirms their store, changes hours, submits a rights-approved photo, and adds a simple store update; observe the correct direct/reviewed result and denial for another store. Do not require a purchase, team setup, analytics or an artificial support request.

Record: stores/date, device/browser, step attempted, expected/actual result, assistance needed, and continue/revise/stop. Leave observations blank until you actually try them. Test privacy/accessibility/data-loss failures before accepting the affected step. The agent does not send messages to your wife or stores as part of this packet.

### Existing local fixture runner

From the repository root, run:

```text
node scripts/free-private-evaluation.mjs --mode local --output artifacts/free-private-evaluation
```

The command chooses an unused loopback port starting at `42180`, writes a temporary
Playwright configuration and raw browser result under the output directory, and always
writes `report.json`. A failed browser assertion is retained in the report and returns a
non-zero exit code. Unavailable human/server/provider evidence is retained and makes the
local packet incomplete rather than a false pass.

The report records the exact source SHA, fixture identity, mode, port, config, browser
observations, failures, and unavailable evidence. `report.schema.json` describes the
machine-readable shape; the runner validates the safety-critical fields before writing.

## Scenario boundary

`scenarios.json` is the source for the five simulated personas. The priority shopper
journey is Browse -> Details -> permitted photos -> Save -> Add/new trip -> manual date,
order, dwell, and priority. Returning, account-switch, cancellation, and offline
interruption cases are separate. Partner/Navigator uses only the current one-trip
invitation and Go fixture entry points; the local Shopper B fixture is not presented as a
real partner account or a successful cross-account server path.

Every persona declares its approved role, local fixture identity, device order, explicit
accessibility variation, and digital-confidence variation. No age field is used as an
ability proxy. Persona reactions are hypotheses only and never populate the owner packet.

## Owner computer-then-phone packet

The runner creates blank `ownerPacket.computer` and `ownerPacket.phone` fields. The owner
selects the actual browser and phone platform during setup, uses the computer first and
phone second, and records separate observations for interruption, hesitation, usefulness,
readability/presentation, ease, flow, enjoyment, memorable elements, and return intent.
The owner chooses `continue`, `revise`, or `stop` with reasons. Blank fields are expected
before firsthand use; the local runner must not infer them from simulated results.

Security, privacy, and data-loss failures remain visible and cannot be overridden by an
enjoyment score. The final disposition applies only to this evaluation and its next
bounded decision. It does not pass Internal Alpha, external testing, public release, or
paid activation.

## Evidence classes

| Class                  | Local packet meaning                                            | What it cannot prove                                                                  |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `fixture_browser`      | Behavior observed in the fictional local review harness         | Real backend authorization, account isolation, provider behavior, or human usefulness |
| `human_firsthand`      | Blank fields for the owner's actual computer/phone observations | Simulated persona reactions                                                           |
| `server_authorization` | Explicitly unavailable in this local run                        | RLS/RPC/server-boundary acceptance                                                    |
| `provider`             | Explicitly excluded                                             | Real email, mapping, media, payment, or other provider acceptance                     |
| `cohort_or_release`    | Explicitly excluded                                             | Cohort demand, launch, or activation readiness                                        |

No hosted resource, real account, real imagery, external participant, spending, or
replacement backend is created by this packet.
