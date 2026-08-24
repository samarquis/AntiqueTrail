-- Idempotent post-boot runbook for the local Supabase stack (issue #99).
-- Repairs a drifted RUNNING volume without the destructive `db reset`:
--
--   npm run db:post-boot
--
-- or against any environment:
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/stress/post-boot.sql
--
-- Fresh boots and resets do not need this script: migration
-- 20260824000000_post_boot_authenticator_privileges.sql already provisions
-- these privileges. The trailing DO block makes the script exit nonzero when
-- the repair did not take effect under ON_ERROR_STOP.
\echo 'privileges before:'
select has_schema_privilege('authenticator','app_public','USAGE') as authenticator_schema_usage,
  pg_has_role('authenticator','catalog_reader','MEMBER') as catalog_reader_membership;

grant usage on schema app_public to authenticator;
grant catalog_reader to authenticator;
notify pgrst, 'reload schema';

\echo 'privileges after:'
select has_schema_privilege('authenticator','app_public','USAGE') as authenticator_schema_usage,
  pg_has_role('authenticator','catalog_reader','MEMBER') as catalog_reader_membership;

do $$
begin
  if not has_schema_privilege('authenticator','app_public','USAGE')
    or not pg_has_role('authenticator','catalog_reader','MEMBER') then
    raise exception 'post-boot repair failed: authenticator privileges still missing';
  end if;
end
$$;
