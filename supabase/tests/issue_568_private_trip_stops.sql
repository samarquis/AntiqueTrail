begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select set_config('test.device_key_id','device-key-'||repeat('a',43),true);

select has_column('trip_private','trip_stops','private_name','private stop name remains private to the trip stop');
select has_column('trip_private','trip_stops','private_hours','shopper schedule is retained separately from route hours');
select has_column('trip_private','trip_stops','destination_status','address confirmation has explicit state');
select has_table('trip_private','private_stop_capability','private-stop server capability exists');
select is(
  (select tableowner from pg_catalog.pg_tables where schemaname='trip_private' and tablename='private_stop_capability'),
  'identity_service',
  'private-stop capability remains identity-service-owned');
select ok(
  not has_schema_privilege('identity_service','trip_private','CREATE')
  and not has_schema_privilege('identity_service','app_public','CREATE')
  and not has_schema_privilege('authenticated','trip_private','CREATE'),
  'temporary ownership grants are revoked and trip-private stays closed');
select has_column('trip_private','trip_visit_memories','memory_id','visit rows retain a durable memory ID');
select has_column('trip_private','trip_visit_memories','stop_id','new visit identity binds to a stop');
select has_column('trip_private','trip_visit_memories','private_stop_id','private visit linkage can be detached');
select is(
  (select pg_get_constraintdef(oid) from pg_catalog.pg_constraint
    where conrelid='trip_private.trip_visit_memories'::regclass and contype='p'),
  'PRIMARY KEY (memory_id)',
  'visit identity uses a stable memory UUID');
select is(
  (select is_nullable from information_schema.columns
    where table_schema='trip_private' and table_name='trip_visit_memories' and column_name='store_id'),
  'YES',
  'private visits can retain memory without a catalog store');
select has_function('app_public','add_private_trip_stop',array['text','text','text','text','jsonb','text','integer','bigint','text'],'private stop create RPC exists');
select has_function('app_public','update_private_trip_stop',array['text','text','text','text','text','jsonb','text','integer','bigint','text'],'private stop update RPC exists');
select has_function('app_public','confirm_trip_stop_destination',array['text','text','text','bigint','text'],'exact-address confirmation RPC exists');
select is(has_function_privilege('authenticated','app_public.add_private_trip_stop(text,text,text,text,jsonb,text,integer,bigint,text)','EXECUTE'),true,'authenticated can execute private-stop create');
select is(has_function_privilege('anon','app_public.add_private_trip_stop(text,text,text,text,jsonb,text,integer,bigint,text)','EXECUTE'),false,'anon cannot execute private-stop create');
select is(has_function_privilege('authenticated','app_public.update_private_trip_stop(text,text,text,text,text,jsonb,text,integer,bigint,text)','EXECUTE'),true,'authenticated can execute private-stop update');
select is(has_function_privilege('anon','app_public.update_private_trip_stop(text,text,text,text,text,jsonb,text,integer,bigint,text)','EXECUTE'),false,'anon cannot execute private-stop update');
select is(has_function_privilege('authenticated','app_public.confirm_trip_stop_destination(text,text,text,bigint,text)','EXECUTE'),true,'authenticated can execute private-stop confirmation');
select is(has_function_privilege('anon','app_public.confirm_trip_stop_destination(text,text,text,bigint,text)','EXECUTE'),false,'anon cannot execute private-stop confirmation');
select ok(
  (select count(*)=16 and bool_and(proowner='identity_service'::regrole)
   from pg_catalog.pg_proc where oid in (
     'trip_private.private_stop_capability_enabled()'::regprocedure,
     'trip_private.enforce_private_stop_capability()'::regprocedure,
     'trip_private.private_source_url_valid(text)'::regprocedure,
     'trip_private.private_hours_valid(jsonb)'::regprocedure,
     'trip_private.validate_private_stop_visit_memory()'::regprocedure,
     'trip_private.lock_private_stop_trip(uuid)'::regprocedure,
     'trip_private.private_stop_receipt_replay(uuid,bigint,text,text,text,bigint,jsonb,uuid)'::regprocedure,
     'app_public.remove_trip_stop(text,text,bigint)'::regprocedure,
     'app_public.complete_trip(text)'::regprocedure,
     'trip_private.project_completed_private_stops(uuid)'::regprocedure,
     'app_public.save_trip_visit_memory(text,text,integer,text,text)'::regprocedure,
     'app_public.accept_trip_invitation(text)'::regprocedure,
     'trip_private.trip_command_json(uuid)'::regprocedure,
     'app_public.add_private_trip_stop(text,text,text,text,jsonb,text,integer,bigint,text)'::regprocedure,
     'app_public.update_private_trip_stop(text,text,text,text,text,jsonb,text,integer,bigint,text)'::regprocedure,
     'app_public.confirm_trip_stop_destination(text,text,text,bigint,text)'::regprocedure)),
  'all migration-owned capability, receipt, lifecycle, and private-stop functions remain identity-service-owned');
select ok(
  not has_function_privilege('anon','trip_private.project_completed_private_stops(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','trip_private.project_completed_private_stops(uuid)','EXECUTE')
  and not has_function_privilege('service_role','trip_private.project_completed_private_stops(uuid)','EXECUTE'),
  'private completion projection remains internal to its guarded callers');
select ok(
  (select pg_get_functiondef('app_public.add_private_trip_stop(text,text,text,text,jsonb,text,integer,bigint,text)'::regprocedure) like '%lock_private_stop_trip%'
     and pg_get_functiondef('app_public.accept_trip_invitation(text)'::regprocedure) like '%for update%'
     and pg_get_functiondef('app_public.accept_trip_invitation(text)'::regprocedure) like '%trip_partner_join_private_stop%'),
  'create and invitation acceptance serialize on the trip and enforce the private-stop boundary');
select ok(
  (select indexdef ilike '%where ((stop_id is not null))%' or indexdef ilike '%where (stop_id is not null)%'
     from pg_catalog.pg_indexes where schemaname='trip_private' and indexname='trip_visit_memories_stop_identity_unique'),
  'new visits use stop identity independent of store');
select ok(
  (select indexdef like '%stop_id IS NULL%' and indexdef like '%store_id IS NOT NULL%'
     from pg_catalog.pg_indexes where schemaname='trip_private' and indexname='trip_visit_memories_legacy_store_unique'),
  'legacy catalog uniqueness applies only to legacy rows');

insert into auth.users(id,email,email_confirmed_at) values
  ('56800000-0000-4000-8000-000000000001','owner-568@example.invalid',statement_timestamp()),
  ('56800000-0000-4000-8000-000000000002','partner-568@example.invalid',statement_timestamp());
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('56800000-0000-4000-8000-000000000011','56800000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
  ('56800000-0000-4000-8000-000000000012','56800000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp());
set local role identity_service;
update app_private.profiles set verified_email_snapshot=case user_id
  when '56800000-0000-4000-8000-000000000001' then 'owner-568@example.invalid'
  when '56800000-0000-4000-8000-000000000002' then 'partner-568@example.invalid' end,
  age_18_attested_at=statement_timestamp()
where user_id in ('56800000-0000-4000-8000-000000000001','56800000-0000-4000-8000-000000000002');
insert into app_private.active_sessions(
  session_id,user_id,provider_created_at,session_epoch,state,last_authenticated_at,access_token_expires_at
)
select '56800000-0000-4000-8000-000000000011',p.user_id,statement_timestamp(),p.session_epoch,
  'active',statement_timestamp(),statement_timestamp()+interval '30 minutes'
from app_private.profiles as p where p.user_id='56800000-0000-4000-8000-000000000001';
insert into app_private.role_grants(subject_user_id,role,state) values
  ('56800000-0000-4000-8000-000000000001','shopper','active'),
  ('56800000-0000-4000-8000-000000000002','shopper','active');
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,version)
select fixtures.trip_id,'56800000-0000-4000-8000-000000000001',a.id,fixtures.name,date '2026-10-07',10
from (values
  ('56800000-0000-4000-8000-000000000101'::uuid,'Private stop trip'),
  ('56800000-0000-4000-8000-000000000102'::uuid,'Partner control trip'),
  ('56800000-0000-4000-8000-000000000103'::uuid,'Completion trip'),
  ('56800000-0000-4000-8000-000000000104'::uuid,'Stop cap trip'),
  ('56800000-0000-4000-8000-000000000105'::uuid,'Draft removal trip')
) as fixtures(trip_id,name)
cross join lateral (select id from app_public.catalog_areas order by sort_order,slug limit 1) as a;
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
select t.trip_id,t.owner_id,'creator' from trip_private.trips as t
where t.trip_id between '56800000-0000-4000-8000-000000000101' and '56800000-0000-4000-8000-000000000105';
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
values ('56800000-0000-4000-8000-000000000102','56800000-0000-4000-8000-000000000002','partner');
reset role;

set local role trip_email_key_manager;
insert into trip_private.email_hmac_keys(environment,purpose,key_version,key_material,state)
values ('shared_alpha','trip_invitation',568,extensions.digest(convert_to('issue-568-test-key','utf8'),'sha256'),'active');
reset role;
set local role identity_service;
insert into trip_private.trip_invitations(
  invitation_id,trip_id,token_hash,recipient_email_hmac,expires_at,state,idempotency_key,
  environment,purpose,email_hmac_key_version
)
select '56800000-0000-4000-8000-000000000201',
  '56800000-0000-4000-8000-000000000101',
  extensions.digest(convert_to(repeat('i',32),'utf8'),'sha256'),h.value,
  statement_timestamp()+interval '1 day','pending','issue568-private-boundary',
  'shared_alpha','trip_invitation',h.key_version
from trip_private.email_hmac('partner-568@example.invalid','trip_invitation','shared_alpha',568) as h;
reset role;

select set_config('test.private_hours',(
  select pg_catalog.jsonb_build_object(
    'timeZone','America/Chicago',
    'weekly',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'weekday',days.weekday,
      'label',case days.weekday when 0 then 'Sunday' when 1 then 'Monday' when 2 then 'Tuesday'
        when 3 then 'Wednesday' when 4 then 'Thursday' when 5 then 'Friday' else 'Saturday' end,
      'isClosed',days.weekday=0,
      'intervals',case when days.weekday=0 then '[]'::jsonb else
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('opensAt','09:00','closesAt','17:00')) end
    ) order by days.weekday) from pg_catalog.generate_series(0,6) as days(weekday)),
    'holidays','[]'::jsonb
  )::text
),true);

select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select ok((select not enabled from trip_private.private_stop_capability where singleton),
  'private-stop capability starts disabled until verification passes');
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'owner session registers');
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Hidden Finds','123 Main St','https://example.com/shop',
  current_setting('test.private_hours')::jsonb,'must',60,10,'add_private_trip_stop:disabled')$$,
  '55000','private_trip_stops_disabled','private-stop RPC stays disabled before the release gate');
reset role;
set local role identity_service;
update trip_private.private_stop_capability set enabled=true where singleton;
reset role;
set local role authenticated;

select set_config('test.created',app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Hidden Finds','123 Main St','https://example.com/shop',
  current_setting('test.private_hours')::jsonb,'must',60,10,'add_private_trip_stop:first'
)::text,true);
select is((current_setting('test.created')::jsonb->>'version')::bigint,11::bigint,'create increments trip version');
select is(current_setting('test.created')::jsonb #>> '{stops,0,kind}','private','created stop remains private');
select is(current_setting('test.created')::jsonb #>> '{stops,0,label}','Hidden Finds','private name is returned to its owner');
select is(current_setting('test.created')::jsonb #>> '{stops,0,address}','123 Main St','entered address is retained');
select is(current_setting('test.created')::jsonb #>> '{stops,0,shopperHours,timeZone}','America/Chicago','shopper timezone is returned separately');
select is(current_setting('test.created')::jsonb #>> '{stops,0,destination}','draft','new private address starts as a draft');
reset role;
select is((select count(*) from trip_private.trip_stops as s where s.trip_id='56800000-0000-4000-8000-000000000101'),1::bigint,'create inserts one stop row');
set local role authenticated;
select is(
  (app_public.add_private_trip_stop(
    '56800000-0000-4000-8000-000000000101','Hidden Finds','123 Main St','https://example.com/shop',
    current_setting('test.private_hours')::jsonb,'must',60,10,'add_private_trip_stop:first'
  )->'stops'->0->>'id'),
  (current_setting('test.created')::jsonb->'stops'->0->>'id'),
  'same-key retry returns original stop ID without adding another row');
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Hidden Finds','123 Main St','https://example.com/shop',
  current_setting('test.private_hours')::jsonb,'must',60,11,'add_private_trip_stop:first')$$,
  'P0001','conflict','same-key retry with a different expected version conflicts');
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Different Name','123 Main St','https://example.com/shop',
  current_setting('test.private_hours')::jsonb,'must',60,10,'add_private_trip_stop:first')$$,
  'P0001','conflict','changed-payload retry conflicts');
reset role;
select is((select version from trip_private.trips where trip_id='56800000-0000-4000-8000-000000000101'),11::bigint,'conflicting replay does not change version');
set local role authenticated;
select throws_ok($$select app_public.update_private_trip_stop(
  'not-a-trip-uuid',current_setting('test.created')::jsonb #>> '{stops,0,id}',
  'Hidden Finds','123 Main St','https://example.com/shop',current_setting('test.private_hours')::jsonb,
  'must',60,11,'update_private_trip_stop:invalid-trip')$$,
  'P0001','trip_id_invalid','update reports malformed trip identity distinctly');
select throws_ok($$select app_public.confirm_trip_stop_destination(
  'not-a-trip-uuid',current_setting('test.created')::jsonb #>> '{stops,0,id}',
  '123 Main St',11,'confirm_trip_stop_destination:invalid-trip')$$,
  'P0001','trip_id_invalid','confirmation reports malformed trip identity distinctly');

select set_config('test.replay_target',app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Second Private Stop','789 Side St',null,null,
  'prefer',45,11,'add_private_trip_stop:replay-target'
)::text,true);
select set_config('test.replay_target_id',(
  select stop->>'id'
  from jsonb_array_elements(current_setting('test.replay_target')::jsonb->'stops') as stops(stop)
  where stop->>'label'='Second Private Stop'
),true);
select set_config('test.updated',app_public.update_private_trip_stop(
  '56800000-0000-4000-8000-000000000101',current_setting('test.created')::jsonb #>> '{stops,0,id}',
  'Hidden Finds','456 New St','https://example.com/shop',current_setting('test.private_hours')::jsonb,
  'must',60,12,'update_private_trip_stop:address'
)::text,true);
select is(current_setting('test.updated')::jsonb #>> '{stops,0,address}','456 New St','update retains the edited address');
select is(current_setting('test.updated')::jsonb #>> '{stops,0,destination}','draft','address edit clears prior confirmation');
select throws_ok($$select app_public.update_private_trip_stop(
  '56800000-0000-4000-8000-000000000101',current_setting('test.replay_target_id'),
  'Hidden Finds','456 New St','https://example.com/shop',current_setting('test.private_hours')::jsonb,
  'must',60,12,'update_private_trip_stop:address')$$,
  'P0001','conflict','same update key cannot replay against a different stop');
select throws_ok($$select app_public.update_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','56800000-0000-4000-8000-000000000999',
  'Hidden Finds','456 New St','https://example.com/shop',current_setting('test.private_hours')::jsonb,
  'must',60,13,'update_private_trip_stop:missing')$$,
  'P0001','validation_failed','update rejects a missing private stop as invalid input');
select is(
  (app_public.confirm_trip_stop_destination(
    '56800000-0000-4000-8000-000000000101',current_setting('test.created')::jsonb #>> '{stops,0,id}',
    '456 New St',13,'confirm_trip_stop_destination:address'
  ) #>> '{stops,0,destination}'),
  'confirmed_by_organizer','organizer explicitly confirms the exact current address');
select throws_ok($$select app_public.confirm_trip_stop_destination(
  '56800000-0000-4000-8000-000000000101',current_setting('test.replay_target_id'),
  '456 New St',13,'confirm_trip_stop_destination:address')$$,
  'P0001','conflict','same confirmation key cannot replay against a different stop');
select throws_ok($$select app_public.confirm_trip_stop_destination(
  '56800000-0000-4000-8000-000000000101',current_setting('test.created')::jsonb #>> '{stops,0,id}',
  'Not the saved address',14,'confirm_trip_stop_destination:wrong')$$,
  'P0001','validation_failed','confirmation requires exact saved address');
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Bad Port','123 Main St','https://example.com:8443/shop',
  null,'must',60,14,'add_private_trip_stop:bad-url')$$,
  'P0001','validation_failed','non-default URL port is rejected');
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Bad Hours','123 Main St',null,
  '{"timeZone":"Not/A_Zone","weekly":[],"holidays":[]}'::jsonb,'must',60,14,'add_private_trip_stop:bad-hours')$$,
  'P0001','validation_failed','invalid IANA timezone is rejected');
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Extra Hours Field','123 Main St',null,
  current_setting('test.private_hours')::jsonb || '{"unexpected":"rejected"}'::jsonb,
  'must',60,14,'add_private_trip_stop:extra-hours')$$,
  'P0001','validation_failed','hours JSON rejects unknown fields at the RPC boundary');
select set_config('test.removal_created',app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000105','Draft Only Stop','23 Only St',null,null,
  'prefer',30,10,'add_private_trip_stop:unsaved-removal'
)::text,true);
select is((app_public.remove_trip_stop('56800000-0000-4000-8000-000000000105',
  current_setting('test.removal_created')::jsonb #>> '{stops,0,id}',11)->>'version')::bigint,
  12::bigint,'owner removes an unsaved private stop');
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000105','Draft Only Stop','23 Only St',null,null,
  'prefer',30,10,'add_private_trip_stop:unsaved-removal')$$,
  'P0001','conflict','removed unsaved stop cannot be resurrected by create replay');
select is(jsonb_array_length(app_public.get_trip('56800000-0000-4000-8000-000000000105')->'stops'),
  0,'removed unsaved private stop stays absent from owner projection');

select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000002","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000012"}',true);
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'invitee session registers');
select throws_ok($$select app_public.get_trip('56800000-0000-4000-8000-000000000101')$$,
  'P0001','authorization_lost','nonmember cannot read private trip fields');
select throws_ok($$select app_public.update_private_trip_stop(
  '56800000-0000-4000-8000-000000000101',current_setting('test.created')::jsonb #>> '{stops,0,id}',
  'Hidden Finds','456 New St','https://example.com/shop',current_setting('test.private_hours')::jsonb,
  'must',60,14,'update_private_trip_stop:foreign')$$,
  'P0001','authorization_lost','nonmember cannot update owner private stop fields');
select throws_ok($$select app_public.remove_trip_stop(
  '56800000-0000-4000-8000-000000000101',current_setting('test.created')::jsonb #>> '{stops,0,id}',14)$$,
  'P0001','not_allowed','nonmember cannot remove owner private stop');
reset role;
set local role identity_service;
insert into trip_private.trip_participants(trip_id,user_id,participant_role,state,left_at)
values ('56800000-0000-4000-8000-000000000101','56800000-0000-4000-8000-000000000002',
  'partner','revoked',statement_timestamp());
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000002","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000012"}',true);
select throws_ok($$select app_public.get_trip('56800000-0000-4000-8000-000000000101')$$,
  'P0001','authorization_lost','revoked former partner cannot read private trip fields');
select throws_ok($$select app_public.update_private_trip_stop(
  '56800000-0000-4000-8000-000000000101',current_setting('test.created')::jsonb #>> '{stops,0,id}',
  'Hidden Finds','456 New St','https://example.com/shop',current_setting('test.private_hours')::jsonb,
  'must',60,14,'update_private_trip_stop:foreign')$$,
  'P0001','authorization_lost','revoked former partner cannot update owner private stop fields');
select throws_ok($$select app_public.remove_trip_stop(
  '56800000-0000-4000-8000-000000000101',current_setting('test.created')::jsonb #>> '{stops,0,id}',14)$$,
  'P0001','not_allowed','revoked former partner cannot remove owner private stop');
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000101','Foreign','1 Other St',null,null,'must',60,14,'add_private_trip_stop:foreign')$$,
  'P0001','authorization_lost','nonowner cannot add private fields');
select throws_ok($$select app_public.accept_trip_invitation(repeat('i',32))$$,
  'P0001','trip_partner_join_private_stop','pending invite cannot join after a private stop is saved');
reset role;
set local role identity_service;
select is((select count(*) from trip_private.trip_participants as p
  where p.trip_id='56800000-0000-4000-8000-000000000101'
    and p.participant_role='partner' and p.state='active'),0::bigint,
  'blocked invitation acceptance creates no membership');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000102','Partner trip stop','123 Main St',null,null,'must',60,10,'add_private_trip_stop:partner')$$,
  'P0001','trip_private_stop_partner_conflict','owner cannot add a private stop while partner is active');
reset role;
set local role identity_service;
select is((select count(*) from trip_private.trip_stops as s where s.trip_id='56800000-0000-4000-8000-000000000102'),0::bigint,
  'active-partner denial leaves no private row');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select set_config('test.completion_stop',app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000103','Visited Private Shop','789 Visit St',null,null,
  'prefer',45,10,'add_private_trip_stop:completion'
)::text,true);
reset role;
set local role identity_service;
select throws_ok($$insert into trip_private.trip_stops(
  trip_id,kind,private_name,destination_status,position
) values ('56800000-0000-4000-8000-000000000101','private','Missing Address',
  'confirmed_by_organizer',7)$$,
  '23514','new row for relation "trip_stops" violates check constraint "stop_kind_shape"',
  'confirmed destination cannot exist without its exact address');
insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version)
select '56800000-0000-4000-8000-000000000103','56800000-0000-4000-8000-000000000001',
  extensions.digest(convert_to(current_setting('test.device_key_id'),'utf8'),'sha256'),p.session_epoch
from app_private.profiles as p where p.user_id='56800000-0000-4000-8000-000000000001';
update trip_private.trips as t set state='active',navigator_user_id=t.owner_id,
  navigator_device_hash=extensions.digest(convert_to(current_setting('test.device_key_id'),'utf8'),'sha256'),
  start_kind='manual',private_start_label='Home',departure_local_time=time '09:00',
  hours_reviewed_at=statement_timestamp(),
  hours_review_has_unresolved=trip_private.trip_has_unresolved_hours(t.trip_id),
  hours_warnings_acknowledged_at=case when trip_private.trip_has_unresolved_hours(t.trip_id)
    then statement_timestamp() else null end
where t.trip_id='56800000-0000-4000-8000-000000000103';
select set_config('test.completion_version',(
  select t.version::text from trip_private.trips as t
  where t.trip_id='56800000-0000-4000-8000-000000000103'
),true);
reset role;
set local role trip_go_gateway;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select set_config('test.skipped',app_public.execute_verified_go_command(
  '56800000-0000-4000-8000-000000000001','56800000-0000-4000-8000-000000000011',
  '56800000-0000-4000-8000-000000000103','skip_stop',
  current_setting('test.completion_stop')::jsonb #>> '{stops,0,id}',
  current_setting('test.completion_version')::bigint,current_setting('test.device_key_id'),
  '56800000-0000-4000-8000-000000000233',statement_timestamp())::text,true);
select is(current_setting('test.skipped')::jsonb #>> '{stops,0,state}','skipped',
  'navigator can skip a private stop before restoring it');
select set_config('test.restored',app_public.execute_verified_go_command(
  '56800000-0000-4000-8000-000000000001','56800000-0000-4000-8000-000000000011',
  '56800000-0000-4000-8000-000000000103','restore_stop',
  current_setting('test.completion_stop')::jsonb #>> '{stops,0,id}',
  (current_setting('test.skipped')::jsonb->>'version')::bigint,current_setting('test.device_key_id'),
  '56800000-0000-4000-8000-000000000234',statement_timestamp())::text,true);
select is(current_setting('test.restored')::jsonb #>> '{stops,0,state}','planned',
  'restore_stop restores a skipped stop to planned');
select set_config('test.completion_version',
  current_setting('test.restored')::jsonb->>'version',true);
reset role;
set local role identity_service;
update trip_private.private_stop_capability set enabled=false where singleton;
reset role;
set local role trip_go_gateway;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select throws_ok($$select app_public.execute_verified_go_command(
  '56800000-0000-4000-8000-000000000001','56800000-0000-4000-8000-000000000011',
  '56800000-0000-4000-8000-000000000103','mark_arrived',
  current_setting('test.completion_stop')::jsonb #>> '{stops,0,id}',
  current_setting('test.completion_version')::bigint,current_setting('test.device_key_id'),
  '56800000-0000-4000-8000-000000000231',statement_timestamp())$$,
  '55000','private_trip_stops_disabled','navigator progress commands cannot mutate private stops while capability is disabled');
reset role;
set local role identity_service;
update trip_private.private_stop_capability set enabled=true where singleton;
update trip_private.trip_stops as s set state='completed',completed_at=statement_timestamp()
where s.trip_id='56800000-0000-4000-8000-000000000103' and s.kind='private';
reset role;
set local role trip_go_gateway;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select set_config('test.completed',app_public.execute_verified_go_command(
  '56800000-0000-4000-8000-000000000001','56800000-0000-4000-8000-000000000011',
  '56800000-0000-4000-8000-000000000103','complete_trip',null,
  current_setting('test.completion_version')::bigint,current_setting('test.device_key_id'),
  '56800000-0000-4000-8000-000000000232',statement_timestamp())::text,true);
select is(current_setting('test.completed')::jsonb->>'state','completed','trip completion reaches its final state');
reset role;
set local role identity_service;
select is((select s.private_address from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000103' and s.kind='private'),null::text,
  'completion clears transient address from private trip stop');
select ok((select m.memory_id is not null and m.stop_id=s.stop_id and m.private_stop_id=s.stop_id
  and m.private_stop_name='Visited Private Shop' and m.private_stop_address='789 Visit St'
  from trip_private.trip_visit_memories as m join trip_private.trip_stops as s
    on s.trip_id=m.trip_id and s.stop_id=m.stop_id
  where m.trip_id='56800000-0000-4000-8000-000000000103'),
  'completion retains private name and address on durable stop-scoped visit row');
select set_config('test.completed_stop_id',(select s.stop_id::text from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000103' and s.kind='private'),true);
select set_config('test.visit_memory_id',(select m.memory_id::text from trip_private.trip_visit_memories as m
  where m.trip_id='56800000-0000-4000-8000-000000000103'),true);
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select is((app_public.save_trip_visit_memory(
  '56800000-0000-4000-8000-000000000103',current_setting('test.completed_stop_id'),5,'yes','Visited private shop'
  ) #>> '{stops,0,memoryStatus}'),'saved','owner can add a private note to the stop-scoped snapshot');
select is((app_public.remove_trip_stop('56800000-0000-4000-8000-000000000103',
  current_setting('test.completed_stop_id'),
  (current_setting('test.completed')::jsonb->>'version')::bigint)->>'version')::bigint,
  (current_setting('test.completed')::jsonb->>'version')::bigint+1,
  'owner can remove completed private stop while retaining its saved visit');
reset role;
set local role identity_service;
select ok((select m.private_stop_id is null and m.stop_id=current_setting('test.completed_stop_id')::uuid
  and m.memory_id=current_setting('test.visit_memory_id')::uuid
  and m.private_stop_name='Visited Private Shop' and m.private_stop_address='789 Visit St'
  and m.rating=5 and m.return_choice='yes' and m.note='Visited private shop'
  from trip_private.trip_visit_memories as m where m.trip_id='56800000-0000-4000-8000-000000000103'),
  'stop removal detaches linkage but preserves memory identity and snapshots');
reset role;
set local role authenticated;
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000103','Visited Private Shop','789 Visit St',null,null,
  'prefer',45,10,'add_private_trip_stop:completion')$$,
  'P0001','conflict','same-key retry after stop removal cannot resurrect the stop');
reset role;
set local role identity_service;
select is((select count(*) from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000103' and s.kind='private'),0::bigint,
  'removed private stop remains absent after receipt replay');

-- Same-store catalog stops remain distinct for new stop-scoped visits; legacy rows keep store uniqueness.
insert into trip_private.trip_stops(trip_id,kind,store_id,position)
select '56800000-0000-4000-8000-000000000102','store',s.id,nums.position
from (select id from app_public.stores order by id limit 1) as s
cross join (values (0::smallint),(1::smallint)) as nums(position);
update trip_private.trips as t set state='completed'
where t.trip_id='56800000-0000-4000-8000-000000000102';
update trip_private.trip_stops as s set state='completed',completed_at=statement_timestamp()
where s.trip_id='56800000-0000-4000-8000-000000000102' and s.kind='store';
select set_config('test.catalog_stop_a',(select s.stop_id::text from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000102' and s.position=0),true);
select set_config('test.catalog_stop_b',(select s.stop_id::text from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000102' and s.position=1),true);
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000002","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000012"}',true);
select throws_ok($$select app_public.save_trip_visit_memory(
  '56800000-0000-4000-8000-000000000102',current_setting('test.catalog_stop_a'),5,'yes','not a member')$$,
  'P0001','validation_failed','nonmember cannot author another trip visit memory');
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select throws_ok($$select app_public.save_trip_visit_memory(
  '56800000-0000-4000-8000-000000000103',current_setting('test.catalog_stop_a'),5,'yes','cross trip')$$,
  'P0001','validation_failed','stop identity cannot be used against a different trip');
select set_config('test.catalog_memory_a',app_public.save_trip_visit_memory(
  '56800000-0000-4000-8000-000000000102',current_setting('test.catalog_stop_a'),5,'yes','first visit')::text,true);
select app_public.save_trip_visit_memory(
  '56800000-0000-4000-8000-000000000102',current_setting('test.catalog_stop_b'),4,'maybe','second visit');
reset role;
select is((select count(*) from trip_private.trip_visit_memories as m
  where m.trip_id='56800000-0000-4000-8000-000000000102' and m.stop_id is not null),2::bigint,
  'the real writer creates one visit row for each same-store stop');
set local role authenticated;
select is((current_setting('test.catalog_memory_a')::jsonb #>> '{stops,0,memoryStatus}'),'saved',
  'writer projection marks the first stop memory saved');
select is((app_public.save_trip_visit_memory(
  '56800000-0000-4000-8000-000000000102',current_setting('test.catalog_stop_a'),3,'no','updated first visit'
  ) #>> '{stops,0,memoryStatus}'),'saved','same-stop writer replay keeps its stop-scoped row');
reset role;
select is((select count(distinct m.memory_id) from trip_private.trip_visit_memories as m
  where m.trip_id='56800000-0000-4000-8000-000000000102' and m.stop_id is not null),2::bigint,
  'replaying a visit update does not create a duplicate row');
set local role identity_service;
insert into trip_private.trip_visit_memories(author_user_id,trip_id,store_id,rating)
select '56800000-0000-4000-8000-000000000001','56800000-0000-4000-8000-000000000102',s.id,4
from (select id from app_public.stores order by id limit 1) as s;
select throws_ok($$insert into trip_private.trip_visit_memories(author_user_id,trip_id,store_id,rating)
  select '56800000-0000-4000-8000-000000000001','56800000-0000-4000-8000-000000000102',s.id,2
  from (select id from app_public.stores order by id limit 1) as s$$,
  '23505',null,'legacy store-scoped uniqueness still applies to null-stop rows');
select is((select count(*) from trip_private.trip_visit_memories as m
  where m.trip_id='56800000-0000-4000-8000-000000000102'),3::bigint,
  'two same-store stop identities coexist with one legacy store-scoped row');
select is((select count(distinct m.memory_id) from trip_private.trip_visit_memories as m
  where m.trip_id='56800000-0000-4000-8000-000000000102'),3::bigint,
  'legacy and new visit rows have distinct durable memory IDs');

-- A ninth row is rejected by the command before insertion.
insert into trip_private.trip_stops(trip_id,kind,private_name,position)
select '56800000-0000-4000-8000-000000000104','private','Existing '||nums.position,nums.position
from (select generate_series(0,7) as position) as nums;
set local role authenticated;
select throws_ok($$select app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000104','Ninth','123 Main St',null,null,'must',60,10,'add_private_trip_stop:ninth')$$,
  'P0001','trip_stop_limit_exceeded','ninth total stop is rejected');
reset role;

rollback;

create extension if not exists dblink with schema extensions;

-- Remove only this test's committed fixtures so interrupted prior runs are repeatable.
begin;
delete from trip_private.trip_invitations where invitation_id='56800000-0000-4000-8000-000000000331';
delete from trip_private.trips where trip_id='56800000-0000-4000-8000-000000000321';
delete from app_private.role_grants where subject_user_id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from app_private.profiles where user_id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from auth.sessions where id in
  ('56800000-0000-4000-8000-000000000311','56800000-0000-4000-8000-000000000312');
delete from auth.users where id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
set local role trip_email_key_manager;
delete from trip_private.email_hmac_keys
 where environment='shared_alpha' and purpose='trip_invitation' and key_version=569;
reset role;
commit;

begin;
insert into auth.users(id,email,email_confirmed_at) values
  ('56800000-0000-4000-8000-000000000301','race-owner-568@example.invalid',statement_timestamp()),
  ('56800000-0000-4000-8000-000000000302','race-partner-568@example.invalid',statement_timestamp());
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('56800000-0000-4000-8000-000000000311','56800000-0000-4000-8000-000000000301',statement_timestamp(),statement_timestamp()),
  ('56800000-0000-4000-8000-000000000312','56800000-0000-4000-8000-000000000302',statement_timestamp(),statement_timestamp());
set local role identity_service;
update app_private.profiles set verified_email_snapshot=case user_id
  when '56800000-0000-4000-8000-000000000301' then 'race-owner-568@example.invalid'
  when '56800000-0000-4000-8000-000000000302' then 'race-partner-568@example.invalid' end,
  age_18_attested_at=statement_timestamp()
where user_id in ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
insert into app_private.role_grants(subject_user_id,role,state) values
  ('56800000-0000-4000-8000-000000000301','shopper','active'),
  ('56800000-0000-4000-8000-000000000302','shopper','active');
reset role;
set local role trip_email_key_manager;
insert into trip_private.email_hmac_keys(environment,purpose,key_version,key_material,state)
values ('shared_alpha','trip_invitation',569,extensions.digest(convert_to('issue-568-race-key','utf8'),'sha256'),'active');
reset role;
set local role identity_service;
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,version)
select '56800000-0000-4000-8000-000000000321','56800000-0000-4000-8000-000000000301',a.id,
  'Private-stop race',date '2026-10-07',10
from (select id from app_public.catalog_areas order by sort_order,slug limit 1) as a;
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
values ('56800000-0000-4000-8000-000000000321','56800000-0000-4000-8000-000000000301','creator');
insert into trip_private.trip_invitations(
  invitation_id,trip_id,token_hash,recipient_email_hmac,expires_at,state,idempotency_key,
  environment,purpose,email_hmac_key_version
)
select '56800000-0000-4000-8000-000000000331',
  '56800000-0000-4000-8000-000000000321',
  extensions.digest(convert_to(repeat('r',32),'utf8'),'sha256'),h.value,
  statement_timestamp()+interval '1 day','pending','issue568-race-private-boundary',
  'shared_alpha','trip_invitation',h.key_version
from trip_private.email_hmac('race-partner-568@example.invalid','trip_invitation','shared_alpha',569) as h;
commit;

select extensions.dblink_connect('issue568_owner','dbname=postgres');
select extensions.dblink_connect('issue568_invitee','dbname=postgres');
select extensions.dblink_exec('issue568_owner',$remote$
  begin;
  do $$begin perform 1 from trip_private.trips
    where trip_id='56800000-0000-4000-8000-000000000321' for update; end$$;
  set local role authenticated;
  set local request.jwt.claims='{"sub":"56800000-0000-4000-8000-000000000301","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000311"}';
  do $$begin perform app_public.register_current_session(
    (extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint); end$$;
$remote$);
select extensions.dblink_exec('issue568_invitee',$remote$
  begin;
  create function pg_temp.try_accept_private_stop_race() returns text language plpgsql as $$
  begin
    perform app_public.accept_trip_invitation(repeat('r',32));
    return 'accepted';
  exception when others then return sqlerrm;
  end $$;
  grant execute on function pg_temp.try_accept_private_stop_race() to authenticated;
  set local role authenticated;
  set local request.jwt.claims='{"sub":"56800000-0000-4000-8000-000000000302","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000312"}';
  do $$begin perform app_public.register_current_session(
    (extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint); end$$;
$remote$);
select extensions.dblink_send_query('issue568_invitee','select pg_temp.try_accept_private_stop_race()');
select pg_sleep(0.2);
select extensions.dblink_send_query('issue568_owner',$query$
  select app_public.add_private_trip_stop(
    '56800000-0000-4000-8000-000000000321','Race Private Shop','123 Race St',null,null,
    'must',60,10,'add_private_trip_stop:race')
$query$);
select set_config('test.race_create',(
  select result.value::text from extensions.dblink_get_result('issue568_owner') as result(value jsonb)),false);
select extensions.dblink_exec('issue568_owner','commit');
select set_config('test.race_accept',(
  select result.value from extensions.dblink_get_result('issue568_invitee') as result(value text)),false);
select extensions.dblink_exec('issue568_invitee','commit');
select extensions.dblink_disconnect('issue568_owner');
select extensions.dblink_disconnect('issue568_invitee');

begin;
select is(current_setting('test.race_accept'),'trip_partner_join_private_stop',
  'concurrent invitation acceptance waits and is denied after private-stop creation');
select is((select count(*) from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000321' and s.kind='private'),1::bigint,
  'the racing owner creates exactly one private stop');
select is((select count(*) from trip_private.trip_participants as p
  where p.trip_id='56800000-0000-4000-8000-000000000321'
    and p.participant_role='partner' and p.state='active'),0::bigint,
  'racing invitee never becomes an active partner who can read the private stop');
delete from trip_private.trip_invitations where invitation_id='56800000-0000-4000-8000-000000000331';
delete from trip_private.trips where trip_id='56800000-0000-4000-8000-000000000321';
delete from app_private.role_grants where subject_user_id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from app_private.profiles where user_id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
delete from auth.sessions where id in
  ('56800000-0000-4000-8000-000000000311','56800000-0000-4000-8000-000000000312');
delete from auth.users where id in
  ('56800000-0000-4000-8000-000000000301','56800000-0000-4000-8000-000000000302');
set local role trip_email_key_manager;
delete from trip_private.email_hmac_keys
 where environment='shared_alpha' and purpose='trip_invitation' and key_version=569;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
select set_config('test.legacy_private',app_public.add_private_trip_stop(
  '56800000-0000-4000-8000-000000000105','Capability Check Shop','234 Main St',null,
  current_setting('test.private_hours')::jsonb,'prefer',45,10,'add_private_trip_stop:legacy-gate'
)::text,true);
reset role;
set local role identity_service;
with mixed_catalog_stop as (
  insert into trip_private.trip_stops(trip_id,kind,store_id,position)
  select '56800000-0000-4000-8000-000000000105','store',s.id,1
  from app_public.stores as s order by s.id limit 1
  returning stop_id
)
select set_config('test.mixed_catalog_stop',(select stop_id::text from mixed_catalog_stop),true);
update trip_private.trips set state='completed'
where trip_id='56800000-0000-4000-8000-000000000101';
update trip_private.trip_stops set state='completed',completed_at=statement_timestamp()
where trip_id='56800000-0000-4000-8000-000000000101' and kind='private';
update trip_private.private_stop_capability set enabled=false where singleton;
reset role;
set local role identity_service;
select throws_ok($$insert into trip_private.trip_stops(
  trip_id,kind,private_name,private_address,position
) values ('56800000-0000-4000-8000-000000000104','private','Blocked Stop','10 Hidden St',0)$$,
  '55000','private_trip_stops_disabled','table boundary blocks private-stop inserts while capability is disabled');
reset role;
select set_config('request.jwt.claims','{"sub":"56800000-0000-4000-8000-000000000001","role":"authenticated","session_id":"56800000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select throws_ok($$select app_public.reorder_trip_stop(
  '56800000-0000-4000-8000-000000000105',current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}',0)$$,
  '55000','private_trip_stops_disabled','private-target reorder remains disabled while capability is off');
select set_config('test.catalog_reordered',app_public.reorder_trip_stop(
  '56800000-0000-4000-8000-000000000105',current_setting('test.mixed_catalog_stop'),0
)::text,true);
select is(current_setting('test.catalog_reordered')::jsonb #>> '{stops,0,id}',
  current_setting('test.mixed_catalog_stop'),'catalog reorder remains available on a mixed trip while capability is off');
select set_config('test.catalog_removed',app_public.remove_trip_stop(
  '56800000-0000-4000-8000-000000000105',current_setting('test.mixed_catalog_stop'),
  (current_setting('test.catalog_reordered')::jsonb->>'version')::bigint
)::text,true);
select is(jsonb_array_length(current_setting('test.catalog_removed')::jsonb->'stops'),0,
  'catalog removal remains available when a private row follows it');
reset role;
set local role identity_service;
select is((select count(*) from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000105'
    and s.stop_id=(current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}')::uuid),1::bigint,
  'catalog edits preserve the hidden private stop');
select is((select s.position::integer from trip_private.trip_stops as s
  where s.trip_id='56800000-0000-4000-8000-000000000105'
    and s.stop_id=(current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}')::uuid),0,
  'catalog removal compacts the hidden private stop');
reset role;
set local role authenticated;
select throws_ok($$select app_public.set_trip_stop_priority(
  '56800000-0000-4000-8000-000000000105',current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}',
  'prefer',(current_setting('test.catalog_removed')::jsonb->>'version')::bigint)$$,
  '55000','private_trip_stops_disabled','same-value priority cannot mutate private stops while capability is disabled');
select throws_ok($$select app_public.set_trip_stop_priority(
  '56800000-0000-4000-8000-000000000105',current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}',
  'must',(current_setting('test.catalog_removed')::jsonb->>'version')::bigint)$$,
  '55000','private_trip_stops_disabled','priority cannot mutate private stops while capability is disabled');
select throws_ok($$select app_public.set_trip_stop_dwell(
  '56800000-0000-4000-8000-000000000105',current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}',
  45,(current_setting('test.catalog_removed')::jsonb->>'version')::bigint)$$,
  '55000','private_trip_stops_disabled','same-value dwell cannot mutate private stops while capability is disabled');
select throws_ok($$select app_public.set_trip_stop_dwell(
  '56800000-0000-4000-8000-000000000105',current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}',
  60,(current_setting('test.catalog_removed')::jsonb->>'version')::bigint)$$,
  '55000','private_trip_stops_disabled','dwell cannot mutate private stops while capability is disabled');
select throws_ok($$select app_public.update_private_trip_stop(
  '56800000-0000-4000-8000-000000000105',current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}',
  'Capability Check Shop','234 Main St',null,current_setting('test.private_hours')::jsonb,
  'prefer',45,(current_setting('test.legacy_private')::jsonb->>'version')::bigint,
  'update_private_trip_stop:disabled')$$,
  '55000','private_trip_stops_disabled','private-stop edits remain disabled with capability off');
select throws_ok($$select app_public.confirm_trip_stop_destination(
  '56800000-0000-4000-8000-000000000105',current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}',
  '234 Main St',(current_setting('test.legacy_private')::jsonb->>'version')::bigint,
  'confirm_trip_stop_destination:disabled')$$,
  '55000','private_trip_stops_disabled','destination confirmation remains disabled with capability off');
select throws_ok($$select app_public.remove_trip_stop(
  '56800000-0000-4000-8000-000000000105',current_setting('test.legacy_private')::jsonb #>> '{stops,0,id}',
  (current_setting('test.catalog_removed')::jsonb->>'version')::bigint)$$,
  '55000','private_trip_stops_disabled','private-stop removal remains disabled with capability off');
select throws_ok($$select app_public.save_trip_visit_memory(
  '56800000-0000-4000-8000-000000000101',current_setting('test.created')::jsonb #>> '{stops,0,id}',
  5,'yes','capability disabled')$$,
  '55000','private_trip_stops_disabled','private visit-memory writes stay disabled with private-stop capability');
select is(jsonb_array_length(app_public.get_trip('56800000-0000-4000-8000-000000000101')->'stops'),
  0,'disabled private-stop capability removes private fields from trip projection');
reset role;
select * from finish();
commit;
