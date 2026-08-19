# ADR 0005 — Host free-first on Cloudflare Pages and Supabase

- Status: Accepted topology/cost decision; H-01 and L-01 activation receipts are not accepted until their executable proofs pass. A paid-tier transition plan is recorded below; it activates only by a separate Product Owner funding approval and gate receipt.
- Date: 2026-08-03 (transition plan recorded 2026-08-17)
- Decision owner: Product Owner
- Applies to: local development through Regional Public MVP

## Context

Antique Trail must have no recurring infrastructure charge during startup. That constraint cannot silently weaken privacy, authorization, recovery, accessibility, or release gates. The approved recovery targets are 24-hour RPO/one-business-day RTO for Internal Alpha, four-hour RPO/eight-hour RTO for Private Beta, and 15-minute RPO/four-hour RTO for Regional Public MVP.

Current official limits were checked on 2026-08-03:

- [Cloudflare Pages Free](https://developers.cloudflare.com/pages/platform/limits/) allows 500 builds/month, 20,000 files, 25 MiB per asset, and custom domains. Preview URLs are [public by default](https://developers.cloudflare.com/pages/configuration/preview-deployments/) unless Access is configured; preview-only protection does not protect the main `pages.dev` or custom hostname.
- [Supabase Free](https://supabase.com/pricing) supplies two active projects, 500 MB database, 1 GB Storage, 50,000 monthly active users, and limited egress/functions. A low-activity project [may pause](https://supabase.com/docs/guides/platform/free-project-pausing/). Free projects do not provide the recovery capability required for the public 15-minute RPO.
- Supabase documents that [database backups exclude Storage objects](https://supabase.com/docs/guides/platform/backups/), so database-only recovery evidence is invalid. Supabase publishes a [GitHub Actions logical-backup pattern](https://supabase.com/docs/guides/deployment/ci/backups/).
- The [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-projects-create#supabase-db-dump) documents that the default `db dump` excludes managed Auth/Storage schemas; the default command is not a complete recovery set.
- GitHub Free private repositories currently include [2,000 Actions minutes and 500 MB artifact storage](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Without a valid payment method, use is blocked at the included quota. This is a bounded alpha backup option, not a production PITR substitute.
- Supabase's default SMTP is [demonstration-only](https://supabase.com/docs/guides/auth/auth-smtp). [Resend Free](https://resend.com/docs/knowledge-base/what-is-resend-pricing) currently allows 3,000 emails/month and 100/day with no free-plan overage.

Provider limits and prices are external facts, not permanent product requirements. Recheck them and preserve a dated receipt before each shared environment or release promotion.

## Decision

### Cost boundary

`Startup Free Stage` means local development, Shared Synthetic Alpha, the Startup Learning MVP, and a Controlled Private Beta only while all applicable gates are proven at `$0` recurring infrastructure cost. No provider may automatically upgrade, accept paid overage, or enable a billable add-on. Reaching a limit disables or blocks the dependent capability; it never authorizes payment and never weakens a safety control.

The `$0` infrastructure rule includes frontend hosting, database, authentication, object storage, functions, transactional email, routing, backup storage/automation, monitoring/status, scanning/media processing, and bandwidth. Domain registration, legal/insurance services, and optional printing are not infrastructure, but each still requires separate Product Owner approval before purchase.

Regional Public MVP is not promised at `$0`. Under the approved 15-minute RPO, public launch is blocked until the Product Owner approves a paid recovery configuration or an independently tested `$0` alternative proves the same requirement. The plan records no approved monthly paid ceiling.

### Paid-tier transition plan (recorded, not yet activated)

The Product Owner has stated the intent to move to paid hosting after development; this section records the approved *path* so the transition is a config-and-receipt change, not a redesign. It activates only when the Product Owner signs a funding approval with a hard monthly cost ceiling (no automatic overage, no automatic upgrade) and the relevant gate receipt passes. Until then, every `$0` control above remains in force.

At transition, in order:

1. **Fund the recovery target.** Approve a paid plan that proves the stage's RPO/RTO (15-minute RPO/four-hour RTO for Regional Public MVP), replacing the `$0` recovery constraint with the approved ceiling. This unlocks H-01 and dependent stages.
2. **Move the public media bucket to Cloudflare R2 (or S3).** The media pipeline (`docs/operations/M01_MEDIA_PROVIDER_RUNBOOK.md`) is provider-neutral: object keys are immutable (`official/<id>/vN/<digest>.webp`), so a bucket migration is configuration plus a receipt, with no application code change. R2 egress to the Cloudflare CDN is free, so image serving cost stays near zero at any volume.
3. **Retain stripped originals instead of purging at 24 hours.** At paid tier, keep re-encode-safe originals in the existing private bucket so variants can be regenerated later (new thumbnail sizes, higher-quality re-encodes, future AI alt-text) without recontacting stores. Metadata stripping and quarantine remain mandatory; originals never leave the private bucket.
4. **Lift space-based caps; keep abuse caps.** The 20 uploads/store/day and five-concurrent limits are anti-abuse and stay. The 4 MiB derivative cap is a quality/bandwidth bound and stays. Per-store *space* ceilings disappear; stores may upload as many photos as they want, bounded by the approved budget.
5. **Future video reviews** become a new pipeline behind the same provider-neutral boundary (e.g. Cloudflare Stream or Mux), with its own receipt, quotas, and cost ceiling. Nothing in the image pipeline blocks it; nothing is built now.
6. **Keep the 25%/75%/90% quota monitors** as runaway-bill protection: at 75% stop nonessential growth, at 90% disable optional media/uploads before core Browse/Details, account safety, deletion, revocation, or support.

The transition is deliberately not an amendment of every `$0` clause in this ADR; each clause yields only when its named gate receipt (H-01, M-01, E-01, R-01, L-01) passes under the approved paid ceiling. One summary reference lives in `README.md` under Source precedence; the media-specific steps live in the M-01 runbook.

### Environment topology

| Stage | Frontend | Backend/data | Access/data | Cost and gate |
|---|---|---|---|---|
| Local development | Local Vite | Local Supabase | Synthetic only; developer machine | `$0`; no H-01 activation needed |
| Shared Synthetic Alpha / Startup Learning MVP | Cloudflare Pages Free static PWA | Supabase Free staging project | Synthetic Store/content only; minimum real internal-tester account allowlist in Package 8; deny-by-default Cloudflare Access on every hostname plus application authorization | `$0`; H-01 receipt, 24h RPO/one-business-day RTO proof |
| Controlled Private Beta | Same static host | Same free staging project only if isolated beta data and all quotas/recovery pass | Invite-only real records; no anonymous real-store access | Conditionally `$0`; 4h RPO/8h RTO, E-01, M-01, S-01, HC-01 |
| Regional readiness | Private readiness build; never indexed | Supabase project B becomes production preflight only after its isolated-restore rehearsal is accepted and the restored test data is securely wiped | Exact cohort grants only | `$0` if capacity and restore proof remain valid |
| Regional Public MVP | Cloudflare Pages static PWA and owned HTTPS domain | Supabase production project with approved 15-minute recovery/PITR or proven equivalent | Anonymous public catalog plus authenticated private/privileged data | Blocked until paid/alternative recovery, domain, capacity, and Package 10B approval |

Cloudflare Pages Functions are not part of the selected baseline. The PWA remains static; privileged/provider operations stay in Supabase Edge Functions. A change requires a new ADR.

Create the Cloudflare Pages project as **Direct Upload from protected CI**, not Git Integration. CI builds once, tests the exact `dist/` directory, records a deterministic SHA-256 manifest/digest, and deploys that same directory with a version-pinned Wrangler command/action whose dependency and full commit SHA are recorded. The H-01 receipt binds source commit, lockfile, build environment, artifact digest, Cloudflare deployment ID, hostname, and smoke-test result. It must prove rollback by redeploying the previously accepted directory and matching its recorded digest. Do not rebuild during promotion. Cloudflare documents that a Git-integrated Pages project [cannot later switch to Direct Upload](https://developers.cloudflare.com/pages/platform/known-issues/#git-configuration), so a project created with Git Integration does not pass H-01.

Shared and readiness hostnames must be protected by a deny-by-default Cloudflare Access application covering the main `pages.dev` hostname, custom hostname, and preview hostnames. Enabling Pages' preview-only policy is insufficient. H-01 must confirm that the required Access seats and host coverage are available at `$0`; otherwise the remote shared stage stays disabled and testing remains local. A logged-out browser must receive denial before any shared-environment receipt passes. Readiness invitations add application authorization; they do not replace the outer host boundary.

Before generating a Private-Beta partner QR, the Administrator records the owner's verbally confirmed email and explicit consent to receive the Access challenge, then adds that exact email to the Cloudflare Access application with expiry no later than the onboarding/readiness grant. Access identity grants no Antique Trail account, role, store, or data authority. H-01 must cover enrollment, expiry/removal, auth/partner/readiness callback paths, Access log minimization/retention, wrong-email denial, expired-entry denial, and proof that no hostname/path is weakened for onboarding.

Use one approved U.S. Supabase region for each remote project, recorded before creation in the environment receipt. Production and restore targets must document their regions and cross-region/export path. No real data may move regions implicitly.

The two-project free topology is serial: project A is staging/Private Beta; project B is the disposable isolated restore target through Package 10A. Every rehearsal resets B, restores the matching set, proves the receipt, and securely wipes restored test data. Only after that proof may B be reclassified—by signed H-01/10A receipt—as production preflight and later production. Once reclassified, any further isolated remote restore requires wiping/reusing A after Private Beta data is exported and retired, a local isolated restore that proves the same controls, or explicit paid approval. A simultaneous third Supabase project is never assumed free.

### Service gates

| Gate | Required before | Planning selection and proof |
|---|---|---|
| H-01 Hosting | Any shared environment | This ADR plus dated limits, region, access-boundary, export, quota, and restore receipt |
| E-01 Transactional email | First real verification, recovery, invitation, or status email | Resend Free custom SMTP candidate; owned domain, SPF/DKIM/DMARC, rate/failure/privacy tests, essential mail only |
| R-01 Routing | Package 5B | Provider ADR; minimized coordinates, attribution, quota, fixtures, timeout/fallback. Package 5A remains provider-free |
| M-01 Official media | Any real image upload | Selected fail-closed scan/re-encode/metadata-removal workflow. Until then real uploads and Package 6 external use remain disabled |
| L-01 Audit anchor | Privileged shared/external mutation, independent review, or break-glass | Separate-admin append-only sink ADR/receipt; root-only payload, credential/key rotation, retention, quota/`$0` proof for startup, outage/restore/replacement, and 24-hour fail-closed tests |
| S-01 Support/status | First owner contact | Monitored support/security channels, status path, primary and human backup, response rehearsal |
| A-01 Optional analytics | Any optional analytics | Separate consent/minimization ADR; otherwise analytics remains off |

Resend and any routing/media/monitoring service are candidates until their gate receipt verifies current terms and executable behavior. A failed provider gate blocks only its dependent capability.

H-01 is a signed environment receipt, not implied by this ADR. It records provider plan/version/date; U.S. region; every hostname; Access coverage/seat cost; Direct Upload configuration; data sent and processor role/retention; credentials and rotation; exact export/restore commands; Auth/Storage/config recovery; backup encryption/key custody; quotas and no-charge stops; timeouts/retry/idempotency; redacted monitoring; cancellation/export/replacement; legal/privacy review; executable allow/deny/rollback fixtures; and the explicit no-go result. On hosted managed Supabase—not only local—it must create/inspect three private `postgres`-owned fixed-empty-search-path helpers: exact session lookup, exact admission-UUID lookup, and exact provider-ID lookup. Prove current/wrong/deleted/duplicate calls, email-HMAC/metadata mismatch, no partial or paginated scan, revoked public/API grants, and rerun after provider upgrade. Also prove registration modes, parent/child raw-secret handoff, direct-signup denial, `auth.admin.generateLink({type:'signup'})`, discard of provider action link, app-fragment `hashed_token`/`verifyOtp(type:'email')`, service metadata reconciliation, and the latch-first `open → draining → blocked` operation protocol. Before E-01, H-01 uses a deterministic no-send mail stub to prove idempotency, rewriting/tracking/prefetch configuration inputs, timeout/finality, and quarantine behavior; H-01 alone never authorizes a real message. When E-01 is accepted, repeat those checks against the selected custom mail provider and inspect actual delivery. Record and test a provider-call deadline and authoritative finality window for every enabled create/update/send/cleanup kind; exercise reservation/drain, direct provider token redemption, response-loss, timeout, late-effect, cleanup-while-blocked, two-human nonterminal-clear denial, privacy purge, and restore races. Any unproved finality or unknown provider state keeps registration closed. Also prove bootstrap binding/reset and profile/session completion. Until every field passes, remote shared activation is prohibited.

Before any shared provider call, H-01 also binds Package 2's two distinct human Product/Security deployment-recovery signer roles and offline Ed25519 public-key fingerprints in protected configuration, and proves separate custody, canonical dual-signature verification, nonce/expiry/replay/digest/version checks, rotation/revocation/loss, first-account quarantine recovery, and no private key in CI/repository/database/log/backup. These signers are independent of application accounts and Package 8 evidence responsibilities; unavailability of either leaves registration disabled.

L-01 is separate from H-01 and must be administered with credentials/control outside the Supabase application database. Only content-free chain sequence/root/time/environment/deployment digest may leave Antique Trail. If no `$0` sink proves append-only retention and the 24-hour failure contract, startup may continue locally without privileged remote mutations, but Private Beta/Regional Public remains blocked rather than weakening audit integrity.

### Recovery and capacity

Database, Auth-related application state, and Storage objects are separate recovery assets. A valid backup set records matching schema/migration, application schema/data, required Auth users/identities/factors/metadata, Storage metadata plus every object, Auth redirect/SMTP configuration without secrets, capability configuration, deletion receipts, and authorization-revocation receipts. Supabase's default `db dump` excludes managed Auth/Storage schemas and never counts as a complete recovery set. H-01 records the exact version-pinned export commands/schema allowlist and matching restore order proven against a disposable project: platform bootstrap/migrations; application schema/data; approved Auth records; Storage metadata/objects; nonsecret Auth/application configuration; session invalidation; deletion/revocation replay; then authorization and object-integrity tests. If current Supabase permissions or tooling cannot export and restore any required Auth/Storage element safely, the remote stage does not open.

H-01 also selects and proves at `$0` for startup an integrity-protected registration safety journal outside the Supabase application database and its backup rollback domain. Each external registration operation requires an acknowledged encrypted write-ahead entry before the provider call; a separately retained content-free monotonic sequence/root detects rollback. No raw email, password, token, link, or content enters it, and identifier-bearing versions follow the 24-hour purge/30-day backup-age limit in `PACKAGE_CONTRACTS.md`. Restore only into an unroutable target with a deployment-level registration fence independent of restored rows; force mode `closed` and latch `draining`, compare/replay the external high-water, reconcile exact Auth/mail effects, and keep the fence on for any gap or unknown. Fence removal uses Package 2's exact two-signer, separate 30-minute one-use nonce contract and binds environment, fence deployment/version, backup digest, journal root/sequence, operation/subject digest, target latch version, and reason; every signature/expiry/replay/mismatch denial and content-free external receipt is tested. It can move only to `blocked`; normal signed clear is still required for `open`, and a later stage receipt is still required to leave mode `closed`. If the journal, fence, retention, signer, or replay proof cannot fit `$0` limits, shared startup registration remains disabled and testing stays local.

Encrypt each backup twice with a pinned, checksum-verified `age` release and two different X25519 recipients: inner ciphertext to the Product Owner key, then outer ciphertext to the H-01 Recovery Custodian key. CI stores only both public recipients and can encrypt; it receives neither private key. Restore requires the Recovery Custodian to remove the outer layer and the Product Owner to remove the inner layer, so neither key or custodian alone can produce plaintext. Before any shared-stage backup, H-01 names that distinct human Recovery Custodian; the person may also be Package 2's Security deployment-recovery signer. This H-01 custody duty authorizes only the two-key decrypt/restore sequence and does not satisfy or pull forward HC-01 staffing for owner contact; HC-01 may later replace the custodian only through recorded key rotation, full re-encryption of retained sets, and a new rehearsal. The receipt records tool/version/checksum, both recipient fingerprints, inner/outer ciphertext digests, layer order, both custodians, rotation date, loss procedure, no-single-key decryption test, and successful two-custodian restore. Rotate/re-encrypt on custodian change or suspected exposure; loss/unavailability of either required key blocks the shared stage with no one-person fallback.

For Shared Synthetic Alpha, a scheduled GitHub Actions logical export may be used only while encrypted retained backup sets remain below 400 MB total and Actions use remains below 1,500 minutes/month. Keep at least two recoverable sets, alert on a missed run, and stop the shared test window if the 24-hour RPO cannot be demonstrated. Private Beta requires a successful four-hour cadence and eight-hour full DB/Storage restore rehearsal; unreliable scheduler timing or incomplete Auth/Storage restoration blocks the beta. No free backup mechanism is assumed to meet public PITR.

Protective thresholds use the lower of 75% of the provider allowance or the package-specific safe limit. At 75%, stop promotion and nonessential growth; at 90%, disable optional maps, route suggestions, media uploads, and nonessential email before core Browse/Details, account safety, deletion, revocation, or support. Provider protective caps are 375 MB database, 750 MB Storage, 1,500 Actions minutes, 400 MB retained Actions artifacts, 375 Cloudflare builds/month, and 70 Resend emails/day or 2,100/month. The recoverable encrypted backup footprint is the controlling data cap whenever two matching sets would exceed the retained-artifact allowance; provider storage headroom does not override that lower ceiling. A stricter package cap controls.

Normal and abuse forecasts must retain at least 25% headroom before a stage starts. Quota-exhaustion tests must prove reason-neutral failure, no partial mutation, no data loss, and no automatic charge.

### Availability and operations

- Local development: no uptime objective.
- Shared Synthetic Alpha: a scheduled test window starts only after any paused project is explicitly resumed and frontend, backend, email-if-used, and backup-heartbeat checks pass. Record measured resume time; no maximum provider resume time is assumed. Any incomplete health check closes the window.
- Controlled Private Beta: 99.0% monthly availability target, five-minute external health checks, alert after two consecutive failures, and no planned maintenance during a scheduled owner session. A free-plan pause or missed recovery objective disables external testing until restored and rehearsed.
- Regional Public MVP: 99.5% monthly availability target, p95 public Browse/Details server response under two seconds excluding user network time, alert within ten minutes, and at most two hours of announced maintenance per month. A selected production plan must support this and the approved 15-minute RPO/four-hour RTO before release.

Monitoring payloads contain only endpoint/status, latency, environment, deployment digest, and content-free error identifiers. No email, token, trip content, note, review text, coordinates, evidence, or private object URL may leave the application for monitoring.

### Rollback and portability

Frontend rollback redeploys the last accepted Direct Upload artifact directory without rebuilding it and verifies the recorded artifact/deployment digest. Database changes use additive expand/contract migration and a tested rollback or forward-repair path. Provider capabilities have independent server kill switches. Reopening after restore requires matching artifact/schema/config hashes, invalidation of every pre-restore application/provider session, mandatory reauthentication, plus replay of deletion and revocation receipts.

Before each stage promotion, prove export to standard PostgreSQL logical data plus a complete Storage object manifest and objects. Provider cancellation, quota suspension, regional outage, and replacement are tested as stop/fallback scenarios. Provider convenience is never the only copy of a release receipt.

## Consequences

- Startup development and synthetic evidence can remain free.
- Controlled Private Beta may remain free only while recovery, security, media, email, staffing, and quota evidence passes.
- Public launch is deliberately blocked rather than pretending a free database tier meets a 15-minute RPO.
- Official media remains placeholders until a safe processing path is selected and proven.
- A custom public domain and any paid production recovery require later explicit Product Owner approval.
