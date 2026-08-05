# M-01 official-media provider runbook

Status: **UNACCEPTED / NO-GO**

This runbook describes the executable provider-neutral boundary. It is not an
M-01 receipt. Unit fixtures, local scans, CI, an AI-authored document, or the
presence of provider environment variables cannot approve a processor, legal
terms, cost, region, retention, deletion behavior, or recovery behavior.
`official_media_upload` must remain absent or `false`,
`MEDIA_PROVIDER_GATE_ACCEPTED` must remain unset/`false`, and
`media_private.media_provider_config.state` must remain `blocked` until the
observations below are completed and accepted by the named humans.

## Implemented fail-closed boundary

- Browser uploads cross `media-provider-command`; there is no direct Storage or
  table write grant.
- Accepted source formats are JPEG, PNG, and WebP, with file-signature/MIME
  agreement, 8 MiB maximum source size, 8,192-pixel maximum side, and
  40,000,000-pixel maximum decoded area.
- Originals enter the nonpublic `official-media-private` bucket under an exact
  quarantine key. The scanner runs before the isolated decoder/re-encoder.
- Scanner error, timeout, malformed response, or any result other than an
  authoritative `clean` leaves the object quarantined and unpublished.
- Processing must return a WebP whose signature and dimensions are independently
  rechecked, at most 4 MiB, plus positive re-encode and metadata-removal
  attestations. Missing or contradictory evidence denies.
- Administrator approval requires an active session, Administrator role, MFA,
  recent authentication, exact upload version, and reason. Approval only moves
  the private derivative to `approved_pending_publish`.
- `media-lifecycle-worker` publishes the exact claimed derivative under an
  immutable key. Only successful public-object creation adds a catalog row.
- Replacement keeps the current cover live until successful publication.
  Rights/store/relationship withdrawal removes the catalog reference
  immediately and schedules exact private/public object deletion within 24
  hours.
- Private origins and review derivatives purge within 24 hours after successful
  publication. Rejected/quarantined uploads purge at 30 days. A purge receipt is
  completed only after every exact Storage delete succeeds.
- The database enforces 20 uploads/store/day and five concurrent uploads/store.
  Provider quota/cost monitoring must pause the capability at the stricter
  provider threshold; it may never authorize paid overage.
- Audit and provider-operation rows contain identifiers, outcomes, and times
  only—never file bytes, object paths, tokens, request/response bodies, EXIF, or
  private provider payloads.

## Deployment configuration

Keep values in protected function/deployment secret stores. Never use a
`VITE_*` variable for credentials.

| Component            | Required configuration                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Upload Edge function | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MEDIA_WORKER_JWT`, `APP_ORIGIN`, `MEDIA_PRIVATE_BUCKET=official-media-private` |
| Scan provider        | Exact `MEDIA_SCAN_URL`, protected `MEDIA_SCAN_TOKEN`, ten-second call deadline                                       |
| Processing provider  | Exact `MEDIA_PROCESSOR_URL`, protected `MEDIA_PROCESSOR_TOKEN`, fifteen-second call deadline                         |
| Upload gate          | `MEDIA_PROVIDER_GATE_ACCEPTED=true` only after the accepted database receipt below                                   |
| Lifecycle worker     | `MEDIA_WORKER_JWT`, `MEDIA_LIFECYCLE_JWT`, `MEDIA_SCHEDULER_TOKEN`, exact private/public bucket identifiers          |
| Browser presentation | Exact `/media/official/...` reverse-proxy route and CSP `img-src` host; no staging-bucket route                      |

The checked-in hourly workflow remains a safe skipped job while repository
variable `M01_MEDIA_LIFECYCLE_ENABLED` is absent or not `true`. Before enabling
it, configure protected secrets `M01_MEDIA_LIFECYCLE_FUNCTION_URL`,
`M01_MEDIA_FUNCTION_INVOKE_JWT`, and `M01_MEDIA_SCHEDULER_TOKEN`; run a manual
empty-queue invocation; then record the first observed publish and purge sweep.

The constrained JWTs must map exactly to `media_worker` and
`media_lifecycle_service`. A generic service-role key is not a substitute.
Provider URLs are deployment-owned exact HTTPS endpoints; no request field may
select a host or redirect destination.

## Evidence required before acceptance

Record dated, immutable links to observed results—not copied secrets or image
content.

1. Provider identity, processor role, contract/version, processing region,
   subprocessors, source/derivative retention, deletion SLA, export/replacement
   path, legal/privacy approval, and cancellation procedure.
2. Included quotas, bandwidth/storage/operation accounting, hard `$0` or
   separately approved spend ceiling, no automatic upgrade/overage, 25%
   headroom, 75% pause, and 90% media-disable behavior.
3. Auth method, secret custody/rotation/revocation, exact endpoints, deadline,
   retry/idempotency, response-loss reconciliation, and authoritative finality.
4. Witnessed allow fixtures for JPEG/PNG/WebP and deny fixtures for MIME
   mismatch, polyglot/truncation, decompression bomb, excessive bytes,
   dimensions/pixels, malformed decoder output, animated/unsupported forms, and
   scanner/processor timeout/outage.
5. Independent EXIF/GPS/IPTC/XMP/thumbnail/color-profile inspection proving the
   published derivative contains no prohibited metadata and differs from the
   source encoding.
6. Witnessed private staging, no anonymous/authenticated staging read, clean-only
   transition, derivative-only Administrator review, exact approval, immutable
   publication, cover replacement, and slot limits.
7. Witnessed rights withdrawal, rejected/quarantine expiry, private-after-publish
   cleanup, retry after partial Storage deletion, CDN/reverse-proxy purge, and
   primary deletion within 24 hours where required.
8. Matching Database and Storage backup/restore rehearsal. Reapply deletion and
   revocation receipts before routing traffic; prove deleted content ages out of
   managed backups within 30 days.
9. Redacted observability for provider latency/outcomes, queue age, oldest purge,
   byte/operation quotas, 75%/90% stops, and paging. Logs must contain no bytes,
   paths, signed URLs, tokens, EXIF, alt text, or user/provider payloads.
10. Named Product/Security/Operations owners record `PASS` or `NO-GO`, artifact
    digest, migration-set digest, configuration digest, evidence expiry, and
    superseded receipt. No implementer or AI self-certification is sufficient.

## Acceptance and activation order

1. Keep both gates off and deploy the schema/functions to a protected test
   environment.
2. Run CI, pgTAP `0056_m01_media_pipeline.sql`, and the hosted direct-call/RLS/
   Storage denial matrix.
3. Exercise the selected real provider with nonprivate approved fixtures and
   collect the evidence above.
4. The approved evidence service records an externally verified `provider_m`
   release-gate receipt. Do not insert a placeholder receipt.
5. Through the `media_deployment_service` identity, call
   `app_public.media_accept_provider_config(...)` with that exact receipt and the
   content-free configuration digest.
6. Through the existing deployment authority, set
   `environment_stage.capabilities.official_media_upload=true` in the intended
   stage. Application Administrators cannot do this.
7. Set `MEDIA_PROVIDER_GATE_ACCEPTED=true`, deploy both Edge functions and the
   exact reverse-proxy/CSP route, then run one allow and the full deny matrix.
8. Record the first successful scheduled private purge and an observed
   withdrawal/CDN purge before accepting M-01.

Any missing, stale, unknown, failed, or contradictory result is `NO-GO`. It
disables media only and never broadens access or authorizes invented evidence.

## Incident, rollback, and recovery

- Scanner/processor uncertainty, 75%/90% threshold, cost-cap risk, audit failure,
  restore fence, or security incident calls the worker-only
  `media_pause_capability(reason)` and disables the Edge environment gate.
- Pause prevents new reservation. It does not block exact quarantine/public
  deletion, rights withdrawal, or lifecycle reconciliation.
- Remove catalog references before application/artifact rollback. Continue exact
  purge jobs until Storage absence is confirmed; never mark a timeout as deleted.
- Restore only to an unroutable target with the capability off. Restore the
  matching database and both buckets, reapply deletion/withdrawal receipts, and
  verify no purged object or reference reappears before reopening.
- Reopening requires a new or still-valid human-accepted provider receipt,
  unchanged exact configuration digest, successful denial/deletion/recovery
  rehearsal, and a deployment-owned capability transition. There is no automatic
  recovery from `paused`.
