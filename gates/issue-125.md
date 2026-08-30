# Gates: Issue #125 Portal media-history minimization

Scope: Restrict the Store Portal media-history RPC and every consumer to the six plan-authorized fields, without weakening store-scoped authorization or the #123 resubmission seam.

- [x] G1: The forward-only repair migration makes `portal_list_media_uploads()` return exactly `uploadId`, `kind`, `state`, `altText`, `submittedAt`, and `rejectionReason` for each upload.
  CHECK: npx supabase@2.115.0 test db supabase/tests/0076_portal_media_history.sql
  EXPECT: Files=1, Tests=
  EVIDENCE: Clean local reset applied `20260830190000_minimize_portal_media_history_response.sql`; targeted pgTAP passed 1 file / 21 tests.

- [x] G2: Strict Portal types, configured and unavailable clients, runtime decoding, fixtures, and Portal UI agree on the six-field history contract; no removed storage field is optional or retained.
  CHECK: npm test -- --run src/features/portal
  EXPECT: passed
  EVIDENCE: Focused Portal suite passed: 2 files / 20 tests; `npm run typecheck` passed.

- [x] G3: pgTAP proves the exact JSON key set, deterministic ordering, own-store access, and generic anonymous, no-grant, and cross-store denial without an existence signal.
  CHECK: npx supabase@2.115.0 test db supabase/tests/0076_portal_media_history.sql
  EXPECT: Files=1, Tests=
  EVIDENCE: `0076_portal_media_history.sql` passed 21 pgTAP assertions, including exact keys, storage-field absence, stable tie-break, own-store-only count, anon denial, and no-grant denial.

- [x] G4: Regression tests fail when an extra/renamed storage key reaches the server payload, decoder, or client fixture.
  CHECK: npm test -- --run src/features/portal
  EXPECT: passed
  EVIDENCE: Portal client tests reject `originalObjectKey` and `derivativeWidth` extras; pgTAP rejects an output key set other than the authorized six.

- [x] G5: The final candidate passes the repository, security, database, plan-governance, and whitespace floors without protected-plan changes.
  CHECK: npm run security:contract; if ($LASTEXITCODE -eq 0) { npm run check; if ($LASTEXITCODE -eq 0) { node --test scripts/plan-governance-contract.test.mjs; if ($LASTEXITCODE -eq 0) { git diff --check } } }
  EXPECT: passed
  EVIDENCE: Source candidate `2d20d924e22ac32baf314c316688d44a4b5eab1e`: security contract, plan-governance 7/7, full check (601 unit + 65 release + build), whitespace, and hosted-equivalent local pgTAP runner (76 files / 2,099 assertions) passed; base diff contains no protected files.

- [ ] G6: Criterion-level evidence, independent final review, required hosted checks, merged default-branch proof, issue closure, and checked TODO row are recorded.
  EVIDENCE: pending
