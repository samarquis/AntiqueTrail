# Issue #123 evidence inventory — 2026-08-31

Base SHA: 186e7b7
Candidate code SHA: ef09627e12832d5fad018747db4c9ca2db0643ab
Evidence ledger SHA: 6131a435c5eb5bffb49ecfd2fbc21c150444911f
Merged as: <pending> on `codex/issue-123-rejected-media-resubmission` -> PR #190

## Repair-round evidence — 2026-08-31

The original candidate `f175f78` failed independent review; the prior text in
this inventory is retained as historical context and is superseded for the
repaired code by this section.  The repaired candidate is not yet independently
reviewed, merged, or closing evidence.

- Authorization: `media_reserve_resubmission` invokes
  `portal_private.require_portal_scope()` and compares its resolved store to the
  locked rejected original.  The shared resolver enforces consent, session,
  MFA, recent auth, exactly one unrevoked active grant, and stage/audience.
- Privacy and idempotency: the SQL receipt exposes only an opaque upload id and
  replay state; the edge derives deterministic internal quarantine keys. The
  edge passes an SHA-256 file digest, which is stored and included in replay
  equality; the UI retains its idempotency key across an unchanged retry, skips
  completed replay storage, and safely resumes an interrupted replay.
- Staged UX: rejected history stays readable while M-01 is off, with no
  resubmit control. The dedicated Official photos route has safe placeholders,
  distinct state badges, a prominent rejected-item resubmit action, explicit
  loading/refresh failures, and focused completion feedback. The review harness
  fabricates a receipt only under the explicit `reviewMedia=resubmit` query
  flag; it remains labelled local synthetic evidence.
- Verification: focused Vitest commands passed (31, 41, and 53 tests); pgTAP
  0078 passed 27/27; a clean local reset plus full pgTAP passed 78 files / 2,160
  assertions; `npm run lint`; `npm run format`; `npm run security:contract`;
  `node --test scripts/plan-governance-contract.test.mjs`; `npm run build`; and
  `git diff --check` passed. Full UI-08 browser coverage passed 16 runnable
  tests across Chromium and mobile; four explicit evidence-capture cases were
  skipped.

## Changes (base-to-candidate)

- `supabase/migrations/20260831020000_media_reserve_resubmission.sql` (new): `resubmission_of` linkage column + `media_reserve_resubmission` forward-only RPC.
- `supabase/tests/0078_media_resubmission.sql` (new): plan(27) pgTAP contract for the resubmission lifecycle.
- `supabase/functions/media-provider-command/index.ts`: intake handler resubmission branch + `MediaCapDeniedError` 409.
- `supabase/functions/_shared/media-pipeline.ts`: `MediaIngestInput`/`reserve` accept `originalUploadId`.
- `src/features/portal/types.ts`, `portalClient.ts`, `components.tsx`: resubmit transport + dedicated Official photos UI; resubmit input omits store/kind.
- `src/features/portal/portalClient.test.ts`, `components.test.tsx`: portal transport/UI tests.
- `src/features/media/mediaPipeline.test.ts`, `mediaEdgeBoundary.test.ts`: resubmission wiring + edge boundary tests.
- `gates/issue-123.md`: current criterion-to-evidence map.

## Design notes

- `resubmission_of` is forward-only and nullable (line 12-14); no statement writes to the original row, preserving original immutability.
- Store/kind derived server-side from the locked rejected original (line 51-57); the RPC has no `p_store_id`/`p_kind` parameter, so a browser cannot pass store authority.
- Cap authority routes exclusively through `partner_private.check_store_media_cap(v_store_id,v_kind,p_idempotency_key)` (line 104), which delegates the count to `resolve_store_photo_cap(store_id)`. On denial it returns the structured `media_cap_exceeded` payload with `currentTier`/`upgradeTier`/`upgradeCap`/`approvedCount`/`cap` and creates no row (line 105-114).
- Cap check precedes quota; quota uses `pg_advisory_xact_lock` on the store hash (line 116-124). Daily 20 / concurrent 5.
- Missing-original deny passes `null,null` to `append_audit` (line 53) so an absent upload cannot fail an FK and leak existence as 23503 (found + fixed via 0078 test 10 during this session; initially it threw 23503).
- M-01 capability gate at line 63 (`media_private.capability_enabled()`); default test DB blocks it, so 0078 provisions the synthetic chain (release gate `provider_m` external_verified, accepted config, private_beta stage, `official_media_upload=true`).
- Client resubmit input (`PortalMediaResubmitInput`) omits `storeId`/`kind`; transport serializes only `originalUploadId`, `file`, `altText`, `rightsConfirmed`, `idempotencyKey`. `components.test.tsx` asserts the call arg has no `storeId`/`kind`.

## Verification evidence (2026-08-31)

- `npx supabase@2.115.0 db reset --local` then `npx supabase@2.115.0 test db`: clean reset applies all migrations (incl. 20260831020000); full pgTAP suite 78 files / 2,160 assertions all PASS (baseline 2133 + 27 in 0078).
- Focused Vitest commands: 31, 41, and 53 tests passed. `npm run lint`, `npm run format`, and `npm run build` passed.
- `npm run security:contract`: pass (secrets, licenses, action pins, migrations).
- `node --test scripts/plan-governance-contract.test.mjs`: 7/7 pass.
- `git diff --check`: pass (CRLF normalization notices only).

## Per-criterion evidence

Criterion-to-evidence mapping is in `gates/issue-123.md`. pgTAP assertions cited as 0078 test numbers: 1 valid resubmission (6 asserts), 2 idempotent replay, 3 same-key-change-input, 4 non-rejected, 5 foreign-store, 6 invalid-rights, 7 no-grant, 8 cover not count-capped, 9 over-cap structured denial, 10 missing-original.

## Limitations

- `npx playwright test e2e/ui08-partner-portal.spec.ts`: 16 runnable tests passed across Chromium and mobile; four explicit evidence-capture cases were skipped. The synthetic corrected-image journey proves 320px text-spacing/reflow, Chromium 200% page scale, dark theme, and forced colors; it does not prove live provider activation.
- No real-media activation, Stripe, or publication is exercised; the M-01 gate is only asserted via the synthetic provisioned chain (labeled, does not activate billing or publication).

## Rollback / forward repair

- Rerun safe: `add column if not exists`, `create or replace function`, grants guarded by owner role block; no destructive DDL.
- Rollback: drop `media_reserve_resubmission` and (after verifying no dependent logic) the `resubmission_of` column would need a table rebuild; the linkage column is nullable and safe to leave, so preferred repair is to keep the column and drop only the function, reverting client code from this diff.
- Do not delete audit/provenance rows created by the denied/allowed events.
