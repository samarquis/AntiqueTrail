# Gates: leaf-121 (#121 pgTAP failures + bad plans on fresh reset)

Scope: root-cause and fix the three failing pgTAP files so `npx supabase@2.115.0 test db` reports Result: PASS with no bad plans. You OWN the local Supabase stack this phase — you may run docker/supabase/psql freely; no other agent will touch it.

Facts: fresh reset boots all migrations green (CLI 2.115.0). Failures: supabase/tests/0062_regional_release_command_boundary.sql (Tests: 8, Failed: 3, tests 6-8), 0063_package_12_operational_command.sql (planned 36 ran 33, exit 3), 0067_package_9_reviewer_capability_completion.sql (planned 36 ran 31, exit 3). None reference bind_navigator_device or identity_service. Fix tests or migrations per truth; document any intentional behavior change in the touched test file header comment.

- [x] G1: repro captured — current failure output of the three files recorded verbatim (deciding lines only)
  CHECK: npx supabase@2.115.0 test db 2>&1 | Select-String -Pattern "0062|0063|0067|Failed|Bad plan"
  EXPECT: /Failed: [1-9]|Bad plan/
  EVIDENCE: 0062 "(Wstat: 0 Tests: 8 Failed: 3) Failed tests: 6-8" (caught 42501 permission denied for function execute_regional_release_command, wanted 22023 release_command_invalid) | 0063 ":55: ERROR: function throws_ok(unknown, unknown, unknown, unknown) does not exist … Bad plan. You planned 36 tests but ran 33." | 0067 ":55: ERROR: permission denied for function configure_reviewer_credential_reuse_key … Bad plan. You planned 36 tests but ran 31." | plus reset blocker found first: migration 20260824120000 "ERROR: must be owner of function rollback_regional_release (SQLSTATE 42501)"

- [x] G2: each failure has a written one-line root cause (assertion drift vs migration behavior change vs test-plan arithmetic) as a SQL comment at the fix site
  EVIDENCE: root-cause comments at fix sites — 0062:14-16 (EXECUTE reserved to release_executor; raw postgres had none → invoke as constrained role); 0063:50-55 (role hardened without USAGE on extensions → pgTAP helpers unresolvable under set role); 0067:41-45 (review_private functions execute only via review_automation/configurator roles); migrations: 20260824120000:39-45 (missing release_automation membership bracket) & :39-44 rollback-body restoration note; 20260821000000:23-25 (review_automation missing extensions USAGE for its own SECURITY DEFINER hmac calls); 20260822300000:40-42 (release_executor missing USAGE on app_public); 20260824130000 header (PG17 image grants postgres admin-option-only memberships → legacy set-role tests break on true fresh reset)

- [x] G3: fixes applied; no weakening of a real security/authorization guarantee to make a test pass (if a test asserts something the spec no longer wants, fix the TEST; if the migration broke a contract, fix the MIGRATION)
  EVIDENCE: zero assertions weakened/deleted; test edits add rolled-back-transaction self-provisioning per existing 0069 pattern; MIGRATION defects fixed at source — restored rollback guarantees the billing rewrite dropped (registration close mode='closed', store demotion audience='regional_readiness', review projection withdrawal, quarantine latch, active-state precondition — asserted by 0015 test 27) while adding only photo_tiers_enabled=false; granted review_automation/release_executor the schema reach their own contracts require; provisioning migration adds SET/INHERIT postgres already held ADMIN OPTION for (no new authority)

- [ ] G4: full suite green
  CHECK: npx supabase@2.115.0 test db
  EXPECT: /Result: PASS/
  EVIDENCE: all files pass except foreign untracked WIP supabase/tests/0072_stripe_flag_off_inert.sql (billing leaf's red-first file): ":11: ERROR: syntax error at or near \"from\" … Bad plan. You planned 47 tests but ran 3. Result: FAIL". One stray paren on line 11 (`bool_or(...))` closes the subquery before FROM). Out of scope per hard constraint; not touched.

- [ ] G5: second consecutive fresh reset + full suite still green (flake check)
  CHECK: npx supabase@2.115.0 db reset --local; if ($?) { npx supabase@2.115.0 test db }
  EXPECT: /Result: PASS/
  EVIDENCE: two consecutive fresh resets executed (g5_runA/g5_runB logs): both deterministic — identical single failure 0072_stripe_flag_off_inert.sql "planned 47 tests but ran 3", everything else ok including all three target files. Stable/flake-free once 0072 is fixed by its owner.
