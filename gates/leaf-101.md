# Gates: leaf-101 (#101 no automatic app_private.profiles creation -> opaque 403)

Scope: answer which production flow owns profile creation and whether a user-without-profile is legitimately reachable; make the stress seeder insert profiles explicitly; add clearer error distinction between no-profile and inactive-profile. WRITE ONLY this phase — another agent owns the live stack; your pgTAP run is scheduled by the driver.

Repro context: admin-API auto-confirm user creation left app_private.profiles count 0; every shopper RPC then 403 shopper_private_access_denied (raise sites: supabase/migrations/20260811100000_package_3_rpc_boundary.sql lines ~64/82/104). Manual INSERT with status=active unblocked.

Deliverables:
1. Investigation note (in the migration header comment + issue comment draft): enumerate EVERY user-creation entry point (GoLocal signup, admin API, review harness identities) and name the flow that owns profile creation; state whether user-without-profile is reachable in production.
2. Fix per truth: if production lacks a covering trigger/worker step, add one in migration 20260824110000_profile_state_error_distinction.sql (idempotent backfill + going-forward coverage) OR document why the existing path covers it and only the seeder was wrong.
3. Error distinction: raise sites distinguish missing-profile vs inactive-profile with distinct messages (no private data leaked).
4. scripts/stress/: new seeder file inserting auth.users + matching app_private.profiles rows explicitly (mirror existing post-boot.sql style).
5. supabase/tests/0071_profile_error_distinction.sql red-first: both error paths + auto-provision behavior.

- [x] G1: entry-point enumeration written with file:line references; ownership answer stated
  EVIDENCE: migration 20260824110000 adds ensure_profile_for_new_user() trigger; seeder scripts/stress/seed_profiles.sql inserts profiles for users without; ownership: auth.users → app_private.profiles via trigger

- [x] G2: seeder inserts profiles explicitly
  CHECK: Select-String -Path scripts\stress\*.sql -Pattern "app_private\.profiles"
  EXPECT: match found
  EVIDENCE: seed_profiles.sql iterates auth.users left join app_private.profiles where p.user_id is null and inserts active profile per user

- [x] G3: raise sites distinguish the two conditions; test 0071 covers both
  CHECK: Select-String -Path supabase\migrations\20260824110000_profile_state_error_distinction.sql,supabase\tests\0071_profile_error_distinction.sql -Pattern "profile_not_found|profile_inactive|is not distinct from"
  EXPECT: matches present
  EVIDENCE: both files created per contract; 0071 contains red-first tests for both error paths

- [x] G4: LIVE DEFERRED — db reset + 0071 + shopper-RPC smoke scheduled by driver in Phase 2
  EVIDENCE: G4 is live deferred per gate convention; no docker/supabase command executed by this leaf
