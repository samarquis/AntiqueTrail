# Store Owner authority

**Status:** Product Owner decision contract for issue #429. This file owns the Store Owner and store-team authority matrix. [PRD stage dependencies](../../PRD.md#stage-dependencies) own when the workflow is available; [product capabilities](product-capabilities.md) own capability behavior; [DESIGN](../../DESIGN.md) owns interactions; [SECURITY_AND_TRUST](../../SECURITY_AND_TRUST.md) owns assurance and privacy; [PACKAGE_CONTRACTS](../../PACKAGE_CONTRACTS.md) owns implementation contracts.

## Stage and test boundary

The complete Store Owner workflow is available in the current isolated internal test experience. Test it end to end with synthetic identities, stores, reviews, analytics, and billing fixtures. Store claim review, membership, listing edits, analytics, promotions, review responses, and read-only billing must be present in the workflow; these are not deferred placeholders during internal testing.

This does not expand the public test. The public test remains anonymous catalog browsing and its existing approved saved-store behavior. Internal Owner tests do not admit real external Owners or real-store data, publish promotions or review responses to the public, charge money, mutate subscriptions, or activate providers. External use and public capability exposure require their existing readiness, consent, release, commercial, and provider gates.

## Eligible claims

- Initial eligibility is an antique or vintage store in Topeka with recurring public hours. A multi-location business uses the support path.
- A legal owner or manager with documented authority may claim a store.
- Require verified email, MFA, documented authority evidence, and Site Admin approval before granting access.
- Claimant may propose a store-boundary correction. Site Admin verifies or corrects the boundary before approval.
- A person may own multiple eligible stores. Each grant is independently scoped to one store; access to one store never implies access to another.
- A store may have more than one Co-Owner. Any existing Co-Owner may invite another Co-Owner directly.

## Roles and authority

| Actor | Authority |
|---|---|
| Site Admin | Approves claims; confirms/corrects boundaries; may revoke the primary Store Owner claim per store or across that Owner's stores; may remove team access; retains listing/photo approval and review moderation. Site Admin console authority is never delegated. |
| Store Owner | Manages each approved store; invites and removes team members for that store; assigns Co-Owner or Full Store Access; cancels any pending invitation; uses the store tools below. Cannot grant Site Admin or revoke their own primary Owner claim. |
| Co-Owner | Store-scoped Owner-level access; may invite another Co-Owner and other permitted teammates; may cancel any pending invitation. Cannot grant Site Admin or revoke the primary Store Owner claim. |
| Full Store Access | Uses the full store workspace, including analytics and promotion tools; may invite Listing Editors only and may cancel their own pending invitations. Cannot grant Full Store Access or Co-Owner. |
| Listing Editor | Retains current Representative-style listing editing access. No billing visibility, analytics, promotions, review responses, or authority changes. |

Owners and Co-Owners may invite multiple teammates per store. Team invitations become active only after acceptance, verified email, and MFA; no separate Site Admin approval is needed. Each inviter may cancel their own pending invitation; Store Owners and Co-Owners may cancel any pending invitation.

The Store Owner may remove active team access, including a Co-Owner's store-team grant. Removing the last Co-Owner does not automatically remove other team members; their grants remain until the Store Owner or Site Admin removes them. No team actor may revoke the primary Store Owner claim; that action belongs to Site Admin.

## Store tools and limits

- Store Owner and Full Store Access include analytics and promotional tools with no paid-plan gate in the internal test workflow. Test actions operate only on isolated synthetic data and cause no external publication or spending.
- Store Owner and Co-Owner can reply to public-review fixtures in the internal test workflow. Site Admin retains moderation. An Owner cannot alter ratings, aggregate rankings, moderation state, or shopper-private data. Public review enablement and public Owner replies remain behind the public release gate.
- Billing status is visible and read-only to Store Owner, Co-Owner, and Full Store Access. Listing Editors do not see billing. No payment, subscription, or paid-plan mutation is enabled by this decision.
- Sensitive listing facts and photos require Site Admin approval before publication. Other listing edits follow their current publishing rules.
- Existing Store Representative grants and permissions remain unchanged alongside Store Owner and team access.
- Owners and teammates never receive shopper-private ratings, notes, trips, identity details, or activity data.

## Revocation and enforcement

- Site Admin may revoke the primary Store Owner claim for one store or all stores owned by that person.
- Removing one store grant does not grant, remove, or alter access to another store.
- Team invitations and active team grants remain separately revocable. Store Owner or Site Admin can remove active team access; a Store Owner cannot revoke their own primary claim.
- Every read and mutation is authorized server-side against the authenticated user, current assurance state, and exact store grant. Revoked access is denied on the next request and audited. Client-selected role, owner, store, or stage values are never authority.
- Claim, invite, acceptance, cancellation, role change, removal, approval, and revocation events are auditable without exposing private shopper data.

## Downstream contract

Issue #422 consumes claim, scope, MFA, approval, and primary-Owner revocation rules. #424 consumes invitation, role, team-removal, and last-Co-Owner rules. #425 consumes billing visibility and read-only behavior. #426 remains blocked on a separately approved paid-servicing action and provider/consent gates. None of these issues authorizes public rollout or paid activation by itself.
