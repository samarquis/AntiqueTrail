# Gates: Issue #133 active revoke preview contract

Scope: require an operation-bound server preview for both exact representative-scope revoke and regrant flows.

- [x] G1: The browser client and Access Safety UI request an operation-specific preview before either exact scope mutation.
  CHECK: npm test -- --run src/features/admin/adminClient.test.ts src/features/admin/components.test.tsx
  EXPECT: Test Files  2 passed
  EVIDENCE: Start at  22:06:06 | Duration  5.31s (transform 292ms, setup 575ms, import 646ms, tests 2.91s, environment 2.62s)

- [x] G2: The public RPC accepts only a matching active/revoked grant preview, binds the requested operation, and consumes a valid preview for revoke or regrant.
  CHECK: rg -n "p_operation text|g\.state<>p_operation|preview\.preview_hash|preview\.consumed_at" supabase/migrations/20260828110000_fix_admin_scope_preview_contract.sql
  EXPECT: p_operation text
  EVIDENCE: 122:    or preview.preview_hash<>extensions.digest( | 177:    case when p_operation='regrant' then prior_app_grant else null end,p_expected_version,preview.preview_hash,

- [x] G3: Database contract coverage guards active-preview-revoke and expired/replayed preview denial.
  CHECK: rg -n "active scope preview permits revoke|expired, replayed, or operation-mismatched scope previews" supabase/tests/0060_package_7_operational_admin.sql
  EXPECT: active scope preview permits revoke
  EVIDENCE: 137:  'active scope preview permits revoke and hashes the requested operation'); | 144:  'expired, replayed, or operation-mismatched scope previews deny revoke and regrant');

- [x] G4: The changed focused client/UI and database contracts pass.
  CHECK: npm test -- --run src/features/admin/adminClient.test.ts src/features/admin/components.test.tsx
  EXPECT: Test Files  2 passed
  EVIDENCE: Start at  22:06:13 | Duration  5.28s (transform 264ms, setup 543ms, import 564ms, tests 3.07s, environment 2.31s)

- [ ] G5: Formatting and type validation accept the narrow change.
  CHECK: npm run typecheck
  EXPECT: exit 0
  EVIDENCE: pending
