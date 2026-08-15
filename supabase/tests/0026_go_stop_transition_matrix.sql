begin;
select plan(22);

select has_function('app_public','rename_trip',array['text','text','bigint','text'],'versioned/idempotent rename command exists');
select has_function('app_public','remove_trip_stop',array['text','text','bigint'],'versioned remove-stop command exists');
select has_function('app_public','set_trip_stop_priority',array['text','text','text','bigint'],'versioned priority command exists');
select has_function('app_public','set_trip_stop_dwell',array['text','text','integer','bigint'],'versioned dwell command exists');
select has_function('app_public','update_trip_schedule',array['text','text','integer','bigint'],'versioned schedule command exists');
select has_function('app_public','bind_navigator_device',array['text','text'],'Navigator device binding command exists');
select has_function('app_public','transfer_navigator_device',array['text','text','text'],'signed Navigator device transfer exists');
select has_function('app_public','prepare_offline_grant_claims',array['text','text','text','text'],'server canonicalizes offline grant claims');
select has_function('app_public','record_offline_grant_receipt',array['text','text','text','text','bigint','jsonb','timestamp with time zone'],'dedicated signer receipt boundary exists');
select ok(
  (select pg_get_functiondef(p.oid) like '%trip_private.consume_start_grant%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname='start_trip'),
  'start atomically consumes a signer-bound grant receipt');
select ok(not has_function_privilege('authenticated','app_public.record_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz)','EXECUTE'),
  'browser role cannot produce signed grant receipts');
select ok(has_function_privilege('trip_grant_signer','trip_private.produce_offline_grant_receipt(uuid,uuid,text,text,bigint,jsonb,timestamptz)','EXECUTE'),
  'dedicated signer credential can produce signed grant receipts');
select ok(pg_has_role('authenticator','trip_grant_signer','MEMBER'),
  'PostgREST authenticator can assume only the dedicated signer JWT role');

select ok(
  (select pg_get_functiondef(p.oid) like '%for update%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='trip_private' and p.proname='apply_go_stop_command'),
  'Go transition locks the stop before validating its state');

select ok(
  (select regexp_replace(pg_get_functiondef(p.oid),'[[:space:]]','','g') like '%current_state=''planned''andtarget_statein(''arrived'',''skipped'',''observed_closed'')%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='trip_private' and p.proname='apply_go_stop_command'),
  'planned stops have an explicit transition allowlist');

select ok(
  (select regexp_replace(pg_get_functiondef(p.oid),'[[:space:]]','','g') like '%current_state=''arrived''andtarget_statein(''completed'',''skipped'',''observed_closed'')%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='trip_private' and p.proname='apply_go_stop_command'),
  'arrived stops have an explicit transition allowlist');

select ok(
  (select replace(pg_get_functiondef(p.oid),' ','') like '%current_statein(''skipped'',''observed_closed'')andtarget_state=''planned''%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='trip_private' and p.proname='apply_go_stop_command'),
  'skipped and observed-closed stops can be restored to planned');

select ok(
  (select pg_get_functiondef(p.oid) like '%raise exception ''conflict''%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='trip_private' and p.proname='apply_go_stop_command'),
  'invalid direct transitions raise deterministic conflict');

select ok(
  (select pg_get_functiondef(p.oid) like '%when target_state=''arrived'' then statement_timestamp() when target_state=''planned'' then null else arrived_at end%'
      and pg_get_functiondef(p.oid) like '%when target_state=''completed'' then statement_timestamp() when target_state=''planned'' then null else completed_at end%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='trip_private' and p.proname='apply_go_stop_command'),
  'valid transitions preserve previously recorded timestamps');

select ok(
  (select pg_get_functiondef(p.oid) like '%trip_private.apply_go_stop_command%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname='mark_trip_stop_closed'),
  'observed-closed direct RPC uses the shared transition matrix');

select ok(
  (select pg_get_functiondef(p.oid) like '%trip_private.apply_go_stop_command%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname='restore_trip_stop'),
  'restore direct RPC uses the shared transition matrix');

select ok(
  (select pg_get_functiondef(p.oid) like '%trip_private.apply_go_stop_command%'
      and pg_get_functiondef(p.oid) like '%The stop transition conflicts with its current state.%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname='replay_trip_mutation'),
  'offline replay uses the matrix and returns deterministic conflict');

select * from finish();
rollback;
