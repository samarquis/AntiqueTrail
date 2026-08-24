begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(has_schema_privilege('authenticator','app_public','USAGE'),
  'PostgREST entry role has USAGE on the exposed catalog schema');
select ok(pg_has_role('authenticator','catalog_reader','MEMBER'),
  'PostgREST can assume the constrained catalog reader identity');
select ok(has_schema_privilege('catalog_reader','app_public','USAGE'),
  'catalog reader keeps USAGE on the exposed catalog schema');
select ok(has_function_privilege('catalog_reader','app_public.catalog_list(text,text,text)','EXECUTE'),
  'catalog reader may execute the list RPC');
select ok(not has_function_privilege('anon','app_public.catalog_list(text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','app_public.catalog_list(text,text,text)','EXECUTE'),
  'browser roles keep no direct execution on catalog RPCs');

select * from finish();
rollback;
