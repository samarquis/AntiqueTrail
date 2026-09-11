## Problem

At main f182871d9de0d5db2a30ad0de9ac8dc72467648b, revoke_trip_invitation in supabase/migrations/20260818300000_trip_command_completion.sql changes only pending invitations. leave_trip permits the partner to leave and explicitly denies the creator. The inspected trip command/client inventory contains no creator-removes-accepted-partner command. PR #334's diagnostic eventually expects that removal capability. This is a source-confirmed contract gap, not evidence of a newly reproduced production exploit.

## Plan

[PRD.md — Purpose, people, and product promise](https://github.com/samarquis/AntiqueTrail/blob/main/PRD.md#purpose-people-and-product-promise), [The connected shopper experience](https://github.com/samarquis/AntiqueTrail/blob/main/PRD.md#the-connected-shopper-experience), and `One-trip roles and invitation`; DESIGN.md — `Shared-trip handoff`; SECURITY_AND_TRUST.md — `Privacy by default` and `Session storage and next-request revocation`. Child finding of #321. This preserves existing intent. Parked without a ready label during store-first scope review; no implementation is started. Independent of diagnosing invitation acceptance because tests can prepare an accepted-member fixture.

## Outcome

Provide one server-authorized creator removal of the accepted partner from exactly one trip. Own a forward-only migration and focused database tests. Browser UI and the full #321 suite are separate work. Publish the exact command contract for the UI child.

## Acceptance

- [ ] The authenticated creator can remove the active partner of the selected trip; the partner, unrelated user and stale/replayed attempt cannot change any other membership or grant authority.
- [ ] The removed partner's next protected read/write is denied; remaining creator access and unrelated trips/private data are unchanged.
- [ ] The same atomic transition revokes the departing partner's applicable offline/device authority and pauses Go for a departing Navigator until reassignment, as required by the existing trip contract.

## Verification

Use a clean local database, real authenticated allow/deny commands and accepted-member fixtures; assert membership and applicable offline/Navigator state independently. Run focused pgTAP plus required database/security/hosted checks and independent exact-source review. SQL tests prove this server outcome; browser usability and offline client purge remain separate acceptance. Do not weaken existing authorization or edit historical migrations. This is sensitive boundary work, not a low-risk starter ticket.
