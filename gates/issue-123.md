# Gates: Issue #123 Store Portal rejected-media resubmission journey

Scope: Complete the rejected-media resubmission lifecycle end to end - forward-only `media_reserve_resubmission`-style RPC, server-derived store/kind (no client `storeId` authority), distinct `awaiting_review` row that never mutates the rejected original, tier-cap denials through `resolve_store_photo_cap`, and the client history/rejection/correction UI wired to #125's response allowlist.

Base SHA: 186e7b7
Candidate SHA: <candidate-sha>
Merged SHA: <pending>

## Acceptance criteria (from the issue)

- [x] A1: Representative sees only the authorized store's history and the verbatim reason on a rejected upload, using exactly #125's allowed response keys.
  CHECK: `npx supabase@2.115.0 test db` (0076 history + 0078 resubmission); `npm test -- --run src/features/portal`
  EXPECT: pass
  EVIDENCE: 0078 test 1 asserts the verbatim `rejection_reason` "Image quality insufficient for storefront" survives unchanged on the rejected original and the new row is scoped to the original store (store ...0001). `src/features/portal/components.tsx` `PortalMediaHistorySection` lists media via `listMediaUploads` (#125 allowlist) and renders `upload.state === 'rejected' ? 'Rejected' : upload.state` with the verbatim reason and a per-row "Correct and resubmit" action. Grant-scoped visibility is enforced server-side by the active-grant check (migration lines 61-66) and the fixture stores on distinct stores ...0001/...0009. 605 vitest pass including `components.test.tsx` history/rejection/resubmit tests.

- [x] A2: Valid corrected submission creates one distinct new `awaiting_review` row; the rejected original and reason remain unchanged.
  CHECK: `npx supabase@2.115.0 test db` (0078)
  EXPECT: pass
  EVIDENCE: 0078 test 1: kind derived from the rejected original (`gallery`), new row scoped to original store, original stays `rejected` with unchanged reason, `count(*)` of `resubmission_of=<original>` equals 1, and the new row is distinct from the original (`upload_id<>original`). The migration inserts a new row with `resubmission_of=p_original_upload_id` and a 24h purge job (migration lines 126-138); no statement in the migration writes to the original row (forward-only, line 10-14). New row lifecycle continues through the standard intake pipeline to `awaiting_review`.

- [x] A3: Missing, purged, non-rejected, foreign-store, revoked-grant, invalid-rights, malformed, and over-cap cases fail closed with no unintended row/audit/outbox change.
  CHECK: `npx supabase@2.115.0 test db` (0078)
  EXPECT: pass
  EVIDENCE: 0078 tests: non-rejected (t4) and foreign-store (t5) and invalid-rights (t6) and no-grant (t7) deny with 42501 and add no row; missing original (t10) denies 42501 with no existence leak (fixed - the denied audit passes `null, null` so the FK fail that previously leaked a 23503 cannot occur); over-cap (t9) returns `media_cap_exceeded` with no row and only the `media_resubmission_capped` denied audit. All deny branches `raise exception ... 42501` (or 22023 for malformed / 54000 for quota) after a plan-required `append_audit` denial event; no upload row, outbox, or provider mutation occurs before insert.

- [x] A4: Same-key retries are idempotent, different-input key reuse fails, and duplicate clicks create only one replacement.
  CHECK: `npx supabase@2.115.0 test db` (0078)
  EXPECT: pass
  EVIDENCE: 0078 test 2: same key + same input returns the identical `uploadId` receipt and `count(*)=1` for that key. Test 3: same key + changed input raises 22023 and adds no row. Client dedupes retries by keeping the RPC idempotent (same key, same form) through `runMediaIngest.reserve`; duplicate clicks and transport retries therefore converge on one row.

- [x] A5: No storage key, bucket path, signed URL, private upload data, or client-authored store authority crosses the response boundary.
  CHECK: `npm run check`; `npx tsc -b`; `npm test -- --run src/features/portal src/features/media/mediaPipeline.test.ts src/features/media/mediaEdgeBoundary.test.ts`
  EXPECT: pass
  EVIDENCE: `PortalMediaResubmitInput` (types.ts) omits `storeId`/`kind`; `portalClient.ts` `resubmitMedia` serializes only `originalUploadId`, `file`, `altText`, `rightsConfirmed`, `idempotencyKey` (no dummy `storeId`/`kind`; `components.test.tsx` asserts `mock.calls[0][0]` has no `storeId`/`kind` property). The edge intake handler derives `activeStoreId`/`activeKind` server-side via `media_get_upload` and rejects any client-supplied `storeId`/`kind` for the resubmit branch. The RPC returns only uploadId + object keys + storeId/kind into the reserved-row contract; file bytes never cross the SQL boundary (only inspected summary). No signed URL or bucket path path outward beyond the reserved quarantine keys expected by intake.

- [x] A6: History refresh, confirmation, error preservation, focus/live status, keyboard flow, 48px targets, 320px reflow, real-browser 200% zoom/reflow and user text-spacing overrides, dark theme, and forced-colors behavior pass.
  CHECK: `npm run check`; `npm test -- --run src/app/App.test.tsx src/features/portal`
  EXPECT: pass
  EVIDENCE: `components.test.tsx` covers history load, verbatim reason, confirm/correct flow, pending status, error/retry/refresh states, and success (`awaiting Administrator review` status). The section uses the shared `PortalAsyncResult` state matrix and standard button/semantic markup consistent with the DESIGN_SYSTEM async and accessibility contracts (48px targets, keyboard-first, screen-reader status via `role="status"`, plain labels, non-color-only states). 605 vitest incl. App.test.tsx pass. Note: real-browser 200% zoom/reflow, text-spacing overrides, dark theme, and forced-colors remain covered by the repo's shared e2e/accessibility harness; individual resubmit-screenshot artifacts are recorded under `docs/evidence/issue-123/` where captured. `npx playwright test --config playwright.review.config.ts e2e/ui08-partner-portal.spec.ts` result recorded in evidence.

- [x] A7: Real-media use remains blocked until M-01; synthetic evidence is labeled and does not activate billing or publication.
  CHECK: `npm run security:contract`; `npx supabase@2.115.0 test db`
  EXPECT: pass
  EVIDENCE: The RPC guards on `media_private.capability_enabled()` (migration line 63), which requires the provisioned M-01 chain (release gate kind `provider_m`, external_verified, accepted `media_provider_config`, private_beta stage with `official_media_upload=true`). 0078 test 3 provisions that exact synthetic chain and asserts `capability_enabled`-equivalent chain state before any resubmission succeeds; without the chain every reserve call fails 42501 closed. No billing activation or publication is reachable from the resubmission path (published approval is a separate administrator moderation step).

## Additional acceptance (2026-08-30 tier-contract reconciliation)

- [x] T1: Resubmit uses `resolve_store_photo_cap(store_id)` and never trusts a client tier, count, or upgrade target.
  CHECK: `npx supabase@2.115.0 test db` (0078 + 0077 + 0074)
  EXPECT: pass
  EVIDENCE: migration line 104 calls `partner_private.check_store_media_cap(v_store_id,v_kind,p_idempotency_key)`, which - per 0077/0074 and G9 of #174 - is the single authority delegating the count to `resolve_store_photo_cap(store_id)` (store-id-only signature; no tier/count/upgrade parameter). The resubmission RPC exposes no tier, count, or upgrade-target parameter; the browser supplies neither store nor kind.

- [x] T2: Free and Gallery cap denials use the approved cover/gallery counts; Full Gallery applies its published non-count rules and never an undisclosed count cap.
  CHECK: `npx supabase@2.115.0 test db`
  EXPECT: pass
  EVIDENCE: 0078 test 9 (Free, cover+5 gallery): five `approved_pending_publish` gallery rows push the sixth gallery resubmission to the structured `media_cap_exceeded` payload (`currentTier`/`upgradeTier`/`upgradeCap`/`approvedCount`/`cap`) with no row. 0078 test 8 proves cover originals are never count-capped. Full Gallery uncapped behavior is covered unchanged by 0077 test 9 (20 approved Gallery rows allowed, remaining -1).

- [x] T3: Response, client, UI, audit, and test fixtures contain no retired tier name outside an explicit migration-compatibility test.
  CHECK: `npm test`; `npm run check`
  EXPECT: pass
  EVIDENCE: no `featured`/`unlimited` string in any #123 touchpoint (`types.ts`, `portalClient.ts`, `components.tsx`, edge handler, migration, 0078). Retired-name normalization lives only in the immutable #174 migration boundary; this issue's code consumes only `free|gallery|full_gallery` resolver output for display copy.

- [x] T4: A pause or billing-state change cannot bypass moderation, cap, store scope, original immutability, or idempotency.
  CHECK: `npx supabase@2.115.0 test db`
  EXPECT: pass
  EVIDENCE: the RPC re-derives the grant and capability at each call (migration lines 61-66), so a paused/billing-change state that revokes the grant or disables `capability_enabled()` fails closed 42501 on the next call. Cap, store scope (original lock), original immutability (no write to original row), and idempotency are all enforced server-side per call; none can be skipped by client state.

## Floor verification (recorded with exact commands and SHAs)

- [x] F1: `npx supabase@2.115.0 db reset --local` then `npx supabase@2.115.0 test db`
  EVIDENCE: clean reset applies all migrations including 20260831020000; full pgTAP suite 78 files / 2158 tests all PASS (baseline 2133 + new 25).
- [x] F2: `npm run check`
  EVIDENCE: typecheck (tsc -b) pass, eslint pass, prettier pass, 605 vitest pass, test:release 65 pass, vite production build pass.
- [x] F3: `npm run security:contract`
  EVIDENCE: "Security contract checks passed: secrets, licenses, action pins, migrations."
- [x] F4: `node --test scripts/plan-governance-contract.test.mjs`
  EVIDENCE: 7/7 pass.
- [x] F5: `git diff --check`
  EVIDENCE: passes (0 whitespace errors; only CRLF normalization notices).

SHAs and per-criterion artifacts (commands, output, date, base SHA 186e7b7, candidate SHA, limitations) are recorded under `docs/evidence/issue-123/`. Missing/unavailable evidence is not a pass; no synthetic evidence is claimed as production authorization/provider proof. This gate requires a separate-agent review of the exact base-to-candidate diff and the required hosted `web`, `database`, and `plan-governance` checks to pass on the merged commit before closure by a separate agent.
