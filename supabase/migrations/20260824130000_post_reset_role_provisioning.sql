-- Local test-suite role provisioning (issue #121).
--
-- The pinned CLI's local image moved from PostgreSQL 15 to 17. On PG17 a
-- membership granted by a CREATEROLE holder no longer implies SET ROLE, and
-- the reset pipeline provisions postgres with ADMIN-option-only memberships
-- (set=false, inherit=false) for every application service role. Roughly a
-- dozen legacy pgTAP files rely on the old PG15 behavior -- `set local role
-- <service_role>` straight after a fresh reset -- and only passed historically
-- because of ad-hoc grants that lived in the docker volume (see the issue #99
-- post-boot repair notes for the same drift pattern). This migration commits
-- that missing provisioning so `db reset` converges on one state by design.
--
-- Security: no new authority. postgres already holds ADMIN OPTION on each of
-- these roles (with which it could grant itself anything); this only restores
-- SET/INHERIT convenience for the local operator/test-runner account.
do $$
declare r record;
begin
  for r in
    select am.roleid::regrole as role_name
    from pg_auth_members am
    join pg_roles m on m.oid = am.member
    where m.rolname = 'postgres'
      and not am.set_option
      -- Skip roles that already have any SET-capable membership row.
      and not exists (
        select 1 from pg_auth_members am2
        where am2.roleid = am.roleid
          and am2.member = am.member
          and am2.set_option
      )
  loop
    -- This server's grammar accepts one membership option per GRANT, so the
    -- two options merge across two grants.
    execute format('grant %s to postgres with set true', r.role_name);
    execute format('grant %s to postgres with inherit true', r.role_name);
    -- Legacy pgTAP files resolve plan/ok/is/throws_ok while `set local role`
    -- is active, so each provisioned role also needs USAGE on schema
    -- extensions (the same privilege identity_service has held since
    -- 20260805010000). USAGE alone grants no function EXECUTE beyond defaults.
    execute format('grant usage on schema extensions to %I', r.role_name);
  end loop;
end $$;
