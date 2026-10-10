select set_config('test.issue634_saved_statement_timeout',current_setting('statement_timeout'),false);
select set_config('test.issue634_saved_lock_timeout',current_setting('lock_timeout'),false);
select set_config('statement_timeout','30s',false);
select set_config('lock_timeout','15s',false);
do $$begin raise notice 'issue634.phase.test_timeouts_set'; end $$;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
do $$begin raise notice 'issue634.phase.extensions_ready'; end $$;

-- Recover prior committed fixtures through account purge before recreating them.
do $$begin raise notice 'issue634.phase.prior_cleanup_begin'; end $$;
begin;
delete from app_private.account_deletion_requests
where deletion_request_id in ('63400000-0000-4000-8000-000000000030',
  '63400000-0000-4000-8000-000000000031','63400000-0000-4000-8000-000000000032',
  '63400000-0000-4000-8000-000000000040');
set local role identity_service;
update app_private.profiles set status='deletion_scheduled',
  deletion_due_at=statement_timestamp()-interval '1 day'
where user_id in ('63400000-0000-4000-8000-000000000001',
  '63400000-0000-4000-8000-000000000002','63400000-0000-4000-8000-000000000003',
  '63400000-0000-4000-8000-000000000006');
insert into app_private.account_deletion_requests(deletion_request_id,user_id,requested_at,due_at)
select case user_id
  when '63400000-0000-4000-8000-000000000001' then '63400000-0000-4000-8000-000000000030'::uuid
  when '63400000-0000-4000-8000-000000000002' then '63400000-0000-4000-8000-000000000031'::uuid
  when '63400000-0000-4000-8000-000000000003' then '63400000-0000-4000-8000-000000000032'::uuid
  when '63400000-0000-4000-8000-000000000006' then '63400000-0000-4000-8000-000000000040'::uuid end,
  user_id,statement_timestamp()-interval '8 days',statement_timestamp()-interval '1 day'
from app_private.profiles where user_id in ('63400000-0000-4000-8000-000000000001',
  '63400000-0000-4000-8000-000000000002','63400000-0000-4000-8000-000000000003',
  '63400000-0000-4000-8000-000000000006');
reset role;
select set_config('test.issue634_cleanup_limit',(
  select count(*)::text from app_private.account_deletion_requests
  where deletion_request_id in ('63400000-0000-4000-8000-000000000030',
    '63400000-0000-4000-8000-000000000031','63400000-0000-4000-8000-000000000032',
    '63400000-0000-4000-8000-000000000040')),false);
commit;
do $$begin raise notice 'issue634.phase.prior_cleanup_claim_begin'; end $$;
begin;
set local role account_lifecycle_service;
create temp table issue634_prior_claim as
select * from app_public.claim_due_account_deletions(statement_timestamp(),
  current_setting('test.issue634_cleanup_limit')::integer);
reset role;
reset test.issue634_cleanup_limit;
select app_public.prepare_account_deletion(deletion_request_id,claim_token,statement_timestamp())
from issue634_prior_claim;
commit;
do $$begin raise notice 'issue634.phase.prior_cleanup_prepare_complete'; end $$;
begin;
delete from app_private.account_deletion_requests
where deletion_request_id in ('63400000-0000-4000-8000-000000000030',
  '63400000-0000-4000-8000-000000000031','63400000-0000-4000-8000-000000000032',
  '63400000-0000-4000-8000-000000000040');
delete from auth.sessions where user_id in ('63400000-0000-4000-8000-000000000001',
  '63400000-0000-4000-8000-000000000002','63400000-0000-4000-8000-000000000003',
  '63400000-0000-4000-8000-000000000006');
delete from auth.users where id in ('63400000-0000-4000-8000-000000000001',
  '63400000-0000-4000-8000-000000000002','63400000-0000-4000-8000-000000000003',
  '63400000-0000-4000-8000-000000000006');
commit;
do $$begin raise notice 'issue634.phase.prior_cleanup_complete'; end $$;

-- dblink sessions need committed auth/session fixtures visible on both connections.
do $$begin raise notice 'issue634.phase.fixture_setup_begin'; end $$;
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('63400000-0000-4000-8000-000000000001','keyed-a@issue634.invalid',statement_timestamp()),
 ('63400000-0000-4000-8000-000000000002','keyed-b@issue634.invalid',statement_timestamp()),
 ('63400000-0000-4000-8000-000000000003','keyed-internal@issue634.invalid',statement_timestamp()),
 ('63400000-0000-4000-8000-000000000006','keyed-lost-response@issue634.invalid',statement_timestamp());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('63400000-0000-4000-8000-000000000011','63400000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
 ('63400000-0000-4000-8000-000000000016','63400000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
 ('63400000-0000-4000-8000-000000000017','63400000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
 ('63400000-0000-4000-8000-000000000012','63400000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp()),
 ('63400000-0000-4000-8000-000000000013','63400000-0000-4000-8000-000000000003',statement_timestamp(),statement_timestamp()),
 ('63400000-0000-4000-8000-000000000061','63400000-0000-4000-8000-000000000006',statement_timestamp(),statement_timestamp()),
 ('63400000-0000-4000-8000-000000000062','63400000-0000-4000-8000-000000000006',statement_timestamp(),statement_timestamp()),
 ('63400000-0000-4000-8000-000000000063','63400000-0000-4000-8000-000000000006',statement_timestamp(),statement_timestamp()),
 ('63400000-0000-4000-8000-000000000064','63400000-0000-4000-8000-000000000006',statement_timestamp(),statement_timestamp());
set local role identity_service;
update app_private.profiles set verified_email_snapshot=case user_id
  when '63400000-0000-4000-8000-000000000001' then 'keyed-a@issue634.invalid'
  when '63400000-0000-4000-8000-000000000002' then 'keyed-b@issue634.invalid'
  when '63400000-0000-4000-8000-000000000003' then 'keyed-internal@issue634.invalid'
  when '63400000-0000-4000-8000-000000000006' then 'keyed-lost-response@issue634.invalid' end,
  age_18_attested_at=statement_timestamp()
where user_id in ('63400000-0000-4000-8000-000000000001',
  '63400000-0000-4000-8000-000000000002','63400000-0000-4000-8000-000000000003',
  '63400000-0000-4000-8000-000000000006');
insert into app_private.role_grants(subject_user_id,role,state) values
 ('63400000-0000-4000-8000-000000000001','shopper','active'),
 ('63400000-0000-4000-8000-000000000002','shopper','active'),
 ('63400000-0000-4000-8000-000000000003','shopper','active'),
 ('63400000-0000-4000-8000-000000000006','shopper','active');
reset role;
commit;
do $$begin raise notice 'issue634.phase.fixture_setup_committed'; end $$;

begin;
select no_plan();
do $$begin raise notice 'issue634.phase.assertions_begin'; end $$;

select has_function('app_public','create_trip',array['text','text'],'legacy create overload remains');
select has_function('app_public','create_trip',array['text','text','uuid'],'keyed create overload exists');
select is(pg_get_function_arguments('app_public.create_trip(text,text,uuid)'::regprocedure),
  'name text, local_date text, idempotency_key uuid','PostgREST argument names remain exact');
select ok(has_function_privilege('authenticated','app_public.create_trip(text,text)','EXECUTE'),
  'legacy overload remains executable by authenticated');
select ok(has_function_privilege('authenticated','app_public.create_trip(text,text,uuid)','EXECUTE'),
  'keyed overload is executable by authenticated');
select ok(not has_function_privilege('anon','app_public.create_trip(text,text,uuid)','EXECUTE'),
  'anon cannot execute the keyed overload');
select ok(not has_function_privilege('service_role','app_public.create_trip(text,text,uuid)','EXECUTE'),
  'service_role cannot execute the keyed overload');
select ok(not exists(select 1 from pg_proc p cross join lateral
    aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid='app_public.create_trip(text,text,uuid)'::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE'),
  'PUBLIC has no execute grant on the keyed overload');
select ok((select proowner='identity_service'::regrole from pg_proc
    where oid='app_public.create_trip(text,text,uuid)'::regprocedure),
  'identity service owns the keyed overload');
select ok(not has_schema_privilege('identity_service','app_public','CREATE'),
  'temporary function-owner schema privilege is revoked');
set local role anon;
select throws_ok($$select app_public.create_trip('Denied anon execution','2030-10-12',
  '63400000-0000-4000-8000-000000000191')$$,'42501','permission denied for function create_trip',
  'anon is denied real execution of the keyed overload');
reset role;
set local role service_role;
select throws_ok($$select app_public.create_trip('Denied service execution','2030-10-12',
  '63400000-0000-4000-8000-000000000192')$$,'42501','permission denied for function create_trip',
  'service_role is denied real execution of the keyed overload');
reset role;
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='trip_private.trip_create_receipts'::regclass),'receipt table forces RLS');
select ok(exists(select 1 from pg_constraint where conrelid='trip_private.trip_create_receipts'::regclass
  and contype='p' and pg_get_constraintdef(oid) like '%actor_user_id, idempotency_key%'),
  'receipt key is actor-scoped');
select ok(has_table_privilege('identity_service','trip_private.trip_create_receipts','SELECT')
  and has_table_privilege('identity_service','trip_private.trip_create_receipts','INSERT')
  and not has_table_privilege('identity_service','trip_private.trip_create_receipts','UPDATE')
  and not has_table_privilege('identity_service','trip_private.trip_create_receipts','DELETE'),
  'identity service has only receipt select and insert');
select ok(not has_table_privilege('authenticated','trip_private.trip_create_receipts','SELECT')
  and not has_table_privilege('authenticated','trip_private.trip_create_receipts','INSERT')
  and not has_table_privilege('anon','trip_private.trip_create_receipts','SELECT')
  and not has_table_privilege('anon','trip_private.trip_create_receipts','INSERT')
  and not has_table_privilege('service_role','trip_private.trip_create_receipts','SELECT')
  and not has_table_privilege('service_role','trip_private.trip_create_receipts','INSERT')
  and not exists(select 1 from pg_class c cross join lateral
    aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where c.oid='trip_private.trip_create_receipts'::regclass
      and a.grantee=0 and a.privilege_type in ('SELECT','INSERT')),
  'browser and public roles cannot read or write receipts');
select is((select count(*)::integer from pg_policies
  where schemaname='trip_private' and tablename='trip_create_receipts'),1,
  'identity service is the only receipt table policy');
select ok((select roles=array['identity_service']::name[] and cmd='ALL' from pg_policies
  where schemaname='trip_private' and tablename='trip_create_receipts'),
  'receipt policy is limited to identity service');

select set_config('request.jwt.claims',
  '{"sub":"63400000-0000-4000-8000-000000000001","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000011"}',true);
select set_config('request.method','POST',true);
select set_config('request.path','rpc/create_trip',true);
set local role authenticated;
do $$begin raise notice 'issue634.phase.primary_rpc_begin'; end $$;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),
  'primary actor registers an active session');
select set_config('test.first',app_public.create_trip('Keyed replay','2030-10-12',
  '63400000-0000-4000-8000-000000000101')->>'id',true);
select set_config('test.replay',app_public.create_trip('Keyed replay','2030-10-12',
  '63400000-0000-4000-8000-000000000101')->>'id',true);
select is(current_setting('test.replay'),current_setting('test.first'),'same actor/key replays the original trip');
select set_config('test.date_replay',app_public.create_trip('Canonical date','2030-10-12',
  '63400000-0000-4000-8000-000000000102')->>'id',true);
select is(app_public.create_trip('Canonical date','2030-10-12 ',
  '63400000-0000-4000-8000-000000000102')->>'id',current_setting('test.date_replay'),
  'parsed-date spelling replays the same result');
select throws_ok($$select app_public.create_trip('Changed name','2030-10-12',
  '63400000-0000-4000-8000-000000000101')$$,'P0001','trip_create_idempotency_conflict',
  'same key with changed name conflicts');
select throws_ok($$select app_public.create_trip('Keyed replay','2030-10-13',
  '63400000-0000-4000-8000-000000000101')$$,'P0001','trip_create_idempotency_conflict',
  'same key with changed parsed date conflicts');
select throws_ok($$select app_public.create_trip('Missing key','2030-10-12',null)$$,
  '22023','trip_create_idempotency_key_required','null idempotency key is rejected');
select set_config('test.operation_one',app_public.create_trip('Intentional second create','2030-10-12',
  '56500000-0000-4000-8000-000000000111')->>'id',true);
select set_config('test.operation_two',app_public.create_trip('Intentional second create','2030-10-12',
  '56500000-0000-4000-8000-000000000112')->>'id',true);
select isnt(current_setting('test.operation_one'),current_setting('test.operation_two'),
  'new operation key creates a distinct trip');
reset role;

select is((select count(*)::integer from trip_private.trips
  where owner_id='63400000-0000-4000-8000-000000000001' and name='Keyed replay'),1,
  'replay creates one trip');
select is((select count(*)::integer from trip_private.trip_participants p join trip_private.trips t using(trip_id)
  where t.owner_id='63400000-0000-4000-8000-000000000001' and t.name='Keyed replay'
    and p.user_id=t.owner_id and p.participant_role='creator'),1,'replay creates one creator participant');
select is((select count(*)::integer from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000001'
    and idempotency_key='63400000-0000-4000-8000-000000000101'),1,'replay retains one receipt');
select is((select count(*)::integer from trip_private.trips
  where owner_id='63400000-0000-4000-8000-000000000001' and name='Canonical date'),1,
  'canonical replay creates one trip');
select is((select count(*)::integer from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000001'
    and idempotency_key='63400000-0000-4000-8000-000000000102'),1,
  'canonical replay creates one receipt');
select is((select count(*)::integer from trip_private.trip_participants p join trip_private.trips t using(trip_id)
  where t.owner_id='63400000-0000-4000-8000-000000000001' and t.name='Canonical date'
    and p.user_id=t.owner_id and p.participant_role='creator'),1,
  'canonical replay creates one creator participant');
select is((select count(*)::integer from trip_private.trips
  where owner_id='63400000-0000-4000-8000-000000000001' and name='Intentional second create'),2,
  'two distinct keys create two trips');
select is((select count(*)::integer from trip_private.trip_participants p join trip_private.trips t using(trip_id)
  where t.owner_id='63400000-0000-4000-8000-000000000001'
    and t.name='Intentional second create' and p.user_id=t.owner_id and p.participant_role='creator'),2,
  'two distinct keys create two creator participants');
select is((select count(*)::integer from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000001'
    and idempotency_key in ('56500000-0000-4000-8000-000000000111','56500000-0000-4000-8000-000000000112')),2,
  'two distinct keys create two receipts');

-- A committed create with an intentionally discarded result is replayed later.
select is(app_public.create_trip('Keyed replay','2030-10-12',
  '63400000-0000-4000-8000-000000000101')->>'id',current_setting('test.first'),
  'a later request replays after the first response was discarded');
set local role identity_service;
delete from trip_private.trips where trip_id=current_setting('test.first')::uuid;
reset role;
set local role authenticated;
select throws_ok($$select app_public.create_trip('Keyed replay','2030-10-12',
  '63400000-0000-4000-8000-000000000101')$$,'P0001','trip_create_result_deleted',
  'deleted result tombstone denies replacement');
reset role;
select is((select trip_id from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000001'
    and idempotency_key='63400000-0000-4000-8000-000000000101'),null::uuid,
  'trip deletion preserves a content-free receipt tombstone');
select is((select count(*)::integer from trip_private.trips
  where owner_id='63400000-0000-4000-8000-000000000001' and name='Keyed replay'),0,
  'deleted result does not create a replacement');

select set_config('request.jwt.claims',
  '{"sub":"63400000-0000-4000-8000-000000000002","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000012"}',true);
select set_config('request.path','rpc/register_current_session',true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),
  'second actor registers an active session');
select set_config('request.path','rpc/create_trip',true);
select set_config('test.actor_two',app_public.create_trip('Keyed replay','2030-10-12',
  '63400000-0000-4000-8000-000000000101')->>'id',true);
select isnt(current_setting('test.actor_two'),current_setting('test.first'),
  'same UUID key is independent for another actor');
reset role;
select is((select count(*)::integer from trip_private.trip_create_receipts
  where idempotency_key='63400000-0000-4000-8000-000000000101'),2,
  'same UUID key has separate actor-scoped receipts');

select set_config('request.jwt.claims',
  '{"sub":"63400000-0000-4000-8000-000000000001","role":"authenticated","session_id":"63400000-0000-4000-8000-000000009999"}',true);
set local role authenticated;
select throws_ok($$select app_public.create_trip('Keyed replay','2030-10-12',
  '63400000-0000-4000-8000-000000000101')$$,'P0001','authorization_lost',
  'inactive session cannot replay a prior result');
select throws_ok($$select app_public.create_trip('No active session','2030-10-12',
  '63400000-0000-4000-8000-000000000199')$$,'P0001','authorization_lost',
  'inactive session cannot create a trip');
reset role;
do $$begin raise notice 'issue634.phase.primary_rpc_complete'; end $$;

-- Concurrent matching requests must wait on the same actor/key transaction lock.
do $$begin raise notice 'issue634.phase.concurrent_race_begin'; end $$;
select extensions.dblink_connect('issue634_a','dbname=postgres application_name=issue634_a');
select extensions.dblink_exec('issue634_a','set statement_timeout = ''30s''');
select extensions.dblink_exec('issue634_a','set lock_timeout = ''15s''');
select extensions.dblink_connect('issue634_b','dbname=postgres application_name=issue634_b');
select extensions.dblink_exec('issue634_b','set statement_timeout = ''30s''');
select extensions.dblink_exec('issue634_b','set lock_timeout = ''15s''');
select extensions.dblink_exec('issue634_a',$remote$
  begin; set local role authenticated;
  set local request.method='POST'; set local request.path='rpc/register_current_session';
  set local request.jwt.claims='{"sub":"63400000-0000-4000-8000-000000000006","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000063"}';
  do $$begin perform app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint); end$$;
  commit;
$remote$);
select extensions.dblink_exec('issue634_b',$remote$
  begin; set local role authenticated;
  set local request.method='POST'; set local request.path='rpc/register_current_session';
  set local request.jwt.claims='{"sub":"63400000-0000-4000-8000-000000000006","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000064"}';
  do $$begin perform app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint); end$$;
  commit;
$remote$);
do $$begin raise notice 'issue634.phase.concurrent_sessions_registered'; end $$;
select extensions.dblink_exec('issue634_a',$remote$
  begin; set local role authenticated;
  set local request.method='POST'; set local request.path='rpc/create_trip';
  set local request.jwt.claims='{"sub":"63400000-0000-4000-8000-000000000006","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000063"}';
$remote$);
select extensions.dblink_exec('issue634_b',$remote$
  begin; set local role authenticated;
  set local request.method='POST'; set local request.path='rpc/create_trip';
  set local request.jwt.claims='{"sub":"63400000-0000-4000-8000-000000000006","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000064"}';
$remote$);
do $$begin raise notice 'issue634.phase.concurrent_a_ready'; end $$;
select extensions.dblink_send_query('issue634_a',$query$
  select app_public.create_trip('Concurrent keyed create','2030-10-12','63400000-0000-4000-8000-000000000103')
$query$);
do $$begin raise notice 'issue634.phase.concurrent_a_result_wait'; end $$;
select set_config('test.concurrent_a',(
  select result.value::text from extensions.dblink_get_result('issue634_a') as result(value jsonb)),true);
do $$begin raise notice 'issue634.phase.concurrent_a_result_ready'; end $$;
do $$begin raise notice 'issue634.phase.concurrent_b_ready'; end $$;
select extensions.dblink_send_query('issue634_b',$query$
  select app_public.create_trip('Concurrent keyed create','2030-10-12','63400000-0000-4000-8000-000000000103')
$query$);
do $$begin raise notice 'issue634.phase.concurrent_lock_probe'; end $$;
do $$
declare deadline timestamptz:=clock_timestamp()+interval '5 seconds';
begin
  perform set_config('test.concurrent_lock_observed','false',true);
  while clock_timestamp()<deadline loop
    if exists(select 1 from pg_catalog.pg_stat_activity b
      where b.application_name='issue634_b' and b.wait_event_type='Lock'
        and exists(select 1 from pg_catalog.pg_stat_activity a
          where a.application_name='issue634_a' and a.pid=any(pg_catalog.pg_blocking_pids(b.pid))) ) then
      perform set_config('test.concurrent_lock_observed','true',true); exit;
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end $$;
do $$begin raise notice 'issue634.phase.concurrent_lock_probe_complete'; end $$;
select is(current_setting('test.concurrent_lock_observed'),'true',
  'matching request waits on actor/key lock held by first transaction');
do $$begin raise notice 'issue634.phase.concurrent_a_commit'; end $$;
select extensions.dblink_exec('issue634_a','commit');
do $$begin raise notice 'issue634.phase.concurrent_b_result_wait'; end $$;
select set_config('test.concurrent_b',(
  select result.value::text from extensions.dblink_get_result('issue634_b') as result(value jsonb)),true);
do $$begin raise notice 'issue634.phase.concurrent_b_result_ready'; end $$;
select extensions.dblink_exec('issue634_b','commit');
select extensions.dblink_disconnect('issue634_a');
select extensions.dblink_disconnect('issue634_b');
select is((current_setting('test.concurrent_a')::jsonb->>'id'),
  (current_setting('test.concurrent_b')::jsonb->>'id'),'concurrent requests return one trip');
select is((select count(*)::integer from trip_private.trips
  where owner_id='63400000-0000-4000-8000-000000000006' and name='Concurrent keyed create'),1,
  'concurrent requests create one trip');
select is((select count(*)::integer from trip_private.trip_participants p join trip_private.trips t using(trip_id)
  where t.owner_id='63400000-0000-4000-8000-000000000006'
    and t.name='Concurrent keyed create' and p.user_id=t.owner_id and p.participant_role='creator'),1,
  'concurrent requests create one creator participant');
select is((select count(*)::integer from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000006'
    and idempotency_key='63400000-0000-4000-8000-000000000103'),1,
  'concurrent requests create one receipt');
do $$begin raise notice 'issue634.phase.concurrent_race_complete'; end $$;

-- Commit a create while discarding its response, then replay in a later transaction.
do $$begin raise notice 'issue634.phase.lost_response_begin'; end $$;
select extensions.dblink_connect('issue634_lost_first','dbname=postgres application_name=issue634_lost_first');
select extensions.dblink_exec('issue634_lost_first','set statement_timeout = ''30s''');
select extensions.dblink_exec('issue634_lost_first','set lock_timeout = ''15s''');
select extensions.dblink_connect('issue634_lost_replay','dbname=postgres application_name=issue634_lost_replay');
select extensions.dblink_exec('issue634_lost_replay','set statement_timeout = ''30s''');
select extensions.dblink_exec('issue634_lost_replay','set lock_timeout = ''15s''');
select extensions.dblink_exec('issue634_lost_first',$remote$
  begin; set local role authenticated;
  set local request.method='POST'; set local request.path='rpc/register_current_session';
  set local request.jwt.claims='{"sub":"63400000-0000-4000-8000-000000000006","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000061"}';
  do $$begin perform app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint); end$$;
  set local request.path='rpc/create_trip';
  do $$declare discarded jsonb; begin
    discarded:=app_public.create_trip('Committed lost response','2030-10-12','63400000-0000-4000-8000-000000000107');
  end$$;
  commit;
$remote$);
do $$begin raise notice 'issue634.phase.lost_response_first_committed'; end $$;
do $$begin raise notice 'issue634.phase.lost_response_receipt_capture'; end $$;
set local role identity_service;
select set_config('test.lost_expected',(
  select trip_id::text from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000006'
    and idempotency_key='63400000-0000-4000-8000-000000000107'),true);
reset role;
do $$begin raise notice 'issue634.phase.lost_response_replay_begin'; end $$;
select extensions.dblink_exec('issue634_lost_replay',$remote$
  begin; set local role authenticated;
  set local request.method='POST'; set local request.path='rpc/register_current_session';
  set local request.jwt.claims='{"sub":"63400000-0000-4000-8000-000000000006","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000062"}';
  do $$begin perform app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint); end$$;
  set local request.path='rpc/create_trip';
$remote$);
select extensions.dblink_send_query('issue634_lost_replay',$query$
  select app_public.create_trip('Committed lost response','2030-10-12','63400000-0000-4000-8000-000000000107')
$query$);
do $$begin raise notice 'issue634.phase.lost_response_result_wait'; end $$;
select set_config('test.lost_replay',(
  select result.value::text from extensions.dblink_get_result('issue634_lost_replay') as result(value jsonb)),true);
do $$begin raise notice 'issue634.phase.lost_response_result_ready'; end $$;
select extensions.dblink_exec('issue634_lost_replay','commit');
select extensions.dblink_disconnect('issue634_lost_first');
select extensions.dblink_disconnect('issue634_lost_replay');
select is(current_setting('test.lost_replay')::jsonb->>'id',current_setting('test.lost_expected'),
  'later independent request replays the persisted trip after the first response was discarded and committed');
select is((select count(*)::integer from trip_private.trips
  where owner_id='63400000-0000-4000-8000-000000000006' and trip_id=current_setting('test.lost_expected')::uuid
    and name='Committed lost response'),1,'lost-response replay leaves one persisted trip');
select is((select count(*)::integer from trip_private.trip_participants p
  where p.trip_id=current_setting('test.lost_expected')::uuid and p.user_id='63400000-0000-4000-8000-000000000006'
    and p.participant_role='creator'),1,'lost-response replay leaves one creator participant');
select is((select count(*)::integer from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000006'
    and idempotency_key='63400000-0000-4000-8000-000000000107'
    and trip_id=current_setting('test.lost_expected')::uuid),1,'lost-response replay leaves one persisted receipt');
do $$begin raise notice 'issue634.phase.lost_response_complete'; end $$;

-- Admit the same internal planning actor and session used by the existing 0120 fixture.
do $$begin raise notice 'issue634.phase.internal_fixture_begin'; end $$;
insert into internal_review_private.identities(user_id,alias,fixture_namespace,controlled_address)
values('63400000-0000-4000-8000-000000000003','shopper-a','review-reset-20260906',
  'shopper-a@review-reset-20260906.invalid');
insert into internal_review_private.runtime_binding values
 (1,'ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app','product-reset-task',statement_timestamp(),1);
insert into internal_review_private.authorizations(
 receipt_id,schema_version,context,owner_decision_reference,issuer_role,executor_task_id,teardown_owner,
 backend_project_ref,source_sha,artifact_digest,configuration_digest,deployment_id,exact_origin,runtime_version,
 fixture_manifest_digest,identity_allowlist,allowed_capabilities,excluded_provider_actions,issued_at,expires_at)
values ('63400000-0000-4000-8000-000000000031',1,'internal_synthetic_assessment','ADR0008 owner approval',
 'product_owner','01a07739-9f14-73c0-8253-2da0e5576afe','product-reset-task','ykyrvqddgnfmgftjwpts',
 repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app',1,repeat('d',64),
 array['63400000-0000-4000-8000-000000000003']::uuid[],
 array['catalog','session','shopper_planning'],array['email','external_participants','media','routing','payments','public_activation'],
 statement_timestamp(),statement_timestamp()+interval '20 minutes');
alter role authenticator set pgrst.db_pre_request='app_public.internal_review_pre_request';
select set_config('request.jwt.claims',
  '{"sub":"63400000-0000-4000-8000-000000000003","role":"authenticated","session_id":"63400000-0000-4000-8000-000000000013"}',true);
select set_config('request.method','POST',true);
select set_config('request.headers',
  '{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
select set_config('request.path','rpc/register_current_session',true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),
  'internal planning actor registers active session');
select set_config('request.path','rpc/create_trip',true);
select lives_ok($$select app_public.internal_review_pre_request()$$,
  'internal planning identity admits exact keyed create path');
select lives_ok($$select app_public.create_trip('Internal keyed fixture','2030-10-12',
  '63400000-0000-4000-8000-000000000104')$$,'keyed create passes admitted internal route');
select set_config('request.path','rpc/get_trip',true);
select throws_ok($$select app_public.create_trip('Wrong route fixture','2030-10-12',
  '63400000-0000-4000-8000-000000000105')$$,'42501','internal_fixture_denied',
  'wrong internal route is denied by existing trip fixture guard');
select set_config('request.path','',true);
select throws_ok($$select app_public.create_trip('Missing route fixture','2030-10-12',
  '63400000-0000-4000-8000-000000000106')$$,'42501','internal_fixture_denied',
  'missing internal route is denied by existing trip fixture guard');
reset role;
do $$begin raise notice 'issue634.phase.internal_fixture_complete'; end $$;

-- Exercise the real due-claim and prepare path; deleting one actor removes their
-- receipt tombstones and owned trips while preserving another actor's receipt.
do $$begin raise notice 'issue634.phase.account_purge_assertions_begin'; end $$;
set local role identity_service;
update app_private.profiles set status='deletion_scheduled',deletion_due_at=statement_timestamp()-interval '1 day'
where user_id='63400000-0000-4000-8000-000000000001';
insert into app_private.account_deletion_requests(deletion_request_id,user_id,requested_at,due_at)
values('63400000-0000-4000-8000-000000000030','63400000-0000-4000-8000-000000000001',
  statement_timestamp()-interval '8 days',statement_timestamp()-interval '1 day');
reset role;
set local role account_lifecycle_service;
create temp table issue634_claimed as
select * from app_public.claim_due_account_deletions(statement_timestamp(),10);
reset role;
do $$begin raise notice 'issue634.phase.account_purge_claim_query_complete'; end $$;
select is((select count(*)::integer from issue634_claimed),1,
  'account purge fixture is claimed through normal due-deletion path');
select lives_ok($$select app_public.prepare_account_deletion(
  '63400000-0000-4000-8000-000000000030',(select claim_token from issue634_claimed),statement_timestamp())$$,
  'existing account preparation purges keyed-create data');
select is((select count(*)::integer from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000001'),0,
  'profile purge cascades target actor receipts');
select is((select count(*)::integer from trip_private.trips
  where owner_id='63400000-0000-4000-8000-000000000001'),0,
  'existing account purge removes target owned trips');
select ok(exists(select 1 from trip_private.trip_create_receipts
  where actor_user_id='63400000-0000-4000-8000-000000000002'
    and idempotency_key='63400000-0000-4000-8000-000000000101'),
  'another actor receipt survives target account purge');
select ok(exists(select 1 from trip_private.trips
  where owner_id='63400000-0000-4000-8000-000000000002'),
  'another actor trip survives target account purge');
do $$begin raise notice 'issue634.phase.account_purge_assertions_complete'; end $$;

select * from finish();
rollback;

-- Purge every committed test actor and dblink result through account lifecycle.
do $$begin raise notice 'issue634.phase.final_cleanup_begin'; end $$;
begin;
delete from app_private.account_deletion_requests
where deletion_request_id in ('63400000-0000-4000-8000-000000000030',
  '63400000-0000-4000-8000-000000000031','63400000-0000-4000-8000-000000000032',
  '63400000-0000-4000-8000-000000000033','63400000-0000-4000-8000-000000000040');
set local role identity_service;
update app_private.profiles set status='deletion_scheduled',
  deletion_due_at=statement_timestamp()-interval '1 day'
where user_id in ('63400000-0000-4000-8000-000000000001',
  '63400000-0000-4000-8000-000000000002','63400000-0000-4000-8000-000000000003',
  '63400000-0000-4000-8000-000000000006');
insert into app_private.account_deletion_requests(deletion_request_id,user_id,requested_at,due_at) values
 ('63400000-0000-4000-8000-000000000030','63400000-0000-4000-8000-000000000001',
  statement_timestamp()-interval '8 days',statement_timestamp()-interval '1 day'),
 ('63400000-0000-4000-8000-000000000031','63400000-0000-4000-8000-000000000002',
  statement_timestamp()-interval '8 days',statement_timestamp()-interval '1 day'),
 ('63400000-0000-4000-8000-000000000032','63400000-0000-4000-8000-000000000003',
  statement_timestamp()-interval '8 days',statement_timestamp()-interval '1 day'),
 ('63400000-0000-4000-8000-000000000040','63400000-0000-4000-8000-000000000006',
  statement_timestamp()-interval '8 days',statement_timestamp()-interval '1 day');
reset role;
commit;
do $$begin raise notice 'issue634.phase.final_cleanup_claim_begin'; end $$;
begin;
set local role account_lifecycle_service;
create temp table issue634_cleanup_claim as
select * from app_public.claim_due_account_deletions(statement_timestamp(),10);
reset role;
select app_public.prepare_account_deletion(deletion_request_id,claim_token,statement_timestamp())
from issue634_cleanup_claim;
commit;
do $$begin raise notice 'issue634.phase.final_cleanup_prepare_complete'; end $$;
begin;
delete from app_private.account_deletion_requests
where deletion_request_id in ('63400000-0000-4000-8000-000000000030',
  '63400000-0000-4000-8000-000000000031','63400000-0000-4000-8000-000000000032',
  '63400000-0000-4000-8000-000000000040');
delete from auth.sessions where user_id in ('63400000-0000-4000-8000-000000000001',
  '63400000-0000-4000-8000-000000000002','63400000-0000-4000-8000-000000000003',
  '63400000-0000-4000-8000-000000000006');
delete from auth.users where id in ('63400000-0000-4000-8000-000000000001',
  '63400000-0000-4000-8000-000000000002','63400000-0000-4000-8000-000000000003',
  '63400000-0000-4000-8000-000000000006');
commit;
select set_config('statement_timeout',current_setting('test.issue634_saved_statement_timeout'),false);
select set_config('lock_timeout',current_setting('test.issue634_saved_lock_timeout'),false);
reset test.issue634_saved_statement_timeout;
reset test.issue634_saved_lock_timeout;
do $$begin raise notice 'issue634.phase.test_timeouts_restored'; end $$;
