begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(2);

select ok(exists(
  select 1 from pg_catalog.pg_roles r
  where r.rolname='authenticator'
    and r.rolconfig @> array['pgrst.db_schemas=public, app_public']),
  'Data API exposes app_public (authenticator db-schemas role setting)');
select ok(has_schema_privilege('authenticator','app_public','USAGE'),
  'PostgREST entry role has USAGE on the app_public schema');

select * from finish();
rollback;