begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_function('app_public','execute_regional_release_command',array['text','uuid','uuid','uuid[]','text'],'regional release command boundary exists');
select function_owner_is('app_public','execute_regional_release_command',array['text','uuid','uuid','uuid[]','text'],'release_automation','release automation owns the boundary');
select ok(has_function_privilege('release_executor','app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)','EXECUTE'),'constrained release executor can invoke the boundary');
select ok(not has_function_privilege('authenticated','app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)','EXECUTE'),'browser sessions cannot invoke release commands');
select ok(not has_function_privilege('anon','app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)','EXECUTE'),'anonymous callers cannot invoke release commands');
-- Root cause (#121): the boundary's EXECUTE is reserved to release_executor
-- (revoked from public/anon/authenticated), and raw postgres holds none, so
-- these denials surfaced as 42501 instead of the expected 22023. Invoke them
-- as the constrained executor like the sibling command tests do.
grant release_executor to postgres;
-- The executor role is also hardened without extensions USAGE; pgTAP helpers
-- must stay resolvable while the denials run under this role (#121).
grant usage on schema extensions to release_executor;
set local role release_executor;
select throws_ok($$select app_public.execute_regional_release_command('unknown','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null,null)$$,'22023','release_command_invalid','unknown commands deny');
select throws_ok($$select app_public.execute_regional_release_command('promote','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null,null)$$,'22023','release_command_invalid','promotion without immutable receipts denies');
select throws_ok($$select app_public.execute_regional_release_command('rollback','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null,'')$$,'22023','release_command_invalid','rollback without a reason denies');
reset role;

select * from finish();
rollback;
