# Gates: Issue #174 Free/Gallery/Full Gallery tier enforcement

Scope: Forward-only migration from featured/unlimited to Free/Gallery/Full Gallery with single server-owned resolve_store_photo_cap authority, preserving pilot Free stores and uncapped shopper reads.

Base SHA: 97ab90a488903e5354506dcf1d69404695390a2b

- [ ] G1: Repository-wide inventory identifies every authoritative and presentation use of legacy tier names and count assumptions before migration
  CHECK: powershell -Command "Get-ChildItem -Path supabase -Recurse -Include *.sql | Select-String -Pattern 'featured|unlimited' | Measure-Object | ForEach-Object { $_.Count }"
  EXPECT: /^\d+$/
  EVIDENCE: pending

- [ ] G2: Forward-only migration converts stored values and constraints deterministically; rerun safe and rollback/repair documented
  CHECK: powershell -Command "Test-Path supabase/migrations/*174*.sql -or Test-Path supabase/migrations/*free_gallery*.sql"
  EXPECT: /True/
  EVIDENCE: pending

- [ ] G3: resolve_store_photo_cap is single server authority for intake and resubmit; cannot be overridden by client input
  CHECK: powershell -Command "Select-String -Pattern 'resolve_store_photo_cap' -Path supabase/migrations/*.sql | Measure-Object | Select-Object -ExpandProperty Count"
  EXPECT: /[1-9]/
  EVIDENCE: pending

- [ ] G4: Free (cover+5) and Gallery (cover+15) count boundaries include cover-vs-gallery, concurrent intake, pending/approved/rejected, replacement, idempotent retry
  CHECK: npx supabase@2.115.0 test db 2>&1
  EXPECT: /passing|passed/
  EVIDENCE: pending

- [ ] G5: Full Gallery never applies undisclosed count cap; denies with specific published non-count rule/reason/recovery/appeal when other limit applies
  CHECK: powershell -Command "Select-String -Pattern 'full_gallery' -Path supabase/migrations/*.sql | Measure-Object | Select-Object -ExpandProperty Count"
  EXPECT: /[1-9]/
  EVIDENCE: pending

- [ ] G6: Existing pilot stores remain Free indefinitely unless independently valid paid subscription changes tier
  CHECK: powershell -Command "Select-String -Pattern 'store_photo_tier_state' -Path supabase/migrations/*.sql | Measure-Object | Select-Object -ExpandProperty Count"
  EXPECT: /[1-9]/
  EVIDENCE: pending

- [ ] G7: Shopper catalog_details and gallery reads remain uncapped and return every approved published row deterministically
  CHECK: npm run check 2>&1
  EXPECT: /pass/
  EVIDENCE: pending

- [ ] G8: No legacy featured|unlimited value or user-facing label remains outside explicitly tested migration-compatibility boundary
  CHECK: powershell -Command "Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern 'featured|unlimited' | Where-Object { $_.Path -notlike '*node_modules*' } | Measure-Object | Select-Object -ExpandProperty Count"
  EXPECT: /0/
  EVIDENCE: pending

- [ ] G9: #123 and #124 consume new resolver/names rather than duplicating cap logic
  EVIDENCE: pending

- [ ] G10: Clean-reset and upgrade-path pgTAP, portal/media tests, security contract, check, and hosted database/web/plan-governance evidence recorded with SHAs
  CHECK: npm run security:contract 2>&1
  EXPECT: /pass/
  EVIDENCE: pending
