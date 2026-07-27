# Phase 0 Product, Security, and Architecture Review

Status: proposal pending product-owner approval. The handoff documents remain the source of truth.

## 1. PRD review

### Contradictions and scope conflicts

| Conflict | Source | Required resolution |
|---|---|---|
| Public ratings and reviews are required for MVP, but their inclusion in the first private beta is unresolved. | `PRD.md` MVP; `PRODUCT_DECISIONS.md` item 8 | Define separate private-beta and public-MVP gates. |
| Trip planning is required for MVP, while reviews and trip planning are assigned to separate sequential phases. | `PRD.md` MVP; `IMPLEMENTATION_PLAN.md` Phases 2–3 | State which phases collectively constitute public MVP. |
| Map requires personal match indicators, but required MVP lists only preference onboarding and implementation defers personalization to Phase 5. | `PRD.md` Trail Map and MVP; `IMPLEMENTATION_PLAN.md` Phase 5 | Include a basic transparent match score or remove match indicators from MVP. |
| Store profiles “must support” public photos and owner responses, but public photos and owner verification are only strongly preferred or later work. | `PRD.md` Store details and MVP; `IMPLEMENTATION_PLAN.md` Phase 2 | Amend profile requirements or include those capabilities. |
| Claim intake is required, but verification method and owner self-service authority are unresolved. | `PRD.md` MVP; `PRODUCT_DECISIONS.md` item 7 | Separate intake, verification, and publishing permissions. |
| Find capture has an MVP success metric but is only strongly preferred and placed in Phase 4. | `PRD.md` MVP and Success metrics; `IMPLEMENTATION_PLAN.md` Phase 4 | Remove metric from MVP or include find capture. |
| Regional strategy says “one strong region” and “launch dense,” but suggests six places across multiple metros and states. | `PRD.md` Regional launch; `PRODUCT_DECISIONS.md` | Select one contiguous launch market. |
| Precise location must not be shared, but routing requires sending locations to a provider. | `SECURITY_AND_TRUST.md` Location privacy; trip requirements | Permit disclosed, minimized processor use or choose on-device routing. |
| Household revocation must be immediate, but downloaded or offline data cannot be remotely recalled. | `PRD.md` Household sharing; `SECURITY_AND_TRUST.md` Authorization | Define immediate server revocation plus best-effort local purge and residual risk. |

### Missing launch requirements

1. Store-data provenance, licensing, refresh cadence, stale-data policy, and source attribution.
2. Review identity, eligibility, anonymity, conflict disclosure, account-deletion effect, and aggregation rules.
3. Moderation standards, service levels, evidence access, appeals, and legal escalation.
4. Business-claim creation, verification, transfer, expiration, revocation, and disputed-control workflow.
5. Route objective and edge semantics: infeasible stops, time zones, daylight saving, overnight hours, temporary markets, traffic assumptions, provider failure, and manual overrides.
6. Offline data boundary, local retention, logout purge, sync conflicts, and multi-device behavior.
7. Retention and deletion schedule for every private and operational data class, including backup expiry.
8. Accessibility conformance target, supported browsers/devices, performance budgets, and public availability targets.
9. Recovery point and recovery time objectives, support coverage, incident contacts, and status communication.
10. Minimum age, launch countries, analytics consent, email consent, and processor disclosures.
11. Duplicate-store merge rules and preservation of reviews, saves, trips, claims, and audit history.
12. Account suspension, compromised-account recovery, data export format, and deletion verification.

## 2. Security and privacy plan review

### Strong foundation

- Clear public, private, household-shared, and sensitive-operational classifications.
- Deny-by-default authorization at database, storage, server function, and admin boundaries.
- Server-owned role assignment, rating aggregation, and signed private-media access.
- Separate upload buckets, EXIF removal, content validation, re-encoding, rate limits, and moderation.
- MFA for privileged roles, release controls, backup/restore testing, monitoring, and incident response.

### Required additions before implementation

- Define exact RLS and storage invariants, including views, RPCs, `security definer` functions, non-exposed schemas, and service-role boundaries.
- Keep administrative users out of shopper-private data by default. Define audited break-glass access separately.
- Define household authorization through active membership checked on every request; never copy ownership into client-controlled fields.
- Treat signed URLs as bearer credentials: short expiry, no analytics logging, no service-worker caching, and revocation limits documented.
- Quarantine uploads before publication; reject active formats such as SVG; enforce decoded-pixel and archive-bomb limits.
- Define browser session storage, CSP, XSS defenses, session rotation/revocation, recent-auth operations, and recovery notifications.
- Disclose routing-provider processing of start, stop, and destination coordinates. Send minimum required data and never persist provider payloads by default.
- Separate public caching from authenticated offline state; bind cached trip data to account and purge it on sign-out or account deletion.
- Make audit records append-only to application roles; define retention, access, anomaly alerts, and clock/source integrity.
- Set per-user/IP/device quotas and spend limits for authentication, reviews, uploads, routing, and notifications.
- Define deletion from primary data, derived data, logs, provider systems, and backups.

Assessment: direction is sound, but it is not yet an implementable privacy or security specification. Retention, provider processing, offline behavior, privileged access, and moderation policy remain launch blockers.

## 3. Threat model

### Assets

- Accounts, sessions, recovery factors, and privileged roles.
- Private preferences, ratings, notes, trips, finds, collections, images, and location-derived data.
- Public catalog, reviews, ratings, claims, owner responses, and store status integrity.
- Business-verification evidence, moderation cases, fraud signals, audit records, and secrets.
- Service availability, provider quotas, and operating budget.

### Trust boundaries

1. Browser/PWA ↔ Supabase Auth, Database, Storage, and Edge Functions.
2. Edge Functions ↔ mapping/routing, email, scanning, and future analytics providers.
3. Public/authenticated app ↔ moderator and administrator capabilities.
4. Store-data imports ↔ external data sources and manual verification.
5. Service worker/local storage ↔ signed-out users and shared devices.
6. App ↔ Waze and Google Maps deep-link handoff.

### Priority threats and controls

| Priority | Threat | Required controls | Residual risk |
|---|---|---|---|
| Critical | Cross-user private-data access through missing RLS, leaky views/RPCs, storage paths, or service-role use | Deny-by-default policies; non-exposed operational schemas; stable owner IDs; authorization tests for every table, view, RPC, function, and bucket | Policy regression remains possible; CI and pre-release tests are mandatory. |
| Critical | Role escalation or business-claim hijack | Server-only role changes; MFA and recent auth; multi-channel/manual claim evidence; audited grant/revoke; no role fields writable by clients | Social engineering and compromised business channels. |
| High | Store owner accesses private shopper data or alters criticism | Store-scoped grants; separate owner-response records; no review/private-data policies for owners; moderation appeal path | Legal/support pressure must not become ad hoc access. |
| High | Rating manipulation, review spam, and coordinated abuse | Unique active-review constraint; server aggregate; rate limits; verified accounts; anomaly signals; reports; moderation history | Sybil accounts cannot be eliminated completely. |
| High | Location leakage through logs, analytics, provider calls, or trip history | Ephemeral coordinates; explicit save; provider disclosure; log redaction; no raw movement history; deletion controls | Routing providers necessarily receive selected coordinates. |
| High | Private data exposed from offline caches or shared devices | Cache current trip only; account binding; sign-out/deletion purge; no private-image caching; short retention | Previously downloaded data cannot be remotely guaranteed erased. |
| High | Malicious upload, EXIF/GPS leak, decompression bomb, or unsafe public content | Private quarantine; content sniffing; re-encode; metadata strip; decoded-pixel limits; malware scan; moderation before publication | Copyright and harmful-content disputes require process, not only technical controls. |
| High | Session theft, XSS, or account-recovery takeover | Strict CSP; output encoding; dependency controls; managed session rotation/revocation; recovery rate limits; account-change alerts; recent auth | Compromised user devices remain outside application control. |
| High | Moderator/admin misuse or compromised privileged account | Least privilege; required MFA; separate admin actions; append-only audit; anomaly alerts; break-glass procedure | Trusted-insider risk remains. |
| High | Store-data poisoning, false closure, or duplicate merge damage | Provenance; verification timestamps; audited edits; owner scope; reversible merges; dispute workflow | Public sources can themselves be wrong. |
| High | API-cost or availability denial of service | Edge rate limits; quotas; caching of public data; provider budgets/alerts; request-size limits; graceful provider failure | Regional events can still create legitimate spikes. |
| Medium | Secret/service-role leakage or compromised provider webhook | Server-only secret storage; narrow functions; secret rotation; authenticated webhooks; environment separation | A privileged function compromise has broad impact. |
| Medium | Incomplete deletion through logs, backups, derived aggregates, or providers | Data inventory; deletion workflow; backup expiry; provider deletion terms; verification receipt | Immediate removal from immutable backups is generally impossible. |
| Medium | Supply-chain compromise | Lockfiles; minimal dependencies; scanning; protected branch; reproducible build; reviewed updates | Scanners do not prove package safety. |

## 4. Authorization matrix

`Own` means the authenticated user owns the row. `Shared` means an active explicit household grant covers that record. `Business` means a currently verified claim covers that store. All unspecified access is denied.

| Resource/action | Anonymous | Authenticated owner | Shared household member | Verified business owner | Moderator | Administrator | Trusted service |
|---|---|---|---|---|---|---|---|
| Approved store/profile/hours read | Read | Read | Read | Read | Read | Read | Read |
| Store correction report | Rate-limited create only if approved | Create/read own status | Same as user | Create for claimed store | Triage/update assigned | Full | Validate/notify |
| Public store data write | None | None | None | Update allowed claimed fields or submit proposal, per approved policy | Correct/moderate | Full | Import/merge/publish |
| Approved review/rating read | Read | Read | Read | Read | Read | Read | Read |
| Review create/edit/delete | None | Own only; one active review per store | Own review only | Own shopper review only; never another user's | Hide/restore; never impersonate author | Exceptional audited action | Aggregate/status transitions only |
| Owner response | Read | Read | Read | Create/edit own response on claimed store | Hide/restore | Full | Publish/status transitions |
| Pending public photo | None | Create/read/delete own submission | None unless submitter | Create/read own official submission | Review assigned | Full | Scan/re-encode/publish |
| Private profile/preferences/saves/personal ratings/notes | None | Full own | None unless resource explicitly shared | None | None | None by default | Narrow maintenance only |
| Private trips/finds/collections | None | Full own | Read/update only explicitly shared records | None | None | None by default | Narrow maintenance/export/delete only |
| Private media/signed URL | None | Own only | Explicitly shared record only | Own business-upload evidence only | Assigned moderation evidence only | Break-glass only | Generate after authorization check |
| Household membership | None | Create invite; accept; leave; owner revoke | Read membership; leave | None | None | Resolve abuse only | Expire invites/revoke sessions |
| Business claim/status | None | Create/read own status | None | Read own verified claim; request changes | Review assigned claims | Full | Verify evidence and apply grants |
| Verification evidence | None | Submit/read own submission status, not internal notes | None | Read own submission status | Read assigned evidence | Full | Scan/store/expire |
| Moderation report/case | None or rate-limited create, per policy | Create; read own public status | Same as user | Create; read own public status | Read/update assigned cases | Full | Queue/notify/retain |
| Audit records | None | None | None | None | Read own moderation-action subset | Read/search | Append only; no application-role update/delete |
| Aggregate public rating | Read | Read | Read | Read | Read | Read | Write/rebuild only |
| Role grants and scopes | None | None | None | None | None | Request/administer within approved scope | Apply validated grants/revocations |
| Seed import/duplicate merge | None | None | None | None | Propose/review | Approve | Execute and record rollback data |

Break-glass access to shopper-private data requires a separate approved policy, reason, time limit, user/security notification rules, and immutable audit record. It is not normal administrator access.

## 5. Recommended regional public MVP

### Include

- One contiguous, store-dense metro or corridor with manually verified seed data, provenance, and freshness status.
- Anonymous directory, search, map, filters, store profile, hours/exceptions, closure state, last verified date, and correction reports.
- Managed authentication with verified email; private saved stores, personal ratings, explicit preferences, and visit history.
- Transparent rule-based preference match using declared category/store attributes. No machine learning or behavioral inference in MVP.
- Trip creation, departure/start/optional return, required and optional stops, browsing time, manual reorder, provider travel times, hours-aware feasible ordering, warnings, active-trip state, and one-leg Waze/Google Maps handoff.
- Offline recovery of the current active trip only.
- Text-only public star ratings/reviews, one active review per user/store, edit history, reporting, rate limits, server aggregation, and a minimal moderation queue.
- Claim intake and manual verification. Owner publishing remains disabled until claim controls are proven.
- Account export/deletion, privacy controls, audit logging, monitoring, tested backup restore, incident workflow, authorization tests, and accessibility review.

Private beta may disable all public user-generated content. That beta does not satisfy the PRD's public MVP until reviews and moderation are enabled and proven.

### Defer

- Household sharing.
- Finds, purchases, collections, partner voting, and insurance values.
- Public/review photos and image moderation provider.
- Owner self-service publishing, events, engagement analytics, and paid features.
- Push notifications.
- Advanced personalization, behavior-based learning, and similar-store recommendations.
- Android packaging, AI identification/appraisal, marketplace, social feed, and national expansion.

## 6. Proposed architecture and repository structure

### Runtime architecture

- One React/TypeScript/Vite PWA. Public, authenticated, business-intake, moderator, and admin routes remain one deployable until isolation or release cadence proves a second app useful.
- Supabase Auth for identity; PostgreSQL for public/private/operational records; Storage for quarantined public submissions and private media; Edge Functions for privileged or provider-facing operations.
- Direct client database access only for simple RLS-protected reads and owner-scoped writes.
- Edge Functions own role changes, business claims, moderation transitions, rating aggregation/rebuild, signed URLs, imports/merges, and routing-provider calls.
- Sensitive operational records live in non-exposed schemas. Every exposed table, view, function, and bucket receives deny-by-default policy tests.
- Store hours use store-local weekly rules and dated exceptions with an IANA time-zone identifier. Trip instants are stored in UTC.
- One selected routing provider supplies travel-time matrices. A deterministic insertion/ordering heuristic finds a feasible schedule and explains warnings; manual reorder remains available. Do not promise mathematically optimal routes.
- Service worker separates public asset/catalog caching from authenticated data. Current active trip is the only private offline dataset in MVP.
- Hosting, routing, store-data, email, analytics, and future image-moderation providers require ADRs and data-processing/cost review before selection.

### Repository

```text
/
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ catalog/
│  │  ├─ preferences/
│  │  ├─ trips/
│  │  ├─ reviews/
│  │  ├─ claims/
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
- Internal Alpha precedes Private Beta: two designated Internal Testers use personally controlled phones and clearly fictional Synthetic Stores; no real-store records or external participants. Approved 2026-07-27.
- Internal Testers use separate Test Accounts. Test User A and Test User B may duplicate actions or values, but private records remain separately owned and inaccessible across accounts; household sharing is disabled for this test. Approved 2026-07-27.
- Internal Alpha includes a third Representative Test Account scoped to one Synthetic Store. Either tester may operate it, but it cannot access shopper-private records or share Test User A/B sessions. Exact representative capabilities remain unresolved. Approved 2026-07-27.

### Before scaffolding or schema design

1. Which implementation phases collectively define public MVP?
2. Exact Regional Public MVP launch metro/corridor; Private Beta Pilot Area is Topeka city limits.
3. Store-data source, license, attribution, refresh, and Google Places constraints.
4. Mapping/routing provider and whether the product may send precise coordinates to it as a disclosed processor.
5. Include the proposed transparent match score in MVP, or remove match indicators from MVP.
6. Claim intake only versus verified owner editing; approved verification methods.
7. Review identity, eligibility, conflict disclosure, deletion behavior, moderation rules, and appeal policy.
8. Retention/deletion/backup schedule, RPO, RTO, and break-glass access policy.
9. Route feasibility semantics, traffic assumptions, and time-zone/temporary-market behavior.
10. Offline cache, logout purge, revocation, and sync-conflict behavior.
11. Minimum age, launch countries, accessibility target, and supported browser/device baseline.

### May wait until after scaffold approval

12. Final product name.
13. Hosting, analytics, transactional email, and image-moderation providers, provided no related feature is built first.
14. Monetization and free/paid owner features.
15. Households, finds, public photos, events, exports beyond baseline JSON/CSV, and Android release timing.

Implementation remains blocked pending approval of items 1–11.
