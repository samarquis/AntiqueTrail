# Security, Privacy, Trust, and Operations

Security is a product requirement and a launch gate. Target scope follows the 2026-10-06 [PRD](PRD.md); existing deployment/data protections are not waived. Deferred public-review/team/offline clauses below protect retained reachable behavior only, not new milestone requirements.

## Security objectives

- Prevent unauthorized access to private user data
- Prevent store owners from accessing shopper-private data
- Prevent clients from bypassing authorization
- Protect uploaded images
- Protect administrative functions
- Minimize precise location collection
- Maintain recoverability and auditability

## Data classification

### Public

- Approved store details
- Approved public reviews (after review feature is enabled)
- Official store profile photos with rights provenance and alt text
- Aggregate public rating
- Approved native Store Updates
- Validated official social profile links

### Private to user

- Personal ratings and notes
- Saved stores
- Trip history
- Favorite stores
- Location-derived itinerary details

Private rows are readable and writable only by their owning account. Store Representatives and Administrators never see shopper-private data by default.

### One-trip shared

The first scope shares public store links only, with no private trip/note/rating/account/location fields. Existing partner records retain their original one-trip access and revocation controls until separately reviewed migration. Sharing a store never grants access to those records; private memories remain author-only.

### Sensitive operational data

- Business verification evidence
- Audit logs
- Administrative actions
- Pending Store Updates, Store Change Requests, quarantined media, support diagnostics

## Authentication

- Use Supabase Auth (email/password plus approved social providers).
- Store Representatives and Administrators require verified email, TOTP MFA, and exact-scope grants.
- Shopper MFA is optional.
- Access tokens stay in memory; the refresh session uses a dedicated IndexedDB adapter. Logout and account switch clear it.
- Password recovery and account deletion revoke all sessions.
- Administrator and Representative privileged mutations may require recent authentication (password plus MFA within 10 minutes).

## Authorization

- Server-enforced through RLS, grants, and RPC/Function checks. Clients can never choose their role, owner, or scope.
- Every private table has RLS with no direct `anon` grants except approved RPCs.
- Commands recheck authenticated identity, active grants, resource scope, and current version.
- Store Representatives are scoped to one exact store. Administrators have no default access to shopper-private activity.
- Revocation takes effect on the next server request, including from an already-open session.

## Privacy by default

- Browse works without an account or device-location permission.
- Device location is requested only after an explicit in-use action (nearby search or trip start/routing); manual location remains usable after denial. No background tracking or anonymous behavioral profiling. Necessary minimized security/rate-limit logs are not a promise of zero infrastructure logging.
- An optional account starting address is private to its authenticated owner and used for a trip only by explicit choice. Never infer or automatically apply a Home location; no background or continuous location or raw movement history.
- Owner export includes the current starting address. Clearing it or deleting the account leaves no stale private address or address-derived retry data; stores cannot access it.
- Precise coordinates never enter analytics, application logs, email, or support records.
- Private saves, trips, ratings, and notes stay private until the approved account-lifecycle rules apply.
- Public reviews publish only rating, allowed text, display name, visit month/year, edit marker, and conflict label. Never email, exact visit time, location, or trip.

## Image uploads

- Every real image passes private quarantine: validation, re-encoding, metadata removal, accessible alt text, and Administrator approval before display.
- Require local preview/crop, rights confirmation, and meaningful alt text before submission.
- Keep the current approved image live while its replacement is reviewed.
- Neutral placeholder when no approved photo exists; a missing photo never hides a valid listing.
- Prohibit copied website images, social screenshots, and unauthorized third-party images.

## Rate limiting and abuse

- Apply per-account/IP/device rate limits to authentication, reviews, corrections, and shares.
- Review eligibility requires an attested in-person visit or `Done Here` trip state.
- One active public review per user per store.
- Automated signals can open a case but never restrict a feature; only a final MFA-scoped decision does.

## Retention and recovery

- Backups must restore both database and Storage; a provider promise alone does not establish recovery.
- Session tokens: 15-minute access, 30-day rotating refresh expiry.
- Operational records have defined deletion deadlines and never become a second store of shopper-private content.
- Pending shares and unaccepted payloads delete from the primary database within 24 hours.
- Team-invitation recipient HMACs exist only while invitations are pending, whose lifetime is at most 7 days; acceptance and cancellation scrub them immediately, and the lifecycle sweep expires due invitations and scrubs their HMACs.

## Required pre-launch testing

Before public release:

- Allow/deny authorization tests against every private table, RPC, Function, Storage path, and export.
- User A / User B isolation for stores, trips, ratings, and notes.
- Store Representative / Administrator denial of shopper-private data.
- Image quarantine: re-encoding, metadata stripping, forbidden-origin rejection.
- Audit-chain integrity for privileged actions.
- Backup restore test covering database and Storage.
- Browser inspection finds no token in localStorage, Cache Storage, URLs, or logs.

A missing required environment is `UNAVAILABLE`, not `PASS`.

## Public test boundary

The authorized free public test (ADR 0010) currently admits anonymous catalog browsing of twelve fictional stores; the tester allowlist is empty, registration remains closed, and saving is disabled. Older saved-account admission wording grants no current activation authority. The separately authorized [Market at Macvicar exception](docs/adr/0011-market-at-macvicar-public-listing.md) adds only its explicitly admitted public catalog projection and approved derivatives; it grants no private, account, claim, role, payment, or other real-store access and preserves origin/RLS/RPC/expiry/stop checks. Under #468, the public UI may also prepare anonymous correction drafts in this tab's `sessionStorage`; this does not add a backend capability or server write. The form has no sign-in-to-submit or submit action, and the server-only `PUBLIC_TEST_MODE` guard rejects direct correction submissions before session verification or gateway/database calls, including for an existing authenticated session. Registration stays closed until account/provider acceptance is complete. Trips, correction submissions, maps, and privileged operations remain outside this scope. The display flag (`VITE_PUBLIC_TEST_CATALOG_ONLY`) is not a stop mechanism; previously admitted accounts retain lifecycle access under their original authorization. See [public test admission](docs/operations/PUBLIC_TEST_ADMISSION.md).

## Store-first stage applicability

This legacy anchor now points to the shopper-first target in [PRD stages](PRD.md#stage-dependencies). The existing catalog-only public test remains unchanged. Future admitted discovery/favorites/sharing/planning/private-memory and owner/admin journeys require applicable account, privacy, store/media, routing, recovery and allow/deny evidence. Scope approval is not runtime activation.

Require verified owner email, MFA, documented authority, Site Admin approval, exact-store server authorization, audit and immediate revocation. No mandatory full synthetic team/analytics/promotion/review-response suite. Keep every retained-data lifecycle and reachable-path safeguard. Public-store-link sharing does not require recipient lookup or expose private content. For safe URL/address handling, a pasted source is not authorization for network fetching.

## Store Owner cancellation decision — 2026-10-01

[Historical local cancellation contract](docs/specs/store-owner-paid-servicing.md) remains bounded to fake-provider synthetic testing and existing servicing obligations. It is not a prerequisite for the first outing or permission for deployed billing actions. Any later paid offer must provide safe supported cancellation and preserve incumbent obligations.
