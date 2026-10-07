# Store Owner authority

Current target: approved 2026-10-06 shopper-first scope. [PRD](../../PRD.md) owns stage and product scope; this document owns authority. Existing runtime roles/grants are not migrated by this plan.

## Stage and test boundary

Prove guided setup, exact-store listing management and Site Admin review. Complete synthetic teams, analytics, promotion, public-review replies and custom billing are no longer acceptance prerequisites. Existing public-test restrictions, synthetic-data admission and teardown rules remain. No real owner/account, payment or provider activation follows from this amendment.

## Eligible claims

- Retain initial Topeka antique/vintage-store eligibility and recurring public hours; multi-location boundary questions use support.
- One responsible owner/authorized manager per store in the first new journey; require owner-controlled verified email, MFA, authority evidence and Site Admin approval.
- Search existing listings before adding a draft. An application alone grants no listing mutation or publication authority.
- Each grant is exact-store. A person may retain independent grants to more than one store; no grant confers access to another.

## Roles and authority

| Actor | Target authority |
|---|---|
| Anonymous visitor | Public store browsing and public store links; no private records |
| Shopper | Own favorites, trips, private stops, ratings and notes |
| Store Owner | Manage approved store details/hours, photos, simple updates and official links; view own application/change status and permitted support/billing status |
| Site Admin | Verify/approve claims and controlled listing/media changes; grant/revoke exact-store access; operate support and audit within scope |

Store Owner is scoped permission on an authenticated identity. Owners cannot grant Site Admin, self-approve a claim/photo, access shopper-private content or edit another store. Site Admin has no routine shopper-private access. Shared credentials are prohibited; separate accounts are used for independent security-test actors.

## Store tools and limits

Retain direct versus reviewed fields and media controls from [DESIGN](../../DESIGN.md#publishing-labels-and-hours). Photo capacity is independent of authority. A payment never approves a listing, role or image. Teams, Co-Owner/Full Store Access/Listing Editor assignment, analytics, promotions and public review replies are deferred for the new milestone. A useful owner listing does not require those tools even in local synthetic acceptance.

## Revocation and enforcement

Site Admin grants/revokes the primary exact-store permission after verified authority and assurance. Every read/mutation checks identity, current grant, store and assurance server-side. Revoked scope is denied on the next request, including open sessions; operations are audited without shopper-private data. Never infer authority from client-supplied role/store values. Regrant must not restore broader permissions.

## Existing roles and compatibility

The [pre-cleanup authority contract](https://github.com/samarquis/AntiqueTrail/blob/d075998137c501c6ff7252880ad59500e59bec16/docs/specs/store-owner-authority.md) records existing Representative, Owner, Co-Owner, Full Store Access and Listing Editor behavior. Preserve real grants, invitations, revocation, retention and billing obligations until their existence and migration needs are verified. Deferral is not permission to drop safeguards, delete grants or broaden access. New team implementation is not a dependency of the first outing.

## Downstream contract

Before an implementation leaf is READY, pin the adapter/schema mapping from target roles to existing grants, owned interfaces and negative tests. Existing issue receipts are evidence for their original scope only. [Paid servicing](store-owner-paid-servicing.md) retains its bounded historical cancellation contract; no live billing is enabled.
