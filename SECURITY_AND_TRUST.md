# Security, Privacy, Trust, and Operations

Security is a product requirement and launch gate.

Status: approved implementation baseline through the 2026-08-03 adversarial hardening pass. D31 full Audit History UI/export remains unresolved; privileged audit retention is two years.

## Security objectives

- Prevent unauthorized access to private user data
- Prevent store owners from accessing shopper-private data
- Prevent clients from bypassing authorization
- Limit abuse of ratings and reviews
- Protect account recovery
- Protect uploaded images
- Protect administrative functions
- Minimize precise location collection
- Maintain recoverability and auditability
- Support responsible vulnerability reporting

## Data classification

### Public

- Approved store details
- Approved public reviews
- Approved Official Store Profile Photos with rights provenance and accessible alternative text
- Store-owner public responses
- Public event details
- Aggregate public rating
- Claimed-listing indicator
- Approved native Store Updates and their processed image
- Validated official social profile links

### Pilot-restricted

- Pilot Store Record core listing data
- Pilot Store Draft, review comments, and submitted snapshots
- Pilot Support Tickets, replies, and sanitized attachments
- Store Partner identity and contact needed for the pilot
- Pilot consent and participation status
- Immutable Pilot Consent Receipt and delivery status

Pilot Store Record core listing data is readable by invited Private Beta participants and authorized operational roles. Pilot Store Drafts, review comments, submitted snapshots, support records, partner contact, consent records, and receipts remain limited to their submitting/owning identity and the specifically authorized Administrator workflow. Approval inside the pilot does not make any pilot-restricted data anonymously or publicly readable.

The Initial Private Beta Cohort contains only Scott's separate shopper and Administrator accounts, Scott's wife's shopper account, and one Store Representative account. AI and Agent-Assisted Test Accounts cannot read Pilot Store Records or other pilot-restricted data.

Expansion requires a passed Initial Private Beta Expansion Gate. No additional account or Pilot Store Record is authorized merely because time has elapsed.

Controlled Private Beta Expansion adds one Store Partner and Pilot Store Record at a time, repeats the same security and acceptance checks, and stops at three total stores for a separate public-readiness review. Pilot passage never changes pilot-restricted data to public data automatically.

### Regional-readiness-restricted

- Staff-prepared real-store facts awaiting public-release signature
- Readiness invitation, consent, cohort membership, and evidence status

Regional-readiness listings use a distinct nonpublic audience. They are readable only by the invited account whose verified email matches a consumed seven-day invitation and whose 30-day readiness grant remains active, plus authorized operational roles. They never appear in anonymous catalog/map/search projections, search-engine artifacts, public caches, or unsolicited public provider payloads. After R-01, two exact Package 10A exceptions exist: the trusted frozen-itinerary evidence call, and an active cohort user's explicit `Check My Day` or external-map handoff. The evidence call sends public business coordinates only. The user-requested routing call sends selected business coordinates plus only an optional manually confirmed start/return coordinate required by R-01; external-map handoff sends only the current business destination and lets the external app obtain its own start. Neither payload includes listing IDs, cohort/grant/partner state, account/email, campaign code, private note, or support/evidence identifier; Antique Trail logs none of the coordinates. Revocation or expiry denies initiation on the next request. Approval in readiness does not make a listing public; the exact receipt-bound Package 10B catalog-promotion transaction performs that separate transition.

### Private to user

- Directly captured Candidate Links and private Trip Ideas
- Outbound Candidate Shares, including original URL, sender note, recipient, and delivery state
- Personal rating
- Private notes
- Saved stores
- Finds — **POST-MVP reference; no route, schema, grant, or scaffold in Packages 1–10B**
- Purchases — **POST-MVP reference; no route, schema, grant, or scaffold in Packages 1–10B**
- Collection — **POST-MVP reference; no route, schema, grant, or scaffold in Packages 1–10B**
- Trip history
- Preference profile — **POST-MVP reference; no route, schema, grant, or scaffold in Packages 1–10B**
- Home photos — **POST-MVP reference; no route, schema, grant, or scaffold in Packages 1–10B**
- Location-derived itinerary details unless explicitly shared
- Authored trip ratings, return choices, and notes even when the trip is shared

### One-trip shared

- One trip's draft, stop order, schedule, readiness state, and active progress are readable by its Trip Creator and one accepted Trip Partner only.
- Both participants may edit the draft. Only the assigned Navigator may mutate Go state.
- Each participant's ratings, return choices, and notes remain private to that participant.
- The grant exposes no unrelated trips, ideas, saves, profile, or history and ends when the participant is removed.

### Recipient-shared candidate

Only the Candidate Share payload is readable by its authenticated sender and the existing verified account resolved server-side from the entered recipient email. Never expose whether the address matched an account, was unverified, or was blocked. Do not invite or deliver a payload to an unregistered address. The sender may create and revoke its own pending share. Only the matched recipient may Accept, Dismiss, Block, or Report. Sender-visible status is limited to `Pending`, `Accepted`, or `Closed`, with every non-accepted reason conflated. A pending share expires after 30 days. Expired, revoked, dismissed, or blocked payloads become unreadable immediately and delete from primary database/Storage within 24 hours. Acceptance creates a recipient-owned Trip Idea; the sender-only outbound envelope deletes URL/note after 30 days and may retain content-free `Accepted` status for 90 days. Block retains only a pseudonymous sender-recipient edge until unblock/account deletion. Report copies only opaque party IDs, an HMAC of the normalized destination host, reason, timestamps, and the minimum reported text necessary to evaluate abuse into the access-controlled moderation case; it never copies the full URL, path, query, or fragment. The share payload then deletes within 24 hours; case evidence follows two-years-after-closure retention. Sender access never extends to recipient edits or other private records. Candidate Share is not household membership and grants no broader cross-account access.

### Household-shared — POST-MVP reference only

Future rule only: records explicitly shared with an accepted household member. Packages 1–10B create no household route, schema, grant, policy, or scaffold.

### Sensitive operational data

- Moderation cases
- Business verification evidence
- Audit logs
- Fraud signals
- Account-recovery events
- Security alerts
- Administrative actions
- Pending Store Updates, Store Change Requests, quarantined media, support diagnostics, and scoped-access records

## Privacy by default

Private content must never become public because it is connected to a public store record.

Private saves, trips, trip history, personal ratings, notes, and accepted Trip Ideas persist until their owner deletes the supported record or deletes the account. Do not apply automatic age-based expiry to this content. Temporary grants/shares, inactive accounts, and operational records remain governed by separate lifecycle rules.

For an individual supported private record, revoke reads immediately, allow only a short Undo, and delete both its primary database row and associated Storage objects within 24 hours. Account deletion revokes all sessions and grants immediately, permits cancellation for seven clearly disclosed days, and deletes primary database and Storage data by day 8 when not cancelled. Cancellation restores ordinary access only; privileged grants remain revoked until normal audited identity/authority/regrant checks pass. Scheduling deletion also hides every active/pending authored public review and removes its aggregate effect transactionally. The seven-day cancellation-only account mode may restore the prior published/pending state only when the review remains eligible and is not held/removed. Day-8 processing deletes the public display name and all current/historical review text; a live moderation/legal case may retain only the minimum evidence already copied into its restricted record. Keep only content-free review/version/audit metadata and a content-free opaque deletion receipt outside the restored dataset for the backup window. A restore procedure must reapply completed deletion requests before users regain access.

Use UTC authentication timestamps. On the first daily job at or after the third anniversary of last successful sign-in, schedule deletion for 90 days later and send the 90-day warning; send 30- and 7-day warnings at their milestones. A successful sign-in atomically cancels the schedule. Idempotency is `(account, milestone)`; retries cannot duplicate schedules or warnings. Delivery failure alerts operations but does not extend retention. At the scheduled instant apply the seven-day account-deletion cancellation period, completing primary deletion by day 98 unless cancelled. Leap-day anniversaries use February's last day. Use no browsing, trip, device-location, analytics, or behavioral state. Synthetic Internal Alpha accounts are excluded and reset manually.

Candidate Link extraction must never create or update public store, event, review, claim, or Store Partner data. Extracted values remain unverified private suggestions until the recipient reviews them. A source URL is provenance, not proof that its content is accurate, licensed for republication, or authorized by a business owner.

Official Store Profile Photos are owner-provided or specifically permissioned business content, not shopper-generated content. Store the submitter, store scope, rights assertion/evidence, approval identity, approval time, source asset, processed asset, and alternative text. Do not use automatic website/social screenshots. A public image URL never proves publication rights.

Every new field must receive:

- Data classification
- Allowed readers
- Allowed writers
- Retention period
- Deletion behavior
- Logging restrictions
- Export behavior

Admission records are security-sensitive pseudonymous identity linkages. Raw admission and provider action-link secrets remain only in the recipient fragment or server memory. Token hash, email HMAC, idempotency key, provider-call timing/linkage, reconciliation metadata, and Auth admission metadata delete within 24 hours after active or terminal cleanup, immediately on account deletion, and from backups within 30 days. Only content-free purpose/outcome/time remains for 90 days, three years after a partner/readiness relationship, or two years when already required as privileged audit. These internals never enter logs, telemetry, ordinary account export, or support payloads.

## Location privacy

- Request device location only after explicit while-in-use permission for a user-requested route
- Explain the feature purpose and name the routing provider in the privacy notice
- Send the provider only coordinates necessary for the requested route
- Provide manual start entry; denial must not block directory browsing or manual trip planning
- No background or continuous tracking
- Do not sell precise location or share it for unrelated purposes
- Do not include precise coordinates in analytics, application logs, email, or support records
- Save trips only through explicit user action and keep them shopper-private
- Allow deletion of saved trip history
- Avoid storing raw movement history
- Apply the separately approved retention policy to completed-trip location data
- Use manual arrival only. Do not create geofence events, background pings, or a profile-level home location.

## Authenticated offline storage

- `start_trip` issues a server-signed offline grant bound to account, trip, Navigator device, session-security version, and the non-extractable device key. Maximum private display/mutation lifetime is 36 hours; the grant never authorizes a server request.
- Cold offline restart decrypts only when the locally stored Auth subject matches the grant/device. Without a match, reveal only that an offline trip exists and require online sign-in. Clear plaintext from memory after 15 minutes backgrounded/inactive.
- At 36 hours enter `locked_pending_sync`: no private display or new mutation. The same account may sign in online within seven days to reauthorize/replay/purge; after seven days purge ciphertext/key on next app execution. Known revocation, account switch, or confirmed logout purges immediately. Detect local-clock rollback greater than five minutes and lock until online verification.
- Persist only the assigned Navigator's minimum active-trip snapshot and pending mutations in encrypted IndexedDB.
- Bind ciphertext to the authenticated account and local PWA installation. Encrypt with Web Crypto using a non-extractable device-local key and authenticated metadata that rejects account or record substitution.
- Keep authenticated trip data out of Cache Storage, the public service-worker cache, analytics, logs, error reports, and browser-readable configuration.
- Do not cache unrelated trips, Candidate Links/Shares, profile data, private media, representative/admin data, tokens, or provider responses.
- Allow the encrypted snapshot to survive refresh, browser close, and PWA restart so `Resume Trip` works offline.
- Purge ciphertext and its key after completed-trip changes successfully synchronize, on account switch, and on logout.
- If logout would delete unsynced mutations, warn plainly, identify that local changes will be lost, and require explicit confirmation before purge.
- On known authorization loss, purge immediately. If revocation occurred while the device was offline, require an online authorization recheck before sync or refreshed private display, then purge and reject queued writes.
- Do not claim remote erasure of data already decrypted on an offline or compromised device. Local encryption does not protect against malicious same-origin script; CSP, dependency controls, and XSS prevention remain required.
- Bind each Go session to one Navigator account and one active Navigator device. Device transfer requires authenticated online confirmation and invalidates later mutation submission by the old device.
- Assign every mutation a server-verifiable idempotency key, trip/base version, device binding, and monotonic local sequence. Replay accepted actions exactly once in local order.
- Reauthorize account, trip participation, Navigator assignment, active device, and trip state before accepting every queued mutation. Server authorization and lifecycle state always win.
- Reject unauthorized or incompatible mutations without leaking another participant's data. Preserve only the minimum local sync-error information allowed by the still-valid authorization.
- Apply non-conflicting mutations. For a same-author private rating or note changed from the offline base on another device, preserve both versions and require an explicit author choice; never use silent last-write-wins.

## Authentication

- Email verification
- Secure managed authentication
- Optional MFA for users
- Required MFA for administrators and verified business accounts
- Login rate limiting
- Password-recovery rate limiting
- Session revocation
- Recent-auth checks for sensitive operations
- No account enumeration
- No password storage in application tables

General shopper/Representative/Administrator passkeys and social sign-in are deferred. One narrow WebAuthn reviewer capability is approved solely for the independent appeal and break-glass reviewer flows that require phishing-resistant MFA; it is not a reusable Antique Trail account or general sign-in path.

`reviewer_webauthn_credentials` stores reviewer identity reference, RP ID, credential-ID hash, public key, signature counter, transports, enrollment/last-used/revoked timestamps, and version—never a biometric or private key. Product Owner and the named reviewer complete identity/confidentiality checks, then enroll two non-discoverable hardware/platform WebAuthn credentials through a one-use 30-minute setup capability. Require HTTPS, exact production RP ID/origin, user verification, challenge single-use/expiry, origin/RP/signature/counter validation, and a fresh WebAuthn assertion for every case-capability exchange. Credential management requires repeat Product Owner-verified identity and a separate ten-minute one-use fragment capability that derives the exact reviewer and `allowCredentials`; no username lookup, discoverable-credential ceremony, or normal session exists. Lost-device recovery requires repeat identity proof, revokes every prior credential/capability, and is audited. Setup/management/recovery capability hashes and challenges delete within 24 hours after use/expiry and from backups within 30 days, with no logging or export. Keep active credentials only during the reviewer relationship; on credential revocation or relationship end delete public key/transports/counter/direct linkage, retain only a purpose-keyed credential-ID HMAC for 90 days against immediate reuse, then delete it. Qualification/decision audit follows the two-year privileged-case rule then de-identifies. Reviewer authentication artifacts are excluded from shopper/ordinary privileged export and disclosed only through separately verified reviewer privacy handling. Tests cover management identification/capability, no typed/discoverable lookup, wrong origin/RP, replay, cloned-counter signal, revoked/lost credential, absent user verification, lifecycle purge/backup aging/export exclusion, and no expansion into normal authentication. Without successful enrollment, independent-review paths stay disabled; a second qualified Administrator is the only allowed substitute.

Registration mail uses Supabase Admin `generateLink(type:'signup')` only to create the user and obtain `properties.hashed_token`. Discard the provider action URL. The E-01 mailer sends only the app-origin `/auth/callback#token_hash=...&type=verify` link with rewriting, click tracking, and prefetch disabled; `verify` maps only to `verifyOtp(type:'email')`. Recovery maps only to provider type `recovery`. No provider `/verify?token=` URL or access/refresh-token fragment is permitted. Before E-01, H-01 inspects the exact no-send stub payload and hosted callback behavior without delivering a real message. E-01 separately proves the exact received message/link and repeats callback, rewriting/tracking/prefetch, timeout, privacy, and failure tests against the selected mail provider; H-01 alone never authorizes delivery.

Registration reconciliation uses two more private `postgres`-owned `SECURITY DEFINER SET search_path=''` helpers outside exposed schemas. The admission helper contains one static exact query for the unguessable server-generated admission UUID and returns only provider ID, normalized email, confirmation time, and required admission metadata; the application HMAC-compares that email to the receipt. The cleanup helper contains one static exact query for a recorded provider user ID and returns only authoritative existence, confirmation time, and required cleanup metadata. They accept no partial identifiers, use no dynamic SQL, change no managed Auth ownership, grant no direct Auth-table access, and revoke execution from `PUBLIC`, `anon`, `authenticated`, and ordinary application roles; only the private registration function owner may execute them. H-01 proves exact/zero/duplicate/error results and grants on hosted Supabase. Paginated `listUsers` scanning is prohibited.

Every external registration create, metadata, or verification-delivery call uses the durable latch-first operation protocol in `PACKAGE_CONTRACTS.md`. Starting quarantine atomically closes registration and changes `open → draining`, preventing any new create/send reservation while existing provider calls settle or reach their H-01-proven authoritative finality boundary. A lost response never becomes absent merely because a lease elapsed. `draining|blocked` permits only exact subject lookup, session revocation, exact-user deletion, delivery reconciliation, escalation, deletion-only admission-metadata clear, and signed clear proof; it cannot create, deliver, activate, or promote an Antique Trail registration. The metadata-clear privacy operation is valid under any latch state only for an exact bound provider ID/admission UUID in an approved terminal/privacy lifecycle state; it removes only `app_metadata.antique_trail_admission_id`, treats absence idempotently, and denies mismatch/unknown without altering other metadata or account/admission state. A previously delivered token can still confirm a provider identity directly at Supabase, so every admission-bound signup-verification callback rechecks the locked latch, denies application completion/profile creation while non-open, captures the confirmed provider user, revokes its session, and keeps it cleanup-bound. Existing-account password-recovery callbacks are not admission-bound and remain available. Clearing requires `blocked`, no nonterminal provider operation, exact provider-ID absence for every subject, and the two-human one-use receipt in `PACKAGE_CONTRACTS.md`. Any unknown keeps registration closed. Provider IDs, tickets, admission linkage, and terminal operation details are purged within 24 hours after verified clear and age out of backups within 30 days; only a content-free outcome/time remains for 90 days and never appears in ordinary logs, telemetry, support, or shopper export.

H-01 registers Package 2's Product and Security deployment-recovery signers before any shared provider call. They are two distinct humans with separately held offline Ed25519 keys and protected public-key fingerprints, not Antique Trail accounts or Package 8 evidence responsibilities. Both signatures over one canonical, nonce-bound, 30-minute receipt are mandatory for quarantine clear and restore-fence removal. Key/signature collision, unavailability, loss, revocation, replay, wrong environment/digest/version, or failed rotation keeps shared registration disabled; there is no one-person fallback and no application/data authority.

### Session storage and next-request revocation

- Use Supabase bearer sessions, not application authentication cookies. Access tokens remain in memory. Persist refresh-session material only through a dedicated IndexedDB Supabase storage adapter; never use `localStorage`, Cache Storage, a URL, log, telemetry, or application configuration. IndexedDB does not defend against same-origin XSS.
- `profiles.session_epoch` plus `sessions_revoked_before` and `app_private.active_sessions` record the provider `session_id`, user, original provider-session `created_at`, epoch, state `active|cancellation_only|revoked`, timestamps, reason, and version. Supabase documents that JWT `session_id` correlates to `auth.sessions.id` and reserves `auth` ownership for its managed service. `register_current_session()` derives `auth.uid()` and session ID from verified JWT, then calls one private `postgres`-owned `SECURITY DEFINER SET search_path=''` helper containing a static schema-qualified exact-row query returning only `auth.sessions.created_at` for matching ID/user. Do not change Auth-object ownership or grant a custom role direct Auth-table access. The helper stays outside exposed schemas, has no dynamic SQL, and revokes execution from `PUBLIC`, `anon`, `authenticated`, and ordinary application roles; only the private registration function owner may execute it. Missing/deleted/wrong-user rows or helper failure deny. Registration requires creation time strictly after `sessions_revoked_before`; refresh never changes that boundary. It inserts only an unseen ID at the current epoch; a revoked/cancellation-only row never returns active. All-device/security/deletion/recovery revocation atomically advances `sessions_revoked_before` to database time and increments the epoch; older epochs or earlier/equal provider creation times deny. H-01 proves helper creation/call/revoke on hosted Supabase and reruns after provider platform upgrades; local proof alone is insufficient. Revoked tombstones remain at least 30 days.
- Every private or privileged RLS/Storage policy, RPC, Edge Function, export, signed-URL issuer, and offline-sync endpoint calls one fixed-search-path `current_session_is_active()` helper and checks account/feature state. Public catalog reads remain public.
- Account deletion, password recovery, `Sign out all devices`, security revocation, and individual session revocation update application session state first. An idempotent outbox requests provider revocation. Provider failure cannot restore application access, including for a valid provider session never previously registered with Antique Trail. Cancellation-only sessions may use only deletion-cancel, recovery, and sign-out.
- Local sign-out clears local tokens immediately. It reports server revocation only after acknowledgement. Previously issued tokens must fail the next private request through the application state check.

### HMAC isolation and rotation

Use HMAC-SHA-256 with independent 256-bit keys per environment and purpose: Candidate recipient match; Trip/readiness email match; Candidate URL dedup; RG-01 dedup; and any retained route-input digest. Store `key_version`, write with the current key, and verify current plus one retiring key. Rotate annually and after suspected compromise; re-HMAC active records before retirement. Retain a retiring key only through the longest unmatched-record lifetime plus the 31-day backup window, then destroy it. Use provider-normalized verified email without Gmail-style alias folding. Candidate block edges use internal user IDs after resolution. HMAC values remain pseudonymous personal data. Destroy the RG-01 dedup key after receipt-local linkage purge. Never use an unkeyed hash for predictable coordinates.

### Database function privilege contract

- Client-facing reads use `SECURITY INVOKER` wherever possible. A function that must bypass caller RLS is `SECURITY DEFINER`, owned by a dedicated non-login role that owns no application tables and has no `BYPASSRLS`; it uses a literal `search_path=pg_catalog,app_private`, schema-qualified objects, explicit input checks, stage/session/role/scope checks, and a bounded return type.
- Application tables enable and `FORCE ROW LEVEL SECURITY`. Runtime/authenticator roles never own tables. Revoke table, sequence, schema-create, and function execute privileges from `PUBLIC`; grant only named operations to named roles. Service-role use is isolated to approved jobs/functions and is never reachable from clients.
- Each definer RPC is tested for direct-table denial, sibling-row denial, forged claims, hostile object names/search path, missing session, stale grant, and excessive result set. An RPC is not accepted merely because the UI hides it.

### Stage and capability authorization

Server-owned stages are `pre_release`, `synthetic_alpha`, `private_beta`, `regional_readiness`, `regional_public`, and `expansion_evidence`. Capabilities default false: receipt/public account registration, external Candidate fetch, outbound email, provider routing/geocoding, real-store records, pilot audience, official-media upload, public listing claims, public real catalog, public reviews, break-glass, public promotion, RG-01 collection, and analytics. Direct anonymous Supabase signup remains provider-disabled; shared-stage registration consumes an approved one-use admission receipt through the application function. Every dependent policy/function/route/job/signed-URL issuer checks the server capability; a client flag may hide UI only. Capability transitions are atomic, audited, bound to a signed release receipt, and callable only by the deployment service. Rollback disables capabilities before artifact/database rollback. Package 10B alone may enable public registration, catalog, claims, reviews, and promotion; Package 11 alone may enable RG-01 collection.

### HTTP, browser, and cache contract

- HTML shell and service worker: `Cache-Control: no-cache`. Content-hashed JS/CSS/font assets: `public, max-age=31536000, immutable`. Every startup API/RPC response: `Cache-Control: no-store`. Every authenticated, mixed public/private, pilot, readiness, export, signed-URL, moderation, or operational response: `Cache-Control: private, no-store` and `Vary: Authorization, Origin`.
- Do not CDN-cache Supabase REST/RPC, Edge Function, authenticated map, pilot, or readiness responses. Public map points and private saved/visited overlays are separate responses; otherwise the whole response is private/no-store. The service worker caches only shell/assets, never API/private data.
- Public approved media uses versioned immutable object paths. Rights withdrawal removes catalog references, deletes origin/derivatives within the approved lifetime, and requests CDN purge. Already downloaded copies are an explicit residual risk.
- Production CSP: `default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob: <exact-storage-host>; connect-src 'self' <exact-supabase-https> <exact-supabase-wss>; manifest-src 'self'; worker-src 'self'; media-src 'self'; upgrade-insecure-requests`. No wildcard, `unsafe-inline`, or `unsafe-eval`; provider ADRs may add exact hosts only.
- Also send `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`, and `Cross-Origin-Resource-Policy: same-site`. Enable HSTS preload only after every production subdomain is HTTPS-ready. `/auth/callback` loads no third party, is never service-worker cached, and scrubs its fragment immediately.

### Global untrusted-field contract

| Field | Unicode code points | UTF-8 bytes |
|---|---:|---:|
| Public display name | 2–50 | 200 |
| Store name/headline | 1–120 | 480 |
| Store description/update/review/correction/appeal | 0–2,000 | 8,000 |
| Candidate title | 1–160 | 640 |
| Candidate sender note/admin reason | 0–1,000 | 4,000 |
| Private note/support message | 0–4,000 | 16,000 |
| Alternative text | 1–300 | 1,200 |
| Rest label | 1–120 | 480 |
| Address/manual place | 1–300 | 1,200 |
| URL | n/a | 2,048 |

Store prose as NFC, normalize CRLF to LF, and reject NUL/disallowed C0/C1 controls. Identifiers/search use the approved NFKC/case-fold rules. Render prose only as text nodes: no HTML, Markdown, embedded style, or automatic link. Validated URL fields are the only links. Use `dir=auto` and `unicode-bidi: plaintext`; public names/headlines reject bidi override/isolate and invisible format characters and may not impersonate Antique Trail/Administrator/Support roles. Preview and publication use the same escaping path. Enforce both code-point and byte limits in database and server validation.

### Audit tamper evidence

Audit events include monotonic sequence, previous hash, canonical event hash, actor, target, exact scope, result, database timestamp, request ID, and schema version. Runtime roles append only through one function and cannot update/delete/truncate. Audit DDL/partition changes require controlled migration and a deployment receipt. At least daily and every 1,000 events, publish the chain root—never private payload—to the separately administered append-only sink accepted by L-01 before privileged shared/external use. L-01 owns credentials/rotation, retention, quotas/`$0` startup proof, outage, restore, and replacement tests. If no root succeeds for 24 hours, alert and disable privileged mutations; denials remain enforced. A free topology unable to provide this separate control cannot enable privileged remote mutation, independent-review access, break-glass, or public privileged operation.

### Feature-scoped abuse restrictions

Do not create an undocumented global suspension or shadow ban. A feature restriction may cover only Candidate Share send, public-review create/edit, official-media upload, or listing-claim submit. It never blocks sign-in, Browse, private trips/notes, export, deletion, appeal, or management/deletion of existing authored content. Every restriction names feature/store scope, final source case, general reason, start/end (maximum 180 days), MFA/recent-auth actor, version, and appeal state; no permanent restriction exists in MVP. The user sees the feature, general reason, end date, and appeal/support path, never reporter/fraud detail. One appeal is allowed within 30 days and uses a different qualified reviewer where required. Package-specific threshold tests must pass before enabling that feature.

### Mechanical rate-limit baseline

All limits are server-side sliding windows with atomic counters. Keys use the minimum applicable combination of account, purpose-specific email/host HMAC, store/resource, coarse IP abuse key, and device-session ID; never expose which key fired. A limit returns the same reason-neutral response shape, a bounded `Retry-After`, preserves safe entered data, and never partially mutates. Raw IP/device telemetry follows the 30-day maximum; rate counters delete after 90 days and are never product analytics. The UI states when to retry, offers recovery/support when appropriate, and never demands rapid repeated action.

| Action | Baseline limit and cooldown |
|---|---|
| Registration/sign-in/verification resend/recovery | 5 attempts per email-HMAC per 15 minutes and 20 per IP per hour; exponential 1/5/15-minute cooldown after consecutive failures; successful sign-in clears only that account's failure streak |
| Candidate extraction | Existing exact 10/account/hour, 30/IP/hour, 5/account/host/hour, 2 concurrent/account |
| Candidate Share send | 10/account/day, 5/recipient-HMAC/day, 30/IP/day |
| Correction submit | 5/account/day, 20/IP/day, 2/store/account/day |
| Trip/partner/readiness invitation create or exchange | 10/actor/hour, 20/IP/hour, 5/exact target/day; raw-token failure never reveals state |
| Public review create/edit/report | 10/account/hour total, 3/store/account/day, 30/IP/hour; one-active-review constraint remains controlling |
| Claim submit/signal attempt | 3/account/30 days, 3/store/30 days, 10/IP/day |
| Store update/change/support | 20/store/day, 10/account/hour; support permits 10/account/day and emergency security contact remains available |
| Media upload after M-01 | 20/store/day, 5 concurrent/store, plus byte/storage quotas |
| Privileged decision/invitation | 30/Administrator/hour and 10/exact target/hour; MFA/recent-auth and case lock still required |
| Anonymous public catalog list/detail after Package 10B | List: 60/coarse-IP/5 minutes with burst 20; detail: 120/coarse-IP/5 minutes with burst 30; maximum 4 concurrent requests/coarse-IP; global daily ceiling is the lesser of the H-01 capacity result or `floor(80% of the current included monthly request quota / 31)` |

A Security Owner may grant one exact subject/action exception for at most 24 hours only after MFA/recent-auth, reason, safe new ceiling, and hash-chained audit; it never bypasses stage, authorization, content validation, one-record cardinality, cost cap, or evidence rules. No silent/global override exists. Tests run at `limit-1`, `limit`, `limit+1`, cooldown expiry, concurrent edge, key rotation, provider outage, IPv4/IPv6/proxy boundaries, accessibility copy, and no account/state enumeration. Package-specific stricter limits win.

Package 1 local/Synthetic work may call the two bounded catalog RPCs directly. Before Package 10B, revoke `anon` execution and route every anonymous public list/detail request through one Supabase Edge Function catalog gateway. It accepts only the documented typed list/detail inputs, uses only platform-authenticated client-address metadata—not caller-supplied forwarding headers—for the coarse-IP key, applies the table above atomically, and invokes only the fixed public-projection RPCs. The browser never receives a service credential. Missing trusted address metadata, counter failure, direct PostgREST invocation, or the global ceiling fails closed with accessible `Temporarily unavailable`/`Retry-After`; installed shell and already loaded public pages remain readable, but no stale response claims current hours. H-01 must prove the provider metadata, direct-RPC denial, concurrency, IPv4/IPv6/proxy behavior, quota accounting, and `$0` no-overage stop. If any proof fails, Package 10B remains blocked rather than weakening the boundary.

## Authorization

Use deny-by-default policies.

Authorization must be enforced at:

- Database
- Storage
- Server function
- Administrative tool

Never rely only on frontend visibility.

Required authorization test cases:

- User A cannot read User B private records
- Candidate Share sender can create/read/revoke only their own outbound shares
- Only the named authenticated recipient can read, accept, or dismiss an addressed Candidate Share
- Candidate Share recipient matching uses verified email server-side and never reveals whether an address maps to an existing, verified, or blocking account
- Matched, unmatched, unverified, and blocked recipient attempts return indistinguishable confirmation, response shape, sender-visible status, and timing behavior; unregistered addresses receive no invitation or payload
- Recipient resolution is queued server-side and returns the same generic `202` body no earlier than 500ms for every state; notification/delivery is asynchronous and never changes the sender response. On a fixed pre-release environment, 100 trials per state must show no status/body/header difference and less than 50ms difference between state medians; any regression blocks the package.
- Only the matched recipient can Block or Report; Block closes the current share and denies future shares from that sender, while Report closes it and creates a moderation case inaccessible to the sender
- Sender-visible Candidate Share status is limited to `Pending`, `Accepted`, or `Closed`; `Closed` never reveals dismissal, block, report, revocation, expiry, or account state
- Accepting a Candidate Share creates a recipient-owned Trip Idea and grants the sender no access to recipient edits, notes, ratings, trips, profile, or other ideas
- Anonymous users, wrong recipients, Store Representatives, Moderators, and Administrators cannot read or mutate Candidate Share payloads or Trip Ideas
- Candidate Share cannot create public store, event, review, claim, representative scope, or household membership
- Pending Candidate Shares expire after 30 days; expired, revoked, dismissed, malformed, over-quota, or already-decided shares are denied idempotently
- Expired, revoked, or dismissed unaccepted Candidate Share payloads become unreadable immediately and are deleted from the primary database and associated Storage within 24 hours
- Trip Creator can issue, cancel, and remove only the one-partner grant for a trip they own
- Trip Partner invitation requires the matching verified email, is single-use, expires after seven days, and reveals no trip data before acceptance
- Accepted Trip Partner can read and edit only that trip draft; neither participant can read the other's authored ratings, return choices, notes, or unrelated records
- Shared-draft mutations require active participation, base trip version, and idempotency key; stale mutations fail without partial write and disclose only the shared plan diff, never the partner's private fields
- Only the currently assigned Navigator can mutate Go state; participant removal ends authorization immediately, and removal of the Navigator pauses Go
- Offline active-trip access is limited to the assigned Navigator's minimum snapshot; completed-trip acknowledgement, account switch, confirmed logout, or known authorization loss purges the cache and key
- Offline trip ciphertext is account/install-bound in IndexedDB, encrypted with a non-extractable device-local key, and absent from public service-worker caches
- Account switch and confirmed logout purge the cache and key; logout with pending mutations requires an explicit data-loss warning
- Completed-trip cache purges only after pending changes receive server acknowledgement; authorization is rechecked before reconnect sync or refreshed private display
- Offline mutations replay exactly once in local order; server authorization, active Navigator device, and trip state win, while conflicting same-author ratings/notes require explicit version choice
- Test User A and Test User B may create duplicate values without sharing record ownership or private-data visibility
- Representative Test Account is scoped to one Synthetic Store and cannot read either Test User's private records
- Store Representative can directly change only Representative-Managed Fields for the assigned store
- Store Representative can publish only allowed Store Update text and supported official social links for the assigned store
- Image-bearing Store Updates and every Store Profile image remain unpublished until Administrator approval; current approved media stays live during replacement
- Unsupported social domains, URL shorteners, embedded credentials, tracking parameters, and cross-store changes are denied
- Store Representative cannot permanently delete archived Store Updates or privileged history
- Controlled Store Fields remain unchanged until an authorized reviewer approves a Store Change Request
- Store Representative cannot approve their own Store Change Request
- Administrator Test Account alone approves Store Change Requests and grants or revokes representative roles during Internal Alpha and Private Beta
- Administrator Test Account uses MFA, a separate session, and no shopper-private access
- Primary Internal Tester completes two Privileged Workflow Acceptance Cycles; AI execution is supervised and cannot approve a gate
- Independent Internal Tester uses her own shopper account and phone and is not required to access privileged accounts
- Every Representative-Managed Field publishes directly only for the assigned Synthetic Store
- Approved Controlled Store Fields publish; rejected and pending changes do not
- Representative self-approval is denied
- Representative writes from an existing session are denied after the Administrator revokes store scope
- Revocation denies every scoped database, Storage, RPC, Edge Function, support, portal, media, and signed-URL issuance path on the next request. Previously issued private signed URLs use a maximum five-minute TTL; revocation cannot recall already downloaded bytes, but the client purges scoped caches immediately and tests prove no new URL or cache refresh succeeds.
- Every privileged action produces an audit record
- Every allowed privileged mutation and its append-only audit event commit in the same database transaction or both fail. Denied privileged attempts use a separate append-only security event/outbox path keyed by request id; authorization remains denied if that event path is unavailable, an alert fires, and an idempotent worker retries durable delivery without replaying the denied mutation.
- Representative and Administrator Test Accounts cannot read or modify either Test User's shopper-private data
- During the Initial Private Beta Cohort, the Store Representative account cannot perform shopper activity; a separately approved shopper account is required
- AI and Agent-Assisted Test Accounts cannot read Pilot Store Records or pilot-restricted participant data
- Only Initial Private Beta Cohort accounts can read the Pilot Store Record
- Scheduled representative revoke/regrant test denies the existing session during revocation and restores only the approved store scope after regrant
- Initial Private Beta Expansion Gate retains dated evidence for owner workflow, shopper Pilot Store Record trips, support intake, audit completeness, recovery controls, defect status, and owner usability confirmation
- POST-MVP reference only: any future former household member loses server access immediately; no household implementation exists in Packages 1–10B
- Store owner cannot read user notes or trips
- Store owner cannot alter reviews
- Reviewer cannot alter aggregate rating directly
- Client cannot assign roles
- Client cannot approve its own public photo
- Moderator scope is limited
- Administrator actions are audited
- Signed private image URLs expire
- Store Partner Invitation token alone cannot create a role, store scope, Pilot Store Record, or pilot-data access
- Expired, revoked, or redeemed invitation tokens are denied
- Pending Partner Identity cannot read pilot-restricted data or perform Store Representative actions
- Store Representative grant requires verified email, MFA, published-contact authority verification, and Administrator approval
- Pilot Consent Receipt cannot be updated or deleted by Administrator, Store Representative, Pending Partner Identity, or client
- Material pilot-term changes require a new consent version before continued Store Representative access
- Pending Partner Identity can create/read/edit only its own Pilot Store Draft and only while draft or changes-requested
- Administrator can read, comment, return, or approve a Pilot Store Draft but cannot edit owner-submitted fields
- Pilot Store Draft approval requires Administrator MFA, recent authentication, and an exact final preview
- Pilot Store Record creation and store-scoped Store Representative grant succeed atomically or neither is created
- Representative activation email contains no bearer credential, reusable invitation, role token, store details, or review comments
- Representative portal requires verified-email and MFA sign-in and exposes only the granted store scope
- Pilot Support Ticket diagnostics use an explicit allowlist and exclude tokens, shopper data, precise location, and internal logs
- Pilot Support Ticket access is limited to the submitting Store Representative, Administrators, and narrow notification/media services
- Administrator review actions are type-scoped, require current request state, preserve submitted values, and cannot bulk approve or self-advance without an explicit action
- Access revocation requires MFA, recent authentication, exact store scope, reason, and consequence confirmation; it denies the next write from existing sessions without deleting account or approved store data
- Regrant repeats verified-email, MFA, authority, scope, and recent-authentication checks and never restores a broader scope
- Administrator can view privileged audit events needed for D30 but cannot alter or delete them; D31 full search/UI and export behavior remain unapproved
- Synthetic Internal Alpha denies every break-glass request
- Private Beta and Regional Public MVP break-glass requests require a confirmed security or data-recovery incident, Administrator MFA, recent authentication, an incident ID, a reason, exact scope, read-only default, and automatic expiry after 30 minutes
- Break-glass denies routine support, bulk export, role changes, deletion bypass, and unrelated-data access
- A second qualified Administrator approves break-glass when available. While Scott is the sole Administrator, break-glass remains disabled through Package 8/8B; Package 9's enrolled independent reviewer must provide the required review before enablement
- Every allowed or denied break-glass attempt is immutable, retained for two years, and triggers affected-user notice when safe and legally allowed

## Database separation

Prefer separation between public and private entities.

Suggested domains:

- Public stores
- Public hours
- Public reviews
- Approved public store-profile media
- Private profiles
- User-store preferences — Regional MVP contains only private rating/note/save; personalization profile is post-MVP
- Private notes
- Private finds — **POST-MVP; do not scaffold**
- Private collections — **POST-MVP; do not scaffold**
- Private trips
- Households — **POST-MVP; do not scaffold**
- Business claims
- Moderation
- Auditing
- Store Updates and update history
- Pending media and processed public media
- Official social links
- Trip invitations, trip participants, and Navigator assignment
- Pilot support and scoped-access grants

## Upload security

- Private and public buckets separated
- Private buckets by default
- Expiring signed URLs
- File-size limits
- Dimension limits
- MIME validation by file contents
- Re-encoding images
- EXIF and GPS removal
- Malware scanning before any untrusted upload is published. If scanning is unavailable or fails, keep the upload private and blocked from publication; re-encoding and metadata stripping do not replace scanning.
- Server-side thumbnails
- Rate limits
- Abuse reporting
- Public publication requires explicit action and moderation rules
- Official Store Profile Photos require an assigned Store Representative or Administrator submission, documented rights, a Store Change Request, and Administrator approval
- Enforce one cover plus five gallery slots per Store Profile and one image per Store Update
- Keep original uploads private; publish only processed derivatives after metadata removal and approval
- On rights withdrawal, store withdrawal, or pilot relationship end, unpublish every affected derivative immediately; delete source and processed objects from primary Storage within 24 hours and from managed backups within 30 days. Retain only content-free rights/provenance/audit facts for three years after the relationship ends.
- Keep current approved Store Profile media live during replacement. Hold an image-bearing Store Update in full until its image is approved.
- Reject copied website/social screenshots, shopper images in owner workflows, arbitrary support attachments, and files without rights confirmation
- Require meaningful alternative text or a concise caption before publication
- No AI training use without explicit consent

## Reviews and abuse

- Keep `public_reviews_enabled = false` server-side in Internal Alpha and Private Beta; routes return not found, reads return no rows, and writes deny regardless of client state.
- Require verified email, 18+ attestation, trip-completion or manual-visit attestation, per-account/device/IP rate limits, and one active review per user/store.
- At initial launch, authorize only an MFA/recent-auth Administrator to move one assigned exact case through `Hold`, `Remove`, `Restore`, or `Dismiss Report`; require a reason, update aggregate state in the same transaction, and append a hash-chained audit event. The Administrator receives only the selected case's approved field allowlist and cannot query sibling evidence, unrelated shopper-private data, reporter identity, or bulk fraud signals. Any separately authorized abuse investigation is a distinct incident-scoped capability.
- The author or exact-store Representative may submit one appeal within 30 days but sees no reporter identity, fraud signal, or unrelated case evidence. A different Administrator decides when available. With one Administrator, a qualified independent reviewer uses a random hashed single-case capability after verified identity, confidentiality agreement, and phishing-resistant MFA. It expires at decision or 24 hours after first access and is immediately revocable.
- The independent-review packet contains only challenged review text, public store context, rule/reason, prior decision, appeal text/evidence, and content-free identifiers. It excludes email, exact visit time, trip/location/note/account history, reporter identity, fraud signals, unrelated cases, and direct database access. The reviewer submits `Restore` or `Uphold` plus reason; trusted service applies the signed result and aggregate change transactionally, expires the capability, and appends the reviewer/packet hash/result. The original moderator is denied.
- Author deletion atomically removes public display/aggregate and enters `delete_pending` for 60 seconds. Only the author may Undo; restoration is allowed only if the prior state remains eligible and not held/removed. At 60 seconds finalize deletion and purge current/historical text within 24 hours. Closing/reopening during the window shows only the author's pending state. On account deletion, hide/remove aggregate immediately and on day 8 purge display name/all text, null or delete every author/user foreign key in reviews, versions, reports, and appeals, and use only an irreversible random content-free tombstone. A live restricted case may retain only copied minimum evidence and its case-scoped subject reference; restore replay reapplies de-identification before access.
- One active review per user per store
- Edit history
- Rate limiting
- Bot protection
- Spam detection
- Suspicious-rating analysis
- Report workflow
- Moderation queue
- Appeals
- Soft deletion
- Audit history
- Conflict-of-interest disclosure
- Store-owner response — **POST-MVP; no route, schema, grant, or scaffold in Packages 1–10B**
- Publish no email, exact visit time, location, trip, private note, or account history. A Store Representative cannot review its own scoped store; disclosed connected reviews are labeled and excluded from the arithmetic aggregate.
- Aggregate mutation and review-state/audit mutation are transactional. Author deletion removes public/aggregate effect immediately and primary text within 24 hours unless a live case retains minimum evidence.
- One appeal within 30 days; different Administrator when available, otherwise independent qualified reviewer; target 14 business days. Do not reveal reporter identity or shopper-private data to the store.
- No owner editing of reviews
- No purchase of rating improvements

## Business claims

### Store Partner Invitation security

- Administrator must use MFA and recent authentication to generate or revoke an invitation
- QR contains a high-entropy opaque token only; no identity, store, email, or role data
- Store only a token hash; do not log the raw token
- Expire after 30 minutes or one successful atomic consumption; rate-limit attempts
- Scanning opens onboarding but cannot grant access, install software, or create a Pilot Store Record
- Present terms and collect consent statements plus typed name/title/store/normalized email before any access grant; password and MFA credentials never pass through application tables
- In one application-database transaction, lock/consume the token hash, store immutable provisional consent, and create one application-only unprivileged Pending Partner Identity with a purpose-specific email HMAC. Auth signup happens separately through Supabase. Interruption leaves the pending identity resumable and never unconsumes the invitation.
- `bind_partner_identity()` derives the current verified Auth email/user from the session, requires MFA, matches and locks the pending identity by purpose-specific email HMAC, binds one Auth user once, and finalizes the immutable receipt in one application transaction. Existing Auth users use normal sign-in; orphan Auth users remain ordinary unprivileged shoppers.
- Unbound pending identities expire after 30 days. Delete typed PII/provisional consent within 24 hours after expiry unless legal review requires otherwise; retain only content-free invitation outcome.
- Keep the pending identity unprivileged until published-contact verification and Administrator approval
- Audit generation, expiry, revocation, atomic consumption, provisional consent, identity creation, email/MFA verification, receipt finalization, authority review, approval, and grant events
- A photographed token cannot bypass email verification, MFA, authority verification, or Administrator approval

### Public listing-claim security

- Package 6 tests the workflow with Synthetic data while `public_listing_claims_enabled=false`; Package 10B alone may enable it. Disabled routes are not found, reads return no records, and direct writes return stage-disabled without disclosing listing/claim existence.
- Require verified email, MFA, exact store, one active/submitted claim per claimant/store, one approved active claim per store, one active grant per store, and one active store grant per Representative. Partial unique constraints and a store-authority lock enforce cardinality. Approval rechecks every signal/conflict in one transaction; an existing grant returns conflict and is never replaced silently.
- Two signals must use distinct channel classes, objects, and events. Same email, phone, document, or contact cannot count twice. Allowed MVP records are content-free business-domain/published-contact response, callback, mailed code, public-filing lookup, or in-person inspection result.
- Claim-document upload is disabled. Lease/utility evidence may be viewed in person, but Antique Trail stores no copy. Official media and support screenshots remain disabled until M-01 proves file-content validation, isolated decode, scan, safe re-encode, metadata removal, quarantine, derivative-only review, deletion, and recovery.
- Claimants see only their own reason-neutral Draft/Submitted/Verification/Changes Requested/Conflict/Approved/Rejected/Withdrawn/Revoked status. They never see another claimant, fraud signal, internal note, sibling evidence, or bulk case data. Administrators read only the exact assigned store/claim/signal allowlist; no application role receives bulk evidence export.
- Transfer is a named transaction that revokes the old exact scope before approving/creating the new grant and audits both. Duplicate merge quarantines affected claims/grants; rollback never reactivates them.

### Pilot consent integrity

- Complete legal review of final wording before external use
- Present the policy version and required acknowledgments before submission
- Keep the provisional consent submission immutable and bind the finalized immutable receipt to it, verified email, finalization timestamp, invitation identifier, typed name/title/store, and policy version
- Administrator may read but cannot edit or delete submitted consent
- Email the owner a receipt/PDF without internal verification evidence or security notes
- Material term changes invalidate continued reliance on the old version and require fresh consent
- Audit receipt creation, delivery result, policy version, and re-consent without logging unnecessary identity evidence

### Pilot Store Draft integrity

- Authorize every read/write by onboarding identity and draft ownership
- Enforce server-side state transitions: draft, submitted, changes-requested, resubmitted, approved
- Reject owner edits while submitted or approved
- Reject Administrator edits to owner-submitted fields
- Preserve the exact submitted and approved snapshots with provenance
- Require MFA and recent authentication for approval
- Create the Pilot Store Record and scoped role grant in one transaction; rollback both on failure
- Audit comments, transitions, actor, timestamp, and result

### Representative activation security

- Send status-only approval, changes-requested, and rejection emails
- Use the normal PWA sign-in route; do not place authorization or reusable invitation tokens in email links
- Require verified email and MFA before showing the approved store, permissions, consent receipt, history, or comments
- Recheck the active store-scoped grant on every portal request
- Do not expose shopper-private data in the owner portal or notification content
- Audit notification result, first approved sign-in, installation handoff, and checklist progress

### Store Partner Pilot Support security

- Authorize each ticket/reply by submitting representative and assigned store scope
- Attach only allowlisted context: store/account identifiers, app version, timestamp, and basic device/browser details
- Never collect tokens, shopper data, precise location, or internal logs automatically
- Warn the owner and require preview before optional screenshot submission
- Show a plain warning to remove passwords, tokens, faces, messages, shopper data, and precise location; provide crop/redact before a final preview and confirmation. Re-encode, strip metadata, validate content/size, scan, and quarantine until safe; an Administrator may remove it immediately.
- Keep email notifications status-only; require authenticated portal access for content
- Treat fallback email as unverified intake and disclose no pilot data until identity verification
- Urgently alert the Administrator for security/privacy concerns without copying sensitive report content into email
- Audit ticket creation, replies, status changes, resolution confirmation, reopen, alerts, and attachment deletion
- Accept at most one previewed screenshot; sanitize it and prohibit arbitrary attachments
- Delete the screenshot from primary Storage 30 days after ticket closure or immediately on submitter/Administrator removal, whichever comes first; age it out of backups within 30 days. The text case may retain for two years, but no screenshot is copied into email, logs, audit payloads, or long-term case exports.

### Store content and social-link security

- Authorize hours, Store Update, media, and official-link writes by active representative grant and exact store scope on every request.
- Validate weekly hours, dated exceptions, store-local time zone, and publish state server-side. Treat address/time-zone change as controlled.
- Enforce Store Update type and lifecycle: Sale end date is required; archive is reversible; representative permanent deletion is denied.
- Treat all submitted URLs as hostile. Allow only HTTP/HTTPS supported-platform profile URLs, resolve and display the final destination, reject URL shorteners and embedded credentials, and strip known tracking parameters.
- Never accept or store social-network credentials or tokens for this feature. Do not scrape, embed, synchronize, or proxy a feed.
- A future Vendor Contributor role requires a separate authorization review. Do not provision it during MVP.

### Administrator review and Access & Safety security

- Query only operational review data needed for the selected item; never join or display shopper activity, trips, ratings, notes, or precise location.
- Enforce type-specific state transitions and reason requirements server-side. Administrators may approve, request changes, reject, or reply but cannot edit the submitted payload.
- Require MFA and recent authentication for access grant, revocation, regrant, onboarding approval, and other sensitive transitions.
- Recheck active store scope on every Representative request. Revocation takes effect on the next request even when the client session remains open.
- Revoke only the selected grant. Do not delete the account, approved Store Record, unrelated roles, consent, tickets, or privileged audit records.
- Record actor, target, exact scope, reason, before/after state, time, and result for every privileged attempt in append-only storage.
- D30 requires narrow `View Audit` access related to the selected grant or review. D31 full search/timeline UI and export are not approved; privileged audit events retain for two years.

### Break-glass emergency access

- Do not expose break-glass in normal Administrator navigation or permit it during Synthetic Internal Alpha.
- During Private Beta and Regional Public MVP, activate it only for a confirmed security or data-recovery incident. Routine support is not an incident.
- Require Administrator MFA, recent authentication, an incident ID, a plain-language reason, and an explicit user/resource scope before authorization.
- Grant read-only access by default, deny unrelated records, and expire the grant automatically after 30 minutes.
- Require approval by a second qualified Administrator when one is available. While Scott is the sole Administrator, keep break-glass disabled through Package 8/8B; only Package 9's enrolled independent reviewer path may later enable it and then requires review of the complete frozen audit record within 24 hours after access closes/expires and the packet freezes.
- Before sole-Administrator break-glass is enabled, complete Package 9 reviewer WebAuthn enrollment and approve the independent reviewer's identity/qualification and authenticated delivery path. Activation persists an absolute deadline no later than 24 hours after scheduled access expiry; early closure may shorten but never extend it. After access closes/expires, freeze the complete redacted least-privilege packet. Five minutes unfrozen disables further break-glass and raises the highest-severity alert while idempotent retry continues; packet or delivery delay never extends the deadline. Require signed completion by that deadline. Until this flow passes, break-glass remains disabled.
- Reviewer qualification: named adult security/privacy professional independent of the incident actor and daily Antique Trail operation, under confidentiality terms, with no production/database account. The reviewer receives only a one-use, read-only packet protected by phishing-resistant MFA and expiring after 24 hours; they never receive direct user-data or database access.
- Packet allowlist: incident ID/severity, requesting actor, approvals, plain reason, exact authorized resource/field scope, query/action names, record counts, start/expiry, access/denial results, notice status, and audit-chain hash. Redact user content and identifiers by default; include one exact field only when necessary to judge scope and record that necessity.
- Receipt: reviewer signs reviewer identity, packet hash, reviewed time, `Compliant` or `Exception`, exception detail, and follow-up ticket. Missing or exception receipt at 24 hours automatically disables further break-glass, raises a highest-severity alert to Product Owner/Security Owner, keeps the incident open, and requires a second independent review before re-enable.
- Notify each affected user when safe and legally allowed; record and justify any delayed or withheld notice.
- Write every request, approval, denial, access, and expiry to append-only hash-chained audit storage retained for two years and externally anchor its chain root under the audit-tamper contract.
- Never permit bulk export, role changes, deletion bypass, or expansion beyond the approved incident scope.

First Store Partner pilot:

- Use Synthetic Stores for the demonstration; do not create a real record during initial interest
- Obtain Store Partner Pilot Consent before creating a real store record or representative account
- Verify authority in person and through a published business contact
- Require owner-controlled verified email and MFA; prohibit shared credentials
- Audit consent, verification result, scope grant, withdrawal, and revocation without logging unnecessary identity evidence
- On withdrawal, revoke access and remove the real store from the active pilot
- Atomic Administrator approval creates the Pilot Store Record from the approved owner-submitted draft with provenance and verification date
- Deny anonymous/public access to the Pilot Store Record
- Permit only rights-confirmed Official Store Profile Photos submitted through the controlled-change workflow and approved after upload processing
- Exclude ratings/reviews, shopper/review photos, events, owner responses, and analytics

Verification options may include:

- Published business phone
- Business-domain email
- Postcard
- Business documents
- Trusted third-party source
- Manual review

A social-media account alone should not automatically grant ownership.

Directory data provenance:

- Accept Store Partner-confirmed listing data after the applicable consent and authority checks.
- Limit non-partner records to manually verified public facts: name, address, phone, hours, website, and categories.
- Preserve owner confirmation or source URL, verifier, and verification date.
- Do not copy descriptions, photos, or reviews without permission.
- Require written license review before scraping or bulk import.
- Do not persist Google Places content as the catalog. A place ID may be retained only for a separately approved live lookup that follows current provider and attribution terms.
- Treat conflicting sources, closures, and duplicate merges as reviewable, audited, and reversible changes. Duplicate merge is Administrator-only with MFA/recent-auth and exact preview; one transaction chooses a canonical store and reparents public references, saves, trip stops, reviews, provenance, and nonconflicting approved media without altering private ownership. Never reparent active grants or claimant authority. Quarantine or revoke noncanonical/conflicting claims and grants; replacement access requires normal authority reverification and a new audited exact-scope grant. A tombstone redirect and reversible merge ledger preserve rollback without silently reactivating grants; any failed reparent rolls back all changes.
- Track identity/location, contact, hours, categories/attributes, and media/social verification independently. Listing freshness is the oldest required core group among the first four; media/social is optional. Editing one group refreshes only that group. Treat required groups as current for 180 days. Corrections and closure reports trigger immediate review.
- From day 181 through day 365, warn that verification is overdue and exclude the listing from Open Now and automatic trip ordering.
- After day 365, hide the listing from normal discovery until every required core fact group is reverified; never automatically delete the record or provenance.

## API security

- Input schema validation
- Parameterized database access
- Strict CORS
- Secure headers
- CSRF protections when applicable
- Rate limits
- Request-size limits
- Output encoding
- Short-lived tokens
- Idempotency for critical writes
- Secret rotation
- No secrets in clients
- No private data in errors
- Server-side rating aggregation
- Server-side role assignment
- Server-side signed URL generation

### External Candidate Link fetching

- Fetch previews only from a narrow server-side service; clients never supply fetch credentials or service-role access.
- Accept a maximum 2,048-byte HTTP/HTTPS URL using only ports 80 or 443; reject embedded credentials and all other schemes/ports.
- Resolve A/AAAA server-side and reject the request when any candidate address is loopback, private, link-local, multicast, reserved, documentation, zero, metadata-service, or an IPv4-mapped form of those ranges. Connect to one pinned validated IP while preserving Host/SNI; re-resolve/revalidate and re-pin after each redirect. If the selected runtime cannot pin the destination, extraction remains disabled until a hardened fetch service is approved.
- Permit at most three redirects, two-second connect timeout, six-second total time, 1 MiB compressed body, 2 MiB decompressed body, `text/html` or `text/plain`, and 64 KiB retained extracted text. Fetch no script, CSS, image, frame, font, media, or other subresource.
- Strip authorization, cookie, proxy-authorization, Origin, and Referer on the first request and every redirect. Send no device location or account data. The fetch egress principal has no route to database, Storage, internal services, or cloud metadata.
- Do not log full private URLs or query strings in analytics, application logs, email, support records, or error messages.
- Parse as hostile input. Execute no remote script, render no active HTML, sanitize extracted text, and fetch no remote media in the first slice.
- Do not log in to Facebook or another private source, bypass access controls, or use the user's authenticated browser session. Preserve the link and return manual-entry fallback when content is unavailable.
- Rate limits are 10 attempts/account/hour, 30/IP/hour, 5/account/destination-host/hour, and 2 concurrent/account, plus the hard free-tier provider cap. Exhaustion preserves the private URL/note and opens manual entry.
- Store extraction status, source URL, retrieval time, and parser version. Label all extracted facts unverified and block every path from extraction to public publication.
- Enforce the approved verified-email recipient match, indistinguishable lookup response, `Pending`/`Accepted`/`Closed` sender statuses, recipient Block/Report controls, and account-enumeration resistance.

### Promotion and campaign security

- `public_promotion` remains false until Package 10B. Package 10A artifacts are private, access-controlled, `noindex`, absent from sitemap, and never distributed.
- Public flyer/Share QR codes contain only the canonical public URL plus an optional allowlisted opaque `src` code. They contain no invitation, account, email, store authority, location, bearer, or readiness token. Printed materials include a plain HTTPS fallback and artifact version.
- Channel-specific exact-store consent controls flyer placement, logo/co-brand use, and partner social posts separately. Withdrawal denies future use immediately; operations records removal request/confirmation without shopper data.
- Campaign measurement stores daily aggregate opens, Store Details opens, and Share actions only. No campaign cookie, persistent device ID, fingerprint, IP-derived identity, account linkage, precise location, or cross-site tracking. Opaque codes are random/allowlisted and reveal no store authority. Daily aggregates delete after 180 days; signed gate totals may retain three years.
- Treat QR substitution, fake flyer, consent replay, copy implying an unapproved partnership, referral-token leakage, promotion spam, and quota exhaustion as threats. A broken/substituted destination, withdrawn consent, stale listing, spam pattern, Blocking/privacy/security defect, or 75% forecast quota pauses the affected promotion. At 90% stop new promotion.

## Supply-chain security

Every change should pass:

- Type checking
- Unit tests
- Integration tests
- Authorization tests
- Static security analysis
- Dependency scanning
- Secret scanning
- License checks
- Infrastructure checks
- Migration review
- Build verification

Pin every GitHub Action to a full commit SHA. Workflow permissions default read-only and grant only exact job needs. Untrusted pull-request jobs receive no deployment/provider secret. Protected deployment environments require approval. CI verifies lockfile integrity, dependency/license review, secret scan, SAST, migration review, and build; it produces a CycloneDX SBOM and release-artifact digest. Package 10B verifies that the promoted digest is the tested digest. A mutable Action reference, excessive permission, fork-secret exposure, or digest mismatch blocks the package/release.

## Git and release controls

- Private repository during development
- Protected main branch
- Pull requests required
- Reviews required
- CI checks required
- No direct production deployment from a developer machine
- Separate development, test, staging, and production
- Production secrets only in deployment secret storage
- Traceable releases
- Rollback procedure

## Required pre-launch testing

- Threat model review
- Authorization matrix review
- OWASP ASVS-based review
- OWASP MASVS review for Android package — **POST-MVP; Android packaging is absent in Packages 1–10B**
- File-upload testing
- Account-recovery testing
- Review-abuse testing
- Business-claim testing
- Manual penetration test
- Backup restore test
- Incident-response exercise
- Accessibility testing
- Representative older-adult usability testing against the approved shopper journeys and pass thresholds

### SEC-01 independent public-release security gate

Before Package 10B, a named independent web-application security professional who did not implement Antique Trail and is not its daily operator signs confidentiality and scope. Test the current stable OWASP ASVS Level 2 controls applicable at the gate date plus this threat model/authorization matrix: anonymous and every authenticated role; direct Supabase REST/RPC/Auth/Storage/Edge access; RLS/definer functions; session registration/revocation; account lifecycle; invitation/token fragments; SSRF/geocoding/routing; uploads; public reviews/claims; case scoping; PWA cache/offline; headers/CSP; rate/quota abuse; CI/artifact promotion; recovery/revocation replay; and audit-anchor failure. Include authenticated and unauthenticated manual penetration testing in an isolated production-like environment with Synthetic data.

Critical, High, Medium, authorization/privacy/data-loss, or reproducible release-gate findings block 10B until fixed and independently retested. A Low finding may remain only with Product Owner and Security Owner signed risk, owner, compensating control, and deadline no later than 30 days; it cannot contradict a zero-defect gate. Evidence contains scope/version/dates, tester independence, test identities, sanitized requests/results, finding IDs/severity, remediation commit/artifact digest, retest result, and final `pass|blocked`; no raw token, credential, private content, or reusable exploit data enters the repository. Product Owner accepts the signed receipt; the implementer cannot self-certify.

### B-01 final public brand and domain gate

Before Package 10B, the Product Owner signs the final public product name and owned HTTPS domain. The receipt binds domain ownership/control; PWA `name`, `short_name`, `id`, `start_url`, scope, icons, and install copy; canonical/redirect URLs; Supabase/Auth/Access/SMTP redirect and origin allowlists; legal/privacy/support/security-contact naming; sitemap/robots/structured data; flyer/QR/social preview assets; and email sender identity. All must use one approved name/domain and pass TLS, CSP, callback, QR/plain-URL, install/upgrade, and stale-domain redirect tests. `Antique Trail` remains the working name until this receipt; an unapproved name/domain cannot pass 10B.

## External Testing Readiness

Before first-owner contact, retain dated evidence that:

- Solo Agent-Assisted Alpha and Two-Person Acceptance passed
- The complete authorization and security test set passed
- No Blocking Defect or known privacy, security, or data-loss defect remains open
- Backup restore and rollback rehearsals passed
- Pilot-environment monitoring, error reporting, and support intake work
- The pilot privacy notice and owner consent are ready
- One External Testing Dress Rehearsal passed end to end
- One full Private-Beta incident rehearsal passed
- Qualified professional evidence confirms the operating legal entity and required pilot insurance are active for owner contact and participation

The Primary Internal Tester approves every check. AI Test Agents may execute tests and collect evidence but cannot approve the gate. Any failed check blocks owner outreach, real-store import, and external participation.

## Operations

### Operational retention

- Application and error logs: 30 days
- Authentication and security events: 90 days
- Raw IP address, device fingerprint, and destination-host abuse telemetry: 30 days maximum; thereafter delete or irreversibly aggregate. Pseudonymous counters needed for security trend detection may remain 90 days and must not be reused for product analytics, advertising, personalization, or precise-location inference.
- Privileged Store Representative and Administrator audit events: two years
- Support and moderation cases: two years after closure
- Pilot Consent Receipts, authority verification, and role-grant history: three years after the relationship ends
- Rejected or quarantined uploads: 30 days
- Content-free deletion receipts: 31 days
- Never place shopper-private content in logs or audit events
- Securely delete or irreversibly de-identify each record when its period ends
- Legal review may require longer retention before external testing; shortening requires product-owner approval

Completed-trip location: never retain provider/device traces. Delete exact start and optional return coordinates from primary data within 24 hours after completed-trip synchronization; retain only an optional user-entered coarse label, store IDs/order, stop states, and user-authored private memory. Exclude purged coordinates from export and age them out of backups within 30 days.

Invitation lifecycle: never store raw tokens. Delete expired, cancelled, revoked, malformed, or consumed token hashes and payloads within 24 hours. Keep content-free Trip Partner status/actor/time for 90 days; accepted participation follows trip lifetime and deletes within 30 days after the applicable trip/account deletion request. Keep content-free Store Partner invitation history for three years after the relationship ends. Exports expose only the requesting user's visible status metadata, never tokens or verification evidence.

### Backups

- Follow ADR 0006 for the Vercel deployment boundary and ADR 0005 for retained Supabase/recovery controls. Database, Auth-related application state, Storage objects, capability configuration, deletion receipts, and revocation receipts form one matching recovery set; secrets never do. Encrypt before upload and restore only into an isolated disposable project during rehearsal.
- Shared Alpha/SLM-01 may use scheduled GitHub Actions logical exports only while two encrypted recoverable sets fit inside the 400 MB retained-artifact cap and usage stays below 1,500 minutes/month. A missed 24-hour backup closes the shared test window. Private Beta requires demonstrated four-hour backup cadence and eight-hour full restore; unreliable scheduling or incomplete Auth/Storage restoration stops external testing.
- No selected free mechanism proves the public 15-minute RPO. Regional Public remains disabled until an approved paid recovery configuration or independently proven `$0` equivalent passes.
- Automated
- Encrypted
- No recoverable database or Storage backup created or controlled by Antique Trail may retain deleted private content beyond 30 days
- Database and Storage recovery are separate; test both rather than assuming a database restore recovers or deletes Storage objects
- Preserve content-free deletion receipts outside the restored dataset for the backup window and reapply them before reopening a restored service
- Preserve the registration safety journal's encrypted write-ahead high-water outside the application database/backup rollback domain. Restore only to an unroutable target under a deployment-level registration fence; force registration mode `closed` and latch `draining`, replay/reconcile the journal plus deletion/revocation receipts, and keep all traffic/registration closed on any missing sequence, root mismatch, unknown provider effect, or nonterminal operation. Fence removal uses Package 2's pre-shared-stage Product/Security deployment-recovery signers, separate 30-minute one-use nonce, and exact environment/fence/backup/journal/operation-set/version binding; wrong/missing/revoked/colliding signatures, expiry, replay, mismatch, or unknown denies and records only a content-free external receipt. It may move only to `blocked`; ordinary signed quarantine clear is still required before `open`, and registration mode remains `closed`.
- Restore tested
- Internal Alpha: RPO 24 hours; RTO one business day
- Private Beta: RPO 4 hours; RTO 8 hours
- Regional Public MVP: RPO 15 minutes; RTO 4 hours
- Test database and Storage backup/restore separately before each stage gate; provider claims and database-only tests are insufficient
- Emergency export procedure

At 75% of a provider or stage quota, stop promotion and nonessential growth. At 90%, disable optional maps/routing/media/nonessential email before core account safety or deletion/revocation/support. Quota exhaustion must return a safe reason-neutral failure, commit no partial mutation, lose no data, and trigger no automatic charge.

### Monitoring

Detect:

- Login abuse
- Signup spikes
- Review spam
- Authorization failures
- Upload abuse
- API cost spikes
- Database failures
- Storage failures
- Administrative anomalies
- Background-job failures
- Stale business data

Do not log:

- Passwords
- Tokens
- Private notes
- Full private image URLs
- Candidate Link URLs and query strings
- Exact location history
- Sensitive verification documents

### Incident response

Required:

- Security contact
- Vulnerability intake
- Severity levels
- Credential revocation
- User notification process
- Store notification process
- Containment playbook
- Rollback and recovery
- Post-incident review
- Before first owner contact, complete a Private-Beta incident rehearsal covering detection, severity assignment, containment, credential/store-scope revocation, affected-user/store communication, database and Storage restore, deletion-receipt replay, status communication, and evidence review. A failed step blocks outreach.

External support commitments: publish a monitored support form/address and security contact before first-owner contact. Acknowledge security/privacy reports within four clock hours; acknowledge other Private Beta tickets within two business days and Regional Public MVP tickets within one business day. The release runbook names the primary on-call owner and backup and defines the in-PWA/status-channel message path for planned and unplanned incidents.

## User controls

- Export data
- Delete account
- Delete private photos — **POST-MVP; shopper/private-photo storage is absent in Packages 1–10B**
- Delete trip history
- Delete directly captured Candidate Links and recipient-owned Trip Ideas
- Revoke pending outbound Candidate Shares and block/report a sender
- Unblock a sender from privacy controls; this permits only future shares and never reopens a closed payload
- Leave an accepted one-trip partnership immediately; revoke the participant on the next request and pause Go when the leaving participant was Navigator
- Delete finds and collections — **POST-MVP; absent in Packages 1–10B**
- Leave household — **POST-MVP; absent in Packages 1–10B**
- Revoke household members — **POST-MVP; absent in Packages 1–10B**
- Manage public reviews
- Manage personalization — **POST-MVP; absent in Packages 1–10B**
- Manage location permission
- Manage notifications — **POST-MVP; essential transactional status email preferences only in Regional MVP**

## Legal and trust documents

Before public marketing:

- Privacy policy
- Terms of service
- Community guidelines
- Review policy
- Store-owner terms
- Photo and copyright policy
- Data deletion policy
- Data export policy
- Analytics disclosure
- Vulnerability disclosure policy
- Support contact and dispute process
