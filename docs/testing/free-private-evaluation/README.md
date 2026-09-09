# Free private evaluation packet

This packet implements the repository-controlled preparation for issue #251. It is a
local, synthetic evaluation of the current review harness, not a hosted test and not
owner, provider, server-authorization, cohort, release, or paid-activation evidence.

## Run

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
