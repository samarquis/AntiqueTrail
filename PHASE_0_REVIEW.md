# Phase 0 Product, Security, and Architecture Review

Status: historical 2026-07-30/31 product, security, and architecture review. Its threat model, authorization matrix, and accepted decisions remain supporting references where not superseded, but its pre-coding readiness conclusion is not current implementation state. Use `PROJECT_STATE.md` for current status. D31 full Audit History UI and export policy remain unresolved; two-year append-only privileged-audit retention is approved.

## 1. PRD review

### Contradictions and scope conflicts

| Conflict | Source | Required resolution |
|---|---|---|
| ~~Public ratings and reviews are required for MVP, but their inclusion in the first private beta was unresolved.~~ | `PRD.md` MVP; `PRODUCT_DECISIONS.md` staged release gates | Resolved: Private Beta excludes public UGC; Regional Public MVP adds text-only ratings/reviews after moderation and abuse controls pass. |
| ~~Trip planning and reviews were assigned to separate phases without a collective MVP boundary.~~ | `PRD.md` MVP; `IMPLEMENTATION_PLAN.md` package roadmap | Resolved: Regional Public MVP requires Packages 1–10B plus every named gate; Package 11 is postlaunch RG-01. |
| ~~Map required personal match indicators while personalization was deferred.~~ | `PRD.md` Trail Map; `IMPLEMENTATION_PLAN.md` Phase 5 | Resolved: match indicators and match-aware planning are explicitly after Phase 5 and excluded from Regional Public MVP. |
| ~~Store profiles “must support” public photos, but the MVP deferred every photo type.~~ | `PRD.md` Store details and MVP; `IMPLEMENTATION_PLAN.md` Phase 2 | Resolved: approved Official Store Profile Photos are included; shopper/review photos and owner responses remain deferred. |
| ~~Claim intake, verification, and owner publishing authority were not separated.~~ | `PRD.md` MVP; `PRODUCT_DECISIONS.md` publishing split | Resolved: first-pilot plus scalable risk-tiered two-signal verification, annual/risk recheck, transfer/conflict review, and scoped revocation are approved. |
| ~~Find capture had an MVP success metric while Phase 4 was deferred.~~ | `PRD.md` MVP and Success metrics; `IMPLEMENTATION_PLAN.md` Phase 4 | Resolved: Find capture and its MVP metric are deferred. |
| ~~Regional strategy named several launch candidates without one approved geography.~~ | `PRD.md` Regional launch; `PRODUCT_DECISIONS.md` | Resolved: Topeka city limits is first; later communities follow gated expansion. |
| ~~Precise location must not be shared, but routing requires sending locations to a provider.~~ | `SECURITY_AND_TRUST.md` Location privacy; trip requirements | Resolved: permit disclosed, minimized provider processing only for a user-requested route; no background tracking or precise-location logs. |
| ~~Household revocation must be immediate, but downloaded or offline data cannot be remotely recalled.~~ | `PRD.md` Household sharing; `SECURITY_AND_TRUST.md` Authorization | Resolved for current scope: households are post-MVP and unimplemented; any future package must use immediate server revocation, local purge, and disclose already-downloaded residual risk before approval. |

### Missing launch requirements

1. ~~Review identity, eligibility, anonymity, conflict disclosure, account-deletion effect, and aggregation rules.~~ Resolved in PRD/Product Decisions/Security.
2. ~~Moderation standards, evidence access, appeals, and legal escalation.~~ Resolved; service acknowledgements are approved and legal escalation remains a release-runbook implementation of the approved policy.
3. ~~Business-claim creation, verification, transfer, expiration, revocation, and disputed-control workflow.~~ Resolved as risk-tiered manual verification; package tests still prove it.
4. Package 5B's exact suggestion algorithm is approved. Only R-01 provider/version/terms/attribution/fixtures and provider-specific live traffic/temporary-market semantics remain gated. Package 5A is manual-order, provider-free `Review Hours` and states that travel time is not included.
5. ~~Offline data boundary, local retention, logout purge, sync conflicts, and multi-device behavior.~~ Resolved: encrypted minimum storage, one active Navigator device, server-authoritative ordered idempotent replay, explicit private-field conflict choice, and purge/revocation behavior are approved.
6. ~~Private-content, inactive-account, operational-record, deletion, backup-aging, recovery, completed-trip location, Candidate Share evidence, and invitation lifecycles.~~ Resolved.
7. ~~Accessibility conformance, browser/device matrix, older-adult cohort, bounded-slice performance, and public availability target.~~ Resolved.
8. ~~Stage recovery objectives, support coverage, incident contacts, rehearsal, and status communication.~~ Resolved.
9. ~~Minimum age and launch country.~~ Resolved. Optional analytics remains off until provider/consent ADR; transactional email/provider processing is a Package 6 external-use gate.
10. ~~Duplicate-store merge preservation.~~ Resolved with atomic reparent, quarantine, tombstone, audit, and rollback rules.
11. ~~Export format and deletion verification.~~ Resolved. Compromised-account recovery is part of Package 2's exact auth/session contract before coding.

## 2. Security and privacy plan review

### Strong foundation

- Clear public, private, and sensitive-operational classifications; household-shared is labeled future-only and absent from Packages 1–10B.
- Deny-by-default authorization at database, storage, server function, and admin boundaries.
- Server-owned role assignment, rating aggregation, and signed private-media access.
- Separate upload buckets, EXIF removal, content validation, re-encoding, rate limits, and moderation.
- MFA for privileged roles, release controls, backup/restore testing, monitoring, and incident response.

### Required additions before dependent implementation or release

- Define exact RLS and storage invariants, including views, RPCs, `security definer` functions, non-exposed schemas, and service-role boundaries.
- Keep administrative users out of shopper-private data by default. Enforce the approved incident-only break-glass policy outside normal Administrator workflows.
- POST-MVP reference only: any later household design must check active membership on every request and never copy ownership into client-controlled fields; Packages 1–10B create none.
- Treat signed URLs as bearer credentials: short expiry, no analytics logging, no service-worker caching, and revocation limits documented.
- Quarantine uploads before publication; reject active formats such as SVG; enforce decoded-pixel and archive-bomb limits.
- Define browser session storage, CSP, XSS defenses, session rotation/revocation, recent-auth operations, and recovery notifications.
- Disclose routing-provider processing of start, stop, and destination coordinates. Send minimum required data and never persist provider payloads by default.
- Separate public caching from encrypted authenticated IndexedDB state; bind the minimum Navigator snapshot to account/install and enforce the approved completion, account-switch, logout, and revocation purge behavior.
- Make audit records append-only to application roles; define retention, access, anomaly alerts, and clock/source integrity.
- Set per-user/IP/device quotas and spend limits for authentication, reviews, uploads, routing, and notifications.
- Define deletion from primary data, derived data, logs, provider systems, and backups.

Assessment: controlling policy is complete for the bounded first slice and approved package contracts. Named external provider gates, paid public recovery/domain, legal/business/human capacity, D31, and post-MVP features remain explicit gates or exclusions; the Package 5B algorithm itself is approved and may not be reinvented.

### Development-readiness conclusion

The plan is ready for the bounded first development slice: local React/TypeScript/Vite PWA foundation, local Supabase migrations and deterministic Synthetic Store seed, anonymous Store Browser and Store Details, the Age-Inclusive Usability Baseline, automated tests, and CI. `IMPLEMENTATION_PLAN.md` now defines its runtime/data path, minimum schema, RLS boundary, failure states, test coverage, performance budgets, sequencing, stop conditions, and rollback.

Remaining provider, paid public recovery/domain, named-human, exact expansion-community, legal/business, D31, and post-MVP decisions gate only their named package or release. Public-review policy, external cohort, lifecycle, browser, support, and regional readiness requirements are resolved. No application code, external contact, real-store data, public deployment, or product promotion is authorized by this conclusion.

## 3. Threat model

### Assets

- Accounts, sessions, recovery factors, and privileged roles.
- Private Candidate Links, Candidate Shares, Trip Ideas, ratings, notes, trips, and location-derived data; preferences, finds, collections, and shopper images are post-MVP assets only.
- Public catalog, reviews, ratings, claims, and store status integrity; owner responses are a post-MVP asset only.
- Business-verification evidence, moderation cases, fraud signals, audit records, and secrets.
- Service availability, provider quotas, and operating budget.

### Trust boundaries

1. Browser/PWA ↔ Supabase Auth, Database, Storage, and Edge Functions.
2. Edge Functions ↔ mapping/routing, email, scanning, and future analytics providers.
3. Public/authenticated app ↔ moderator and administrator capabilities.
4. Store-data imports ↔ external data sources and manual verification.
5. Service worker/local storage ↔ signed-out users and shared devices.
6. App ↔ Waze and Google Maps deep-link handoff.
7. Candidate Link fetch service ↔ arbitrary external websites and redirects.

### Priority threats and controls

| Priority | Threat | Required controls | Residual risk |
|---|---|---|---|
| Critical | Cross-user private-data access through missing RLS, leaky views/RPCs, storage paths, or service-role use | Deny-by-default policies; non-exposed operational schemas; stable owner IDs; authorization tests for every table, view, RPC, function, and bucket | Policy regression remains possible; CI and pre-release tests are mandatory. |
| Critical | Candidate Share reaches the wrong user, enables account enumeration, or becomes a bridge into sender/recipient private data | Server-side verified-email match to recipient ID; indistinguishable matched/unmatched/blocked responses; authenticated recipient check on every read/write; accept/dismiss/block/report state machine; recipient-owned copy on acceptance; no ownership propagation; denial and rate-limit tests | Compromised recipient accounts can read correctly addressed shares; timing regressions may reintroduce enumeration, so pre-release tests remain mandatory. |
| Critical | One-trip invitation or role assignment exposes another trip, private note, or Go control | Verified-email-bound, single-use seven-day invitation; one-trip grant; author-private visit data; one active Navigator; server checks on every read/write; immediate removal and Go pause when Navigator is removed | A compromised invited account can use its legitimate trip access until removed. |
| Critical | Role escalation or business-claim hijack | Server-only role changes; MFA and recent auth; multi-channel/manual claim evidence; audited grant/revoke; no role fields writable by clients | Social engineering and compromised business channels. |
| High | Photographed, stolen, replayed, or phished Store Partner Invitation, or forwarded activation email | Opaque high-entropy invitation token; hash-only storage; 30-minute/single-consumption expiry; atomic provisional consent/pending identity; revocation; rate limits; verified email; MFA; independent authority verification; separate Administrator approval; status-only activation email with normal sign-in and no bearer credential | A stolen invitation may cause nuisance and a forwarded email may aid phishing, but neither grants pilot access by itself. |
| High | Administrator silently alters owner-submitted store data or partial approval creates a store without the matching role scope | Owner-controlled Pilot Store Draft; comment-and-resubmit review; exact final preview; immutable approved snapshot; atomic Pilot Store Record plus scoped-role grant; complete audit | A compromised Administrator can still approve false data; provenance, reversal, and review evidence remain required. |
| High | Pilot support diagnostics, screenshot, or fallback email leaks tokens, shopper data, location, or internal logs | Diagnostic allowlist; owner screenshot preview; re-encode/metadata strip; authenticated ticket details; status-only email; no sensitive fallback-email response before identity verification | Owners may still submit sensitive content manually; warnings, deletion controls, and Administrator handling rules are required. |
| High | Store owner accesses private shopper data or alters criticism | Store-scoped grants; separate owner-response records; no review/private-data policies for owners; moderation appeal path | Legal/support pressure must not become ad hoc access. |
| High | Representative publishes unsafe media, deceptive links, expired sales, or content outside assigned store | Exact store scope; direct-versus-review state machine; quarantine/re-encode/metadata strip; image hold; supported-domain validation; reversible update archive; no social credentials or feed sync | Approved external social profiles can later change or be compromised. |
| High | Rating manipulation, review spam, and coordinated abuse | Unique active-review constraint; server aggregate; rate limits; verified accounts; anomaly signals; reports; moderation history | Sybil accounts cannot be eliminated completely. |
| High | Location leakage through logs, analytics, provider calls, or trip history | Explicit while-in-use permission or manual start; user-requested route only; named-provider disclosure; minimum necessary coordinates; no precise coordinates in analytics/logs/email/support; no background tracking or raw movement history; private saved trips; deletion and retention controls | The selected routing provider necessarily receives requested route coordinates and may retain them under its own disclosed terms. |
| High | Private data exposed, corrupted, or incorrectly authorized through offline caches, retries, or multiple devices | Navigator's current trip only; encrypted account/install-bound IndexedDB; one active Navigator device; exact-once ordered replay; server authorization/state precedence; explicit private-field conflict choice; post-sync completion/account-switch/logout purge; reconnect reauthorization | Previously decrypted data cannot be remotely recalled; a disconnected old device may record actions that the server later rejects; malicious same-origin code or a compromised unlocked device can still access local data. |
| High | Malicious upload, EXIF/GPS leak, decompression bomb, unsafe public content, or unlicensed Official Store Profile Photo | Private quarantine; store-scoped submission; documented rights; content sniffing; re-encode; metadata strip; decoded-pixel limits; malware scan; meaningful alternative text; Administrator approval before publication | Copyright, harmful-content, and misleading-image disputes require process, not only technical controls. |
| High | Session theft, XSS, or account-recovery takeover | Strict CSP; output encoding; dependency controls; managed session rotation/revocation; recovery rate limits; account-change alerts; recent auth | Compromised user devices remain outside application control. |
| Critical | Direct Supabase signup bypasses invite-only Alpha/Beta admission and exhausts free Auth/email quota | Provider anonymous signup disabled; server-owned closed/receipt-only/public mode; application Edge Function consumes one exact admission receipt; Package 10B-only public transition; direct-endpoint and quota-abuse tests | Provider misconfiguration can reopen signup; promotion receipt and continuous config checks must fail closed. |
| High | Moderator/admin misuse or compromised privileged account | Least privilege; required MFA; separate admin actions; append-only audit; anomaly alerts; break-glass procedure | Trusted-insider risk remains. |
| High | Access revocation appears successful while an open Representative session can still write | Server rechecks active exact store scope on every request; MFA/recent-auth revocation; next-write denial test; scoped regrant; append-only audit | Already downloaded public/pilot-readable data cannot be remotely recalled. |
| High | Store-data poisoning, false closure, stale hours, or duplicate merge damage | Owner-confirmed facts or manually verified official public facts only; source URL/confirmation, verifier, and verification date; 180-day verification window; overdue warning and hours-dependent feature exclusion through day 365; then hide until reverified; immediate correction/closure review; no unlicensed scraping/bulk import; no stored Google Places catalog; audited edits; reversible merges | Official public sources and owners can still be wrong, compromised, or change before the 180-day window ends. |
| High | Candidate Link fetch causes SSRF, DNS rebinding, redirect abuse, decompression/response exhaustion, malicious preview content, or leakage of secret-bearing URLs | Server-only isolated fetcher; HTTP/HTTPS allowlist; public-IP validation before request and after redirects; DNS-rebinding defense; strict time/redirect/size/decompression/content limits; no cookies/auth/referrer; no script/active HTML/media; URL/query redaction from logs; rate limits | Public sites can still return deceptive or harmful text; all extracted values remain unverified and user-reviewed. |
| High | Candidate Link or extracted metadata is mistaken for verified/public store or event data | Private classification; persistent source/extraction status; explicit unverified labels; manual confirmation; no direct write path to public catalog/events/claims; synthetic-source testing before real data | Users may still trust a source that is stale or false; visible provenance and warnings reduce but do not remove judgment risk. |
| High | API-cost or availability denial of service | Edge rate limits; quotas; caching of public data; provider budgets/alerts; request-size limits; graceful provider failure | Regional events can still create legitimate spikes. |
| Medium | Secret/service-role leakage or compromised provider webhook | Server-only secret storage; narrow functions; secret rotation; authenticated webhooks; environment separation | A privileged function compromise has broad impact. |
| Medium | Incomplete deletion through logs, backups, derived aggregates, or providers | Data inventory; deletion workflow; backup expiry; provider deletion terms; verification receipt | Immediate removal from immutable backups is generally impossible. |
| Medium | Supply-chain compromise | Lockfiles; minimal dependencies; scanning; protected branch; reproducible build; reviewed updates | Scanners do not prove package safety. |
| Critical | Free-tier pause/quota/billing surprise causes data loss or unsafe degradation | ADR 0005; no overage/auto-upgrade; 25% headroom; 75% pause/90% optional-feature degradation; full DB/Auth/Storage restore; hard public-release block when 15-minute RPO is unproved | Startup availability may be interrupted; the affected test/release stops instead of weakening controls. |
| Critical | Stolen refresh token remains usable after application/provider revoke | Dedicated IndexedDB adapter; application active-session registry checked on every private/privileged path; application revoke first; provider outbox; cache denial tests | Same-origin XSS can steal a live bearer before revocation; CSP/supply-chain controls remain critical. |
| High | Claim concurrency or reused authority signal creates two active owners/scopes | Partial unique constraints; authority-root lock; distinct channel classes/events; one grant/store and one store/Representative; named transfer transaction; no uploaded claim documents | Manual verification can be socially engineered; high-risk conflict remains human-reviewed. |
| High | Audit rows are changed or external root publication stops | Runtime append-only function; hash chain; L-01 separately administered root sink daily/1,000 events; privileged mutation disable after 24-hour missed root | A compromise spanning database and separate sink/control plane may evade detection. |
| Critical | Readiness or Pilot records become public through a broad capability toggle or partial catalog transition | Exact frozen store-ID set; signed receipt; atomic `regional_readiness`→`public` transaction; provenance/freshness/rights/private-field rechecks; whole-set rollback; anonymous projection denial tests | An approved public fact can later become stale; ongoing freshness/closure controls remain required. |
| High | Fake/substituted flyer QR, withdrawn consent, spam, or tracking leaks authority/private identity | Ordinary canonical QR with plain URL; channel-specific consent/withdrawal; opaque aggregate-only source code; no token/cookie/device/account/location; Package 10B gate/stop rules | Printed material cannot be remotely recalled; removal/reprint controls mitigate but cannot erase copies. |

## 4. Authorization matrix

`Own` means the authenticated user owns the row. `Named recipient` means one authenticated account ID stored server-side on one Candidate Share; it grants access only to that share. `Explicitly shared user` means either the one accepted Trip Partner for one trip or a future active household grant for a resource that explicitly supports it. `Business` means a currently verified claim covers that store. A Pending Partner Identity owns only its onboarding record and is not a Verified business owner. All unspecified access is denied.

| Resource/action | Anonymous | Authenticated owner | Explicitly shared user | Verified business owner | Moderator | Administrator | Trusted service |
|---|---|---|---|---|---|---|---|
| Account registration/admission | Direct provider signup denied; application function only | Existing account only | Existing account only | Existing account only | Existing reviewer capability only | After bootstrap, may issue exact test/partner/readiness receipt under stage rules with MFA/recent-auth; cannot bypass mode | Deployment service may issue one signed exact-email initial-Administrator admission before any account exists; otherwise default closed, shared stages consume one verified-email-bound receipt, and Package 10B alone enables public application registration |
| Approved store/profile/hours read | Read | Read | Read | Read | Read | Read | Read |
| Pilot Store Record read | None | Initial Private Beta invited shopper accounts only | None | Assigned Pilot Store Record only | Deferred during Private Beta | Read | Enforce cohort/scope |
| Regional readiness listing read | None | Exact matching-email invitee with active 30-day readiness grant only | None | Assigned verified claim only | None | Read for evidence work | Enforce `regional_readiness` audience on catalog/map/search; deny public cache/index/provider projection; revoke/expire next request |
| Store Partner Invitation generate/revoke | None | None | None | None | None | Generate/revoke with MFA and recent auth | Create hash/expire/consume |
| Partner onboarding/provisional consent/status | Valid invitation may submit one application-atomic token/consent/pending-identity request only | After separate verified Auth/MFA binding, Pending Partner Identity reads/updates own onboarding only | None | Read own approved status | None | Exact assigned verification; never edit consent | Consume/create application record; separately bind current Auth identity; apply only approved grant |
| Pilot Consent Receipt | None | Pending Partner Identity reads own finalized receipt after email/MFA | None | Read own receipt | None | Read only; no update/delete | Finalize once, version, deliver; no update/delete |
| Pilot Store Draft | None | Pending Partner Identity creates/reads/edits own draft while draft or changes-requested; submits/resubmits | None | Read approved snapshot after grant | None | Read/comment/return/approve; no field edits | Validate transitions; atomically create store and scoped grant |
| Pilot Support Ticket | None; fallback email creates unverified intake only | None during Initial Private Beta | None | Create/read/reply/reopen own tickets for assigned store | None | Read/reply/resolve; urgent security triage | Attach allowlisted context; notify; sanitize media |
| Candidate Link / Candidate Share / Trip Idea | None | Sender addresses verified email and sees only Pending/Accepted/Closed; matched recipient reads/accepts/dismisses/blocks/reports within 30 days and owns accepted Trip Idea; neither reads the other's unrelated data | None; no household grant implied | None | None | None by default | Resolve recipient without enumeration; enforce block/rate limits; expire and delete unaccepted payload; create recipient-owned copy; never publish |
| Trip Partner invitation | None | Trip Creator creates/cancels one verified-email-bound invitation and removes accepted partner | Named matching recipient accepts once within seven days; no data before acceptance | None | None | None by default | Hash/expire/consume; apply one-trip grant |
| Shared trip draft/progress | None | Trip Creator reads/edits draft; controls Go only when Navigator on active device | Accepted Trip Partner reads/edits that draft; controls Go only when Navigator on active device | None | None | None by default | Enforce participant/Navigator/device state; replay authorized offline mutations exactly once in order |
| Authored trip rating/note | None | Own only | None, including other trip participant | None | None | None by default | Narrow sync/export/delete only |
| Store correction report | Draft only; no write | Authenticated create/read own reason-neutral status | Same as user | Create for exact store/read own status | Assigned case only | Exact assigned case/field allowlist | Validate/rate-limit/notify |
| Public store data write | None | None | None | Directly publish Representative-Managed Fields for assigned store; submit Store Change Requests for Controlled Store Fields | Deferred during Internal Alpha/Private Beta | Review/approve Store Change Requests | Validate/apply approved transitions |
| Store Update / official social link | Read approved | Read approved | Read approved | Assigned store only; text and supported links direct; image-bearing update held for review | Deferred during Internal Alpha/Private Beta | Review image/reject/request changes; no payload edit | Validate type/date/domain/scope; process media; archive reversibly |
| Approved review/rating read | Read | Read | Read | Read | Read | Read | Read |
| Review create/edit/delete | None; all routes absent before public stage | Own only after stage/eligibility; one active review/store; own edit/delete/appeal | Own review only | Never own scoped store; disclosed connected review excluded from aggregate | Future delegated hide/restore only; never impersonate author | Initial-launch case-scoped Hold/Remove/Restore/Dismiss with MFA, recent auth, reason, and audit | Enforce stage/eligibility; aggregate and audit in same transaction |
| Review appeal | None | Author submits once within 30 days; reads reason-neutral status | None | Exact-store Representative submits once; no reporter/fraud/private-account evidence | Future different reviewer only | Different Administrator adjudicates; initial moderator denied; with one Administrator use case-scoped independent-reviewer contract below | Issue/revoke single-case capability; apply signed decision transactionally; append audit |
| Feature restriction and appeal | None | Subject reads own general notice/scope/end/status and submits one appeal | Same as authenticated owner only for own restriction | Same as authenticated owner only for own account; no store-wide authority | Enrolled independent reviewer may decide only an assigned exact appeal with WebAuthn | Exact-case Administrator with MFA/recent-auth imposes; a different Administrator decides appeal; original actor denied | Enforce/expire exact feature/store scope; issue/revoke case capability; append audit; never create global suspension |
| Owner response | None during MVP | None during MVP | None during MVP | None during MVP | None during MVP | None during MVP | Feature disabled until post-MVP approval |
| Official Store Profile Photo | Read approved | Read approved | Read approved | Submit/read own store-scoped change request; no direct publish | Deferred during Internal Alpha/Private Beta | Review/approve/reject | Quarantine, validate, re-encode, strip metadata, publish approved derivative |
| Pending shopper/review photo | None | Deferred until after Regional Public MVP | None | None | Deferred | None until workflow approval | None until workflow approval |
| Private profile/preferences/saves/personal ratings/notes | None | Full own | None unless resource explicitly shared | None | None | None by default | Narrow maintenance only |
| Private trips | None | Full own | Read/update one accepted trip only | None | None | None by default | Narrow maintenance/export/delete only |
| POST-MVP finds/collections | No Packages 1–10B route/schema/grant | No Packages 1–10B route/schema/grant | No Packages 1–10B route/schema/grant | None | None | None | Do not scaffold |
| Private media/signed URL | None | Shopper/private media is post-MVP and absent | No shopper sharing | Own business-upload evidence only after M-01 | Assigned moderation evidence only | Incident-only break-glass; exact scope, read-only, 30 minutes | Generate after authorization check |
| Break-glass request/review | None | None | None | None | Enrolled reviewer reads one redacted exact-case packet and submits `Compliant|Exception` only | Confirmed incident request with MFA/recent-auth; second Administrator approves when available; sole-admin path disabled until Package 9 reviewer is preassigned | Enforce 30-minute scoped read, issue/revoke one-case reviewer capability, expire/alert at 24 hours, append audit; no routine navigation |
| POST-MVP household membership | No Packages 1–10B route/schema/grant | No Packages 1–10B route/schema/grant | No Packages 1–10B route/schema/grant | None | None | None | Do not scaffold |
| Business claim/status | None; route absent before 10B | Create/read own reason-neutral status after stage/MFA | None | Read own exact verified claim/request changes | One assigned appeal packet only | Exact assigned store/claim/signal; no sibling/bulk | Verify distinct signals/cardinality; apply exact grant/transfer |
| Claim authority evidence | None | Submit content-free signal/read own status; no document upload | None | Own status only | One assigned appeal packet | Exact assigned signal/result; no fraud/sibling evidence | Record callback/mailed code/filing/in-person result; no raw document |
| Moderation report/case | None | Authenticated create; own reason-neutral status | Same as user | Create for exact store; own status | One assigned appeal packet only | Exact assigned case/field allowlist; no sibling/bulk/reporter/fraud access | Trusted queue/notify/retain only |
| Promotion consent/artifact | Read public artifact after 10B only | Read public artifact | Same | Exact-store consent/withdraw for flyer/logo/social channel | None | Prepare/removal task only | Enforce capability/consent; aggregate-only campaign count |
| RG-01 evidence/signature | None | Own RG-01 consent/withdraw only; no totals | None | Exact-store flyer consent/withdraw only | None | Operations prepares; Administrator role alone cannot sign; exact ProductOwner evidence responsibility may pass/reject only the frozen packet | Derive/freeze/purge linkage; issue one-use exact-digest decision capability; pass only on passing predicates |
| Community Expansion Gate decision | None | None | None | Exact-store public/portal rights only; no gate decision | None | Administrator/ProductOwner alone cannot decide; exact PrimaryInternalTester evidence responsibility passes/rejects the frozen current-area packet | Enforce failed-pass denial, authenticated rejection, exact prior-area receipt, and no automatic next-area/public transition |
| Audit records | None | None | None | None | Read own moderation-action subset | Narrow D30 View Audit; D31 full search/export unresolved | Append only; no application-role update/delete |
| Aggregate public rating | Read | Read | Read | Read | Read | Read | Write/rebuild only |
| Role grants and scopes | None | None | None | None | Deferred during Internal Alpha/Private Beta | Grant/revoke/regrant exact store scope with MFA, recent auth, reason, and consequence preview | Recheck every request; deny next write after revoke; append audit |
| Seed import/duplicate merge | None | None | None | None | Propose/review facts, source evidence, and license status | Approve only provenance-complete, fact-only, licensed input | Validate approval; execute; record provenance and rollback data |

The independent appeal reviewer is a temporary capability principal, not a reusable application role. Before public reviews are enabled with only one Administrator, record a qualified independent adult under confidentiality terms. Trusted service issues one random, hashed, single-case capability after verified identity and phishing-resistant MFA; it expires at the earlier of decision submission or 24 hours after first access and can be revoked immediately. The packet contains only the challenged review text, public store context, rule/reason, prior decision, appeal text/evidence, and content-free case/version identifiers. It excludes reporter identity, email, exact visit time, trip/location/note/account history, fraud signals, unrelated cases, and direct database access. The reviewer submits `Restore` or `Uphold` plus a plain reason; the service validates the capability, applies the decision and aggregate change transactionally, expires the grant, and appends reviewer identity, packet hash, decision, reason, and result. The initial moderator/Administrator cannot use or approve that capability.

Break-glass access is disabled during Synthetic Internal Alpha. During Private Beta and Regional Public MVP, it is allowed only for a confirmed security or data-recovery incident, never routine support. It requires Administrator MFA, recent authentication, an incident ID, a plain-language reason, exact scope, read-only default, and automatic expiry after 30 minutes. A second Administrator approves when available; while Scott is the sole Administrator, activation requires independent review within 24 hours. Notify affected users when safe and legally allowed. Keep every attempt immutable for two years. Bulk export, role changes, deletion bypass, and unrelated-data access remain prohibited.

Break-glass uses a deny-by-default server allowlist; it is not a general Administrator bypass:

| Incident resource | Maximum temporary read scope | Always prohibited |
|---|---|---|
| Candidate Link/Share/Trip Idea | Exact incident-linked record and minimized metadata needed to confirm exposure or recovery | Other shares/ideas, raw reusable tokens, unrelated recipient activity |
| Private profile/save/rating/note | Exact affected user, record, and named fields required by the incident | Browsing history, other saves/notes/ratings, bulk profile export |
| Private trip/progress/offline state | Exact affected trip/device/event chain | Other trips, unrelated participant data, background movement history |
| Private media | Exact object and authorization/provenance metadata | Bucket listing, unrelated objects, permanent signed URL |
| Authentication/security/audit | Exact actor/session/event/incident time window | Passwords, MFA secrets, passkey private material, raw session or invitation tokens |
| Claim/verification/pilot support | Exact store/claim/ticket tied to the incident | Other stores, unrelated partner contact or evidence |

Every activation must identify one or more allowlist rows, exact record identifiers, allowed fields, and expiry. Authorization tests prove allowed reads and denied sibling/unrelated reads. Break-glass remains disabled until the sole-Administrator independent-review process in `SECURITY_AND_TRUST.md` is approved.

## 5. Recommended regional public MVP

### Include

- One contiguous, store-dense metro or corridor with manually verified seed data, provenance, and freshness status.
- List-first anonymous Store Browser, search, optional map, filters, store profile, approved Official Store Profile Photos, hours/exceptions, closure state, last verified date, and correction reports.
- Native Store Updates, validated official social profile links, and authenticated `New Since Your Last Visit`.
- Managed authentication with verified email; private saved stores, personal ratings, and visit history.
- Private Candidate Link capture, recipient-specific Candidate Share, recipient-owned Trip Ideas, unverified source-aware extraction, and manual fallback; no automatic public store or Event creation.
- Explicit trip creation/selection, progressive Plan, explained Check My Day warnings/order choice, one Trip Partner, Navigator-only Go, manual arrival, private visit memory, summary/history, and one-leg Waze/Google Maps handoff.
- Offline recovery of the current active trip only.
- Text-only public star ratings/reviews, one active review per user/store, edit history, reporting, rate limits, server aggregation, and a minimal moderation queue.
- Claim intake/manual verification, Store Portal direct-versus-reviewed publishing, hours, images, updates/social links, support, and Administrator review/Access & Safety.
- Account export/deletion, privacy controls, audit logging, monitoring, tested backup restore, incident workflow, authorization tests, WCAG 2.2 AA review, and representative older-adult usability testing.

Private beta may disable all public user-generated content. That beta does not satisfy the PRD's public MVP until reviews and moderation are enabled and proven.

### Defer

- Household sharing.
- Finds, purchases, collections, partner voting, and insurance values.
- Shopper/review photos and their image-moderation workflow/provider.
- Public Events, owner responses, engagement analytics, advertising, and paid features.
- Push notifications.
- Preference onboarding, match indicators, advanced personalization, behavior-based learning, and similar-store recommendations.
- Android packaging, AI identification/appraisal, marketplace, embedded/synchronized social feed, Vendor Contributor role, and national expansion.

## 6. Approved implementation architecture and repository structure

### Runtime architecture

- One React/TypeScript/Vite PWA. Public, authenticated, business-intake, moderator, and admin routes remain one deployable until isolation or release cadence proves a second app useful.
- Supabase Auth for identity; PostgreSQL for public/private/operational records; Storage for quarantined public submissions and private media; Edge Functions for privileged or provider-facing operations.
- Direct client database access only for simple RLS-protected reads and owner-scoped writes.
- Edge Functions own role changes, business claims, moderation transitions, rating aggregation/rebuild, signed URLs, imports/merges, and routing-provider calls.
- Sensitive operational records live in non-exposed schemas. Every exposed table, view, function, and bucket receives deny-by-default policy tests.
- Store hours use store-local weekly rules and dated exceptions with an IANA time-zone identifier. Trip instants are stored in UTC.
- Package 5A is provider-free: the shopper controls order and receives hours-only readiness warnings; no suggested route order is produced. Package 5B requires an accepted routing ADR before a named provider supplies minimized travel-time data. Its approved exhaustive one-to-eight-stop scoring is defined in `PRODUCT_DECISIONS.md` and `PACKAGE_CONTRACTS.md`; it must explain warnings, preserve manual order unless chosen, and never promise real-world optimality. Only the provider remains gated.
- Service worker caches shell/versioned static assets only; every API/RPC is no-store during startup. Current active trip is the only private offline dataset, under the 36-hour grant/seven-day purge contract.
- Historical note: ADR 0005 originally selected Cloudflare Pages Free. ADR 0006 supersedes that frontend choice with Vercel prebuilt deployment while preserving Supabase and the `$0`/no-overage/capacity/restore gates. Every shared Vercel hostname must be deny-by-default; Regional Public remains blocked until 15-minute RPO is paid-approved or otherwise proven.
- E-01 Resend candidate, R-01 routing/geocoding, M-01 media, L-01 audit anchor, S-01 support/status, SEC-01 independent security review, B-01 brand/domain, and A-01 optional analytics still require their named proof before dependent capability. Claim-document upload is absent; real official media stays disabled until M-01.

### Repository

```text
/
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ catalog/
│  │  ├─ capture/
│  │  ├─ trips/
│  │  ├─ store-portal/
│  │  ├─ admin/
│  │  ├─ reviews/
│  │  └─ moderation/
│  ├─ lib/
│  └─ service-worker/
├─ public/
├─ supabase/
│  ├─ migrations/
│  ├─ functions/
│  ├─ seed/
│  └─ tests/
├─ tests/
│  ├─ authorization/
│  └─ e2e/
├─ docs/
│  ├─ adr/
│  ├─ product/
│  ├─ security/
│  └─ operations/
├─ .github/workflows/
├─ package.json
└─ README.md
```

Do not create a monorepo, shared packages, or a second admin application until a second deployable or genuine reuse exists.

## 7. Decisions requiring approval

### Resolved during grilling

- Private Beta launches without public user-generated content. Regional Public MVP adds text-only public ratings and reviews only after moderation and abuse controls pass. Approved 2026-07-27.
- Pilot sequence: choose a small area for in-person owner outreach, recruit consenting Store Partners, invite owner/manager Beta Testers, prove the Private Beta, then advertise. Candidate shops remain prospective until explicit agreement. Approved 2026-07-27.
- Topeka city limits is the future Private Beta Pilot Area. No outreach, partnership claim, or real-location import begins until pre-pilot readiness is defined and passed. Approved 2026-07-27.
- Internal Alpha precedes external testing and has two stages: Scott operates all separate roles with supervised AI assistance during Solo Agent-Assisted Alpha; Scott's wife later performs independent shopper acceptance using her own account and phone during Two-Person Acceptance. AI results cannot substitute for independent human acceptance or approve a gate. Synthetic Stores only; no real-store records or external participants. Approved 2026-07-27.
- Every role uses a separate Test Account. Solo Agent-Assisted Alpha uses Test User A plus an optional Agent-Assisted Shopper Account; Two-Person Acceptance uses a newly created Test User B account controlled by the Independent Internal Tester on her phone. The solo account is never reassigned. Duplicate actions or values are allowed, but private records remain separately owned and inaccessible across accounts; household sharing is disabled. Approved 2026-07-27.
- Internal Alpha includes a separate Representative Test Account scoped to one Synthetic Store and operated by the Primary Internal Tester. It cannot access shopper-private records or share shopper sessions; the Independent Internal Tester is not required to use it. Approved 2026-07-27.
- Store Representative publishing uses a field-risk split: hours, phone, website, description, and temporary closure publish directly; identity, location, ownership, permanent closure, categories, and Official Store Profile Photos require approval. Reviews and shopper-private data remain inaccessible. ADR 0001. Updated 2026-07-30.
- A fourth Administrator Test Account exclusively approves Store Change Requests and grants/revokes representative roles during Internal Alpha and Private Beta. It uses a separate MFA session and cannot access shopper-private data; Moderator role is deferred until volume requires it. ADR 0001. Approved 2026-07-27.
- Internal Alpha scope includes four-role authentication, Synthetic Store discovery/details/hours, shopper-private saves/ratings/notes, recipient-specific Candidate Share and Trip Ideas using synthetic sources, trip planning/active navigation/offline recovery, representative/admin workflows, and auditing. Public UGC, household membership/shared lists, finds/collections, public Events, notifications, owner analytics, advanced personalization, and real stores are excluded. Original scope approved 2026-07-27; narrow Candidate Share exception approved 2026-07-30.
- Internal Alpha shopper-trip exit gate requires three successful Shopper Trip Acceptance Runs by the Primary Internal Tester as Test User A and three by the Independent Internal Tester as Test User B, on separate phones and accounts. Each account must prove refresh or app-restart recovery and offline recovery in at least one run; all required stop states, navigation handoff, and recalculation must be exercised across the runs. AI or primary-tester runs as Test User B are supplemental. Zero Blocking Defects and zero shopper-private data crossover are allowed. Approved 2026-07-27.
- Internal Alpha privileged-workflow exit gate requires two complete Privileged Workflow Acceptance Cycles operated by the Primary Internal Tester; the Independent Internal Tester is not required to use privileged accounts. The cycles prove direct versus approval-controlled publishing, approve and reject paths, self-approval denial, MFA-protected administration, existing-session write denial after revocation, complete privileged-action auditing, and denial of shopper-private access to both privileged accounts. Zero Blocking Defects are allowed; every allowed action must succeed and every forbidden action must be denied. Approved 2026-07-27.
- No store-owner outreach, real-store import, or external participant is allowed until both Internal Alpha stages and a separate External Testing Readiness gate pass. Then one consenting Store Partner representative may join the controlled, invitation-only Private Beta to test the real owner workflow before public access. This does not authorize public product promotion. Approved 2026-07-27.
- External Testing Readiness requires dated Primary Internal Tester approval of both Internal Alpha stages; all authorization/security tests; zero open Blocking Defects or known privacy, security, or data-loss defects; successful backup-restore and rollback rehearsals; working monitoring, error reporting, and support intake; legally reviewed final pilot privacy notice and owner-consent wording; a successful end-to-end External Testing Dress Rehearsal; a Private-Beta incident rehearsal covering containment, revocation, communication, database/Storage recovery, and deletion-receipt replay; and qualified professional evidence that the operating legal entity and required pilot insurance are active. AI may collect evidence but cannot approve. Any failed check blocks first-owner outreach. Updated 2026-07-31.
- First Store Partner onboarding uses a Synthetic Store demonstration, written Store Partner Pilot Consent before any real record/account, in-person plus published-business-contact authority verification, owner-controlled verified email, required MFA, and no shared credentials. Participation is voluntary, invitation-only, unpaid, non-endorsing, and non-advertised. Withdrawal revokes access and removes the real store from the active pilot; onboarding and withdrawal actions are audited. Approved 2026-07-27.
- An Administrator creates the first Pilot Store Record after consent using owner-confirmed name, address, phone, website, hours, description, and categories, with provenance and verification date. It is visible only to invited Private Beta participants. Representative-managed versus controlled-field rules remain enforced. Rights-confirmed Official Store Profile Photos may be submitted only through a Store Change Request and displayed after processing and Administrator approval. Ratings/reviews, shopper/review photos, events, owner responses, and analytics are excluded. Updated 2026-07-30.
- Initial Private Beta Cohort is limited to four human accounts and one Pilot Store Record: Scott's separate shopper and Administrator accounts, Scott's wife's shopper account, and the first owner's Store Representative account. The representative account is not used for shopper activity; a separate approved account would be required. AI accounts remain Synthetic Store-only. No additional user or real store is allowed before an expansion gate passes. Approved 2026-07-27.
- Initial Private Beta Expansion Gate requires owner completion of direct edits, two Store Change Requests respectively approved and rejected by the Administrator, MFA, and scheduled revoke/regrant workflows; two Pilot Store Record trip runs each by Scott and the Independent Internal Tester; successful support/feedback intake; complete privileged auditing; continuing monitoring, backup-restore, and rollback checks; zero open Blocking Defects or known privacy, security, or data-loss defects; and owner confirmation that the workflow is understandable. Dated Primary Internal Tester approval is required. No minimum calendar duration applies. Approved 2026-07-27.
- Controlled Private Beta expansion adds one verified Store Partner and Pilot Store Record at a time, repeating the full onboarding and acceptance checks before the next addition. Cap at three total Store Partners/stores, remain invitation-only without advertising, then stop for a separate public-readiness review. Pilot passage does not authorize public access. Approved 2026-07-27.
- Regional growth sequence is Topeka city limits first, then one Eligible Small Community at a time. Eligibility requires a location outside a larger metro and roughly within a 60-minute drive of Topeka, at least two antique/vintage shops, and one willing anchor Store Partner before activation. Each Community Expansion Gate requires two verified active listings; completed anchor-partner onboarding, direct-edit, controlled-change, and support workflows; separate-account/phone trips by Scott and the Independent Internal Tester; voluntary confirmation from five additional shoppers without precise-location tracking; passing monitoring, support, and store-data accuracy checks; zero Blocking/privacy/security/data-loss defects; and dated Primary Internal Tester approval. No minimum duration applies. Stop after three communities for a separate larger-metro readiness review. Exact communities remain unresolved. Approved 2026-07-28.
- Store Partner Invitation is an in-person, Administrator-generated 30-minute/single-consumption QR with an opaque token and no embedded identity, store, email, or role data. It opens PWA onboarding but grants nothing. One idempotent transaction consumes the token, stores the provisional consent submission, and creates an unprivileged Pending Partner Identity; failure creates none. Verified email and MFA then finalize the immutable Pilot Consent Receipt. Published-contact authority verification and final Pilot Store Draft approval precede Pilot Store Record creation and the exact store-scoped role grant. All transitions are audited. ADR 0002. Updated 2026-07-31.
- Pilot consent is captured on a phone-friendly screen with a plain-language summary, full-policy links, separate acknowledgments, typed name/title/store/email, invitation ID, and policy version. The provisional submission is immutable; after verified email/MFA, the finalized Pilot Consent Receipt binds it to the verified email and finalization time, is emailed without internal evidence, and cannot be edited by Administrators. Material term changes require fresh consent. Final wording receives legal review before external use. Updated 2026-07-31.
- A Pending Partner Identity creates and submits its own Pilot Store Draft after consent/email/MFA. Administrators verify and comment/return/approve but cannot edit submitted values. The owner corrects and resubmits. MFA/recent-auth approval of an exact final preview atomically freezes the draft snapshot, creates the Pilot Store Record, and grants only its store scope; failure creates neither. Comments and transitions are audited. ADR 0003. Approved 2026-07-28.
- Representative Activation Handoff uses a status-only email and normal PWA sign-in with verified email/MFA; no reusable access or role token is emailed. The portal shows only the approved store scope, consent receipt, and approval history, offers PWA installation guidance, and starts a listing/hours/direct-edit/controlled-change/support checklist. Change-request comments require authenticated portal access. Handoff events are audited. ADR 0002. Approved 2026-07-28.
- Store Partner Pilot Support uses categorized, pilot-restricted tickets with allowlisted diagnostics and optional owner-previewed screenshots. Ticket details/replies require authenticated owner/admin access; email is status-only. Security/privacy concerns alert the Administrator urgently. Fallback email handles sign-in failure without disclosing pilot data before identity verification. Owners may confirm resolution or reopen. Approved 2026-07-28.
- Regional Public MVP comprises Packages 1–10B plus every named provider/human/release gate. Package 11 is postlaunch RG-01. Phase headings are capability groups only. Phase 4 finds/households, Phase 5 preference onboarding/personalization, shopper/review photos, and owner review responses are deferred. Updated 2026-08-03.
- Browse Stores is the list-first shopper front door with search by name, town/area, and category; an optional map; scannable store cards; Store Details; Save; and Add to Trip. It works without device location. Approved 2026-07-30.
- The primary design audience includes shoppers roughly 50–80+. The product uses one Age-Inclusive Usability Baseline for all users: WCAG 2.2 AA, readable defaults, 48-by-48 mobile targets, 200% text resizing/reflow, plain labeled actions, accessible images, no color-only status, and non-map/non-drag paths. The approved public gate uses eight participants age 55+, including three age 70+ and two adaptation/assistive-technology users, with the task and pass thresholds in `PRODUCT_DECISIONS.md`. Updated 2026-07-31.
- Store Partners provide and confirm their records. Non-partner records contain only manually verified public facts—name, address, phone, hours, website, and categories—with source, verifier, and verification date. Descriptions, photos, and reviews require permission. Scraping or bulk import requires written license review. Google Places is not the stored catalog; only an optional place ID may be retained for a later approved live lookup under current provider and attribution terms. Approved 2026-07-29.
- Listing verification lasts 180 days. From day 181 through day 365, show `Verification overdue`, keep the listing searchable with a warning, and exclude it from Open Now and automatic trip ordering. After day 365, hide it from normal discovery until reverified. Corrections and closure reports trigger immediate review. Reverification resets the clock; records and provenance are never automatically deleted. Approved 2026-07-29.
- Routing may send only coordinates necessary for a user-requested route to a named provider disclosed in the privacy notice. Device location requires explicit while-in-use permission, with manual start entry available. Directory use and manual trip planning remain available when permission is denied. No background/continuous tracking, raw movement history, or precise coordinates in analytics, logs, email, or support records. Saved trips remain shopper-private; exact start/return coordinates delete within 24 hours after completed-trip sync and age out of backups within 30 days. Updated 2026-07-31.
- Candidate Share is a narrow cross-account exception: one authenticated sender addresses one Candidate Link to an existing account's verified email, resolved server-side without exposing account or block state. Only the matched recipient may Accept, Dismiss, Block, or Report; sender status is limited to `Pending`, `Accepted`, or reason-neutral `Closed`. No invitation or payload goes to an unregistered address. A pending share expires after 30 days; revoke, dismiss, or expiry immediately denies access and deletes the unaccepted payload from primary database and Storage within 24 hours. Acceptance creates a recipient-owned Trip Idea without exposing either account's other private data. Extraction remains unverified, preserves provenance, falls back to manual entry for blocked/private sources, and cannot publish stores or events. Household sharing and public Events remain deferred. Core behavior approved 2026-07-30; expiry, cleanup, delivery, and abuse protection approved 2026-07-31.
- D5–D22 approve the detailed Browse → Store Details → Add to Trip → progressive Plan → Check My Day → Navigator-only Go → private visit memory → summary/history journey, including one verified-email-bound Trip Partner and minimum Navigator-only offline active-trip snapshot. The snapshot uses encrypted, account/install-bound IndexedDB with explicit purge and offline-revocation limits. `DESIGN.md` is canonical. Journey approved 2026-07-30; storage controls approved 2026-07-31.
- D23–D27 approve Store Portal home, direct-versus-reviewed labels, hours editor, native Store Updates, profile/update images, official social links, reversible update archive, Pilot Support, and a deferred Vendor Contributor role. `DESIGN.md` is canonical. Approved 2026-07-30.
- D28A and D28–D30 approve coarse in-app new-store discovery plus Administrator home, type-aware review workspace, and scoped Access & Safety revocation/regrant. D31 full Audit History UI and export remain unresolved; privileged audit retention is two years. Updated 2026-07-31.
- The 2026-07-30 authorization to move from discovery/QA into scaffold and Synthetic Store implementation was superseded on 2026-07-31: the plan must be finished, but coding must not start until a separate product-owner instruction. External-testing and public-release gates remain in force.

### Feature and release gates during implementation

1. Exact Small-Community Expansion community choices gate expansion only; eligibility, per-community gate, and three-community stop/review are resolved.
2. Mapping/routing provider selection gates provider calls; minimized, disclosed coordinate processing is approved.
3. Scalable claim policy/cardinality/signal independence/no-document-upload are resolved; Package 10B stage enable and executable verification still gate public claims.
4. Review identity, eligibility, conflict disclosure, exact 60-second deletion Undo, moderation, feature restrictions, human dress rehearsal, and appeal policy must pass before public reviews.
5. R-01 gates Package 5B only. Its exact algorithm is approved; Package 5A remains manual-order `Review Hours`, states travel time is excluded, and makes no arrival/feasibility/suggested-order claim.
6. Approved encrypted IndexedDB key handling, account binding, purge/deny behavior, one-device Go, ordered idempotent replay, server precedence, and explicit private-field conflict choice must be proven before offline acceptance.
7. Age 18+ account participation, United States-only Regional MVP, browser/device matrix, and older-adult cohort/pass thresholds are approved; their executable evidence still gates public release.
8. D31 full Audit History UI and export policy remain unapproved. Implement only two-year append-only privileged events and narrow D30 `View Audit` access until approval.
9. Completed-trip location, Candidate Share evidence, and terminal invitation-state lifecycles are approved; package contracts must implement and prove them.
10. A named sole-Administrator break-glass reviewer process gates any Private Beta break-glass activation.
11. Duplicate merge, participant exit, freshness, Regional Readiness, promotion boundary, and Package 11 RG-01 rules are approved; evidence gates the dependent workflow/expansion.

### May wait only until its named package; hosting cannot wait past local work

12. Final product name.
13. H-01 hosting must pass before any shared environment. E-01 email waits only until real email; R-01 until Package 5B; M-01 until real media; L-01 until privileged shared/external mutation; S-01/HC-01 until first owner contact; SEC-01/B-01/HC-02 until Package 10B; A-01 until optional analytics (otherwise off).
14. Monetization remains deferred through RG-01/three-community review. Consent-based unpaid product promotion is approved only after Package 10B; optional printing spend still requires approval.
15. Deferred-feature timing after Regional Public MVP: households, finds, preference onboarding/personalization, shopper/review photos, owner responses, events, and Android release. Shopper account export is approved Package 2 scope; only D31 privileged-audit export remains unresolved.

This review concluded that planning was complete for the original bounded first slice. That historical coding hold was later superseded by Product Owner-directed implementation. Each unresolved item still blocks only its dependent feature or release, and External Testing Readiness still blocks owner outreach, real-store import, or external participation.
