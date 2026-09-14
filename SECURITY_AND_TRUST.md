# Security, Privacy, Trust, and Operations

Security is a product requirement and a launch gate.

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

- One trip's draft, stop order, schedule, and progress are readable by its Trip Creator and one accepted Trip Partner only.
- Each participant's ratings and notes remain private to that participant.

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
- Device location is requested only after an explicit in-use action (routing).
- No saved Home profile field, no background or continuous location, no raw movement history.
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