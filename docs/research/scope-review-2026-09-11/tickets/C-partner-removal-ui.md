## Problem

At main f182871d9de0d5db2a30ad0de9ac8dc72467648b, src/features/trips/components.tsx offers Revoke invitation only for pending invitations. TripClient/types and the collaboration UI provide no accepted-partner removal for the creator. The existing #321 diagnostic waits for a Remove partner control that is not implemented.

## Plan

[PRD.md — Purpose, people, and product promise](https://github.com/samarquis/AntiqueTrail/blob/main/PRD.md#purpose-people-and-product-promise), [The connected shopper experience](https://github.com/samarquis/AntiqueTrail/blob/main/PRD.md#the-connected-shopper-experience), and `One-trip roles and invitation`; DESIGN.md — `Shared-trip handoff`; SECURITY_AND_TRUST.md — `Session storage and next-request revocation`. Child of #321. Depends on #343's creator-removal server contract being merged. Parked without a ready label during scope review. No product/design amendment is implied.

## Outcome

Connect the creator's accepted-partner removal action to the approved server command and return the collaboration screen to truthful state. Own the narrow TripClient/API method, collaboration component and focused tests. Do not rebuild invitation acceptance or the complete diagnostic infrastructure.

## Acceptance

- [ ] On a trip with an accepted partner, the creator can invoke the server-authorized removal through the existing interaction conventions; other roles cannot gain removal authority through the UI.
- [ ] Successful removal updates membership/Navigator feedback; cancellation or a denied/failed request preserves the last authoritative state and exposes actionable existing error feedback.
- [ ] The transition is usable with keyboard and at desktop/phone widths, with focus returned appropriately; a subsequent removed-partner request is denied through normal configured transport.

## Verification

Run focused trip client/component tests and a targeted browser transition using the merged server contract, plus applicable application and hosted checks. Reuse existing configured fixtures for an accepted member; no need to make the separate broken invitation acceptance pass to prepare that fixture. Include exact-source independent review because the code changes a membership boundary. Joined invitation-to-removal proof remains owned by #321; creating this child does not satisfy it.
