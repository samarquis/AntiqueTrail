begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_function('app_public','execute_regional_release_command',array['text','uuid','uuid','uuid[]','text'],'regional release command boundary exists');
select function_owner_is('app_public','execute_regional_release_command',array['text','uuid','uuid','uuid[]','text'],'release_automation','release automation owns the boundary');
select ok(has_function_privilege('release_executor','app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)','EXECUTE'),'constrained release executor can invoke the boundary');
select ok(not has_function_privilege('authenticated','app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)','EXECUTE'),'browser sessions cannot invoke release commands');
select ok(not has_function_privilege('anon','app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)','EXECUTE'),'anonymous callers cannot invoke release commands');
select throws_ok($$select app_public.execute_regional_release_command('unknown','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null,null)$$,'22023','release_command_invalid','unknown commands deny');
select throws_ok($$select app_public.execute_regional_release_command('promote','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null,null)$$,'22023','release_command_invalid','promotion without immutable receipts denies');
select throws_ok($$select app_public.execute_regional_release_command('rollback','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null,'')$$,'22023','release_command_invalid','rollback without a reason denies');

select * from finish();
rollback;
