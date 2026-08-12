# UI-08 partner onboarding and Store Portal review — spec

This contract exercises issue #38 in the review harness. The sole authorized
identity is `reviewAs=representative`; its exact scope is **Blue Finch Curios**.
All other review identities fail closed before partner or portal data is returned.

## Routes

| Route                                                                               | Review assertion                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/partner/join?...#token=review-partner-invite`                                     | Invitation exchange and consent disclosure                      |
| `/partner/verify`                                                                   | E-01 honest email-provider gate                                 |
| `/partner/status`, `/partner/draft`, `/partner/claim`                               | Approval, draft, and exact-scope claim lifecycle                |
| `/store-portal`, `/hours`, `/changes`, `/updates`, `/links`, `/support`, `/preview` | Scoped maintenance reads/writes, validation, and public preview |

## Fixture and gates

Success seeds Blue Finch's approved representative status, an overdue-hours
notice, one pending controlled address change, one text update, one official
link, and one support ticket. Writes update this fixture only. `empty` returns
pre-onboarding / empty lists; `loading` remains unresolved; `error`, `blocked`,
and `permission-denied` reject with the safe generic UI error.

E-01 (`bindIdentity`) always returns the published email-provider gate copy.
M-01 returns media capability disabled and rejects upload; neither flow invents
a receipt or verified identity.

## Automation and evidence

`e2e/ui08-partner-portal.spec.ts` runs serially over desktop, tablet, and mobile
and asserts role denial, invitation/consent, E-01, status/draft/claim mutation,
portal mutations, M-01, state honesty, keyboard focus, H1 focus, 48×48 targets,
and 320px reflow. Set `CAPTURE_UI08_EVIDENCE=true` to write the screenshots
described in the README.
