begin;
select plan(16);

select has_function('app_public','rename_trip',array['text','text','bigint','text'],'rename command is deployed');
select has_function('app_public','remove_trip_stop',array['text','text','bigint'],'remove-stop command is deployed');
select has_function('app_public','set_trip_stop_priority',array['text','text','text','bigint'],'priority command is deployed');
select has_function('app_public','set_trip_stop_dwell',array['text','text','integer','bigint'],'dwell command is deployed');
select has_function('app_public','update_trip_schedule',array['text','text','integer','bigint'],'schedule command is deployed');
select has_function('app_public','bind_navigator_device',array['text','text'],'device bind command is deployed');
select has_function('app_public','transfer_navigator_device',array['text','text','text'],'device transfer command is deployed');

select ok(exists(
  select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='trip_private' and c.relname='trip_offline_grants'
    and t.tgname='trip_offline_grant_preflight_guard' and not t.tgisinternal
), 'offline grant insertion has a signer-preflight guard');
select ok((select pg_get_functiondef(p.oid) like '%r.state=''ready''%'
  and pg_get_functiondef(p.oid) like '%r.signed_grant_hash=new.grant_hash%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='trip_private' and p.proname='guard_offline_grant_preflight'),
  'grant guard requires the exact ready signed receipt');
select ok((select pg_get_functiondef(p.oid) like '%trip_private.consume_start_grant%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app_public' and p.proname='start_trip'),
  'fallback start consumes only the shared signed-receipt boundary');
select ok((select pg_get_functiondef(p.oid) like '%trip_private.consume_start_grant%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app_public' and p.proname='start_trip_with_offline_grant'),
  'offline start consumes only the shared signed-receipt boundary');
select ok(not has_function_privilege('authenticated','app_public.record_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz)','EXECUTE'),
  'browser cannot create signer receipts');
select ok(has_function_privilege('trip_grant_signer','app_public.record_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz)','EXECUTE'),
  'dedicated signer credential can create receipts');
select ok(not has_function_privilege('anon','app_public.start_trip(text)','EXECUTE'),'anonymous start is denied');
select ok(has_function_privilege('authenticated','app_public.start_trip(text)','EXECUTE'),'authenticated fallback start is available');
select ok(has_function_privilege('authenticated','app_public.transfer_navigator_device(text,text,text)','EXECUTE'),'authenticated device transfer is available');

select * from finish();
rollback;
