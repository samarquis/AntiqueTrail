begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_function('app_public','shopper_save_state',array['uuid'],'authoritative save-state read exists');
select has_function('app_public','shopper_set_save',array['uuid','boolean'],'idempotent desired-state Save command exists');
select has_function('app_public','shopper_list_memories',array[]::text[],'history has an owner-scoped memory source');
select ok(has_function_privilege('authenticated','app_public.shopper_save_state(uuid)','EXECUTE'),'authenticated shopper may read own state through the boundary');
select ok(has_function_privilege('authenticated','app_public.shopper_set_save(uuid,boolean)','EXECUTE'),'authenticated shopper may request desired Save state');
select ok(has_function_privilege('authenticated','app_public.shopper_list_memories()','EXECUTE'),'authenticated shopper may list own memories');
select ok(not has_function_privilege('anon','app_public.shopper_set_save(uuid,boolean)','EXECUTE'),'anonymous Save remains denied');
select ok(position('on conflict' in lower(pg_get_functiondef('app_public.shopper_set_save(uuid,boolean)'::regprocedure)))>0,'repeating Save true is idempotent');
select ok(position('p_saved' in lower(pg_get_functiondef('app_public.shopper_set_save(uuid,boolean)'::regprocedure)))>0,'the server applies an explicit desired state rather than a toggle');
select ok(position('saved_stores' in lower(pg_get_functiondef('app_public.shopper_list_memories()'::regprocedure)))=0,'history does not depend on the saved-store set');

set local role authenticated;
select throws_ok(
  $$select app_public.shopper_set_save('00000000-0000-4000-8000-000000001001',true)$$,
  '42501','shopper_private_access_denied','inactive callers cannot write Save state'
);
select throws_ok(
  $$select app_public.shopper_list_memories()$$,
  '42501','shopper_private_access_denied','inactive callers cannot list memories'
);

select * from finish();
rollback;
