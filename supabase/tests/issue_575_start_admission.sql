begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'app_public','prepare_initial_navigator',array['text','bigint','text'],
  'versioned initial Navigator admission exists');
select has_function(
  'app_public','verify_initial_navigator_device',array['text','text'],
  'read-only initial-device verification exists');
select ok(
  has_function_privilege('authenticated','app_public.verify_initial_navigator_device(text,text)','EXECUTE'),
  'authenticated callers can verify the current Navigator device');
select ok(
  not has_function_privilege('anon','app_public.verify_initial_navigator_device(text,text)','EXECUTE'),
  'anonymous callers cannot verify the Navigator device');
select ok(
  has_function_privilege('authenticated','app_public.prepare_initial_navigator(text,bigint,text)','EXECUTE'),
  'authenticated callers can request guarded admission');
select ok(
  not has_function_privilege('anon','app_public.prepare_initial_navigator(text,bigint,text)','EXECUTE'),
  'anonymous callers cannot request admission');
select ok(
  position('for update' in lower(pg_get_functiondef('app_public.prepare_initial_navigator(text,bigint,text)'::regprocedure)))
    < position('if v_version <> expected_version' in lower(pg_get_functiondef('app_public.prepare_initial_navigator(text,bigint,text)'::regprocedure)))
    and position('if v_version <> expected_version' in lower(pg_get_functiondef('app_public.prepare_initial_navigator(text,bigint,text)'::regprocedure)))
    < position('update trip_private.trip_device_bindings' in lower(pg_get_functiondef('app_public.prepare_initial_navigator(text,bigint,text)'::regprocedure))),
  'trip lock and expected-version gate precede device binding side effects');

insert into auth.users(id,email,email_confirmed_at) values
  ('57500000-0000-4000-8000-000000000001','creator-575@example.invalid',statement_timestamp()),
  ('57500000-0000-4000-8000-000000000002','partner-575@example.invalid',statement_timestamp());
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('57500000-0000-4000-8000-000000000011','57500000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
  ('57500000-0000-4000-8000-000000000012','57500000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp());

set local role identity_service;
update app_private.profiles set
  verified_email_snapshot=case user_id
    when '57500000-0000-4000-8000-000000000001' then 'creator-575@example.invalid'
    else 'partner-575@example.invalid' end,
  age_18_attested_at=statement_timestamp()
where user_id in ('57500000-0000-4000-8000-000000000001','57500000-0000-4000-8000-000000000002');
insert into app_private.role_grants(subject_user_id,role,state) values
  ('57500000-0000-4000-8000-000000000001','shopper','active'),
  ('57500000-0000-4000-8000-000000000002','shopper','active');

with area as (
  select id from app_public.catalog_areas order by sort_order limit 1
), fixtures(trip_id,name) as (values
  ('57500000-0000-4000-8000-000000000101'::uuid,'Initial trip'),
  ('57500000-0000-4000-8000-000000000102'::uuid,'Stale-version trip'),
  ('57500000-0000-4000-8000-000000000103'::uuid,'Other-Navigator trip'),
  ('57500000-0000-4000-8000-000000000104'::uuid,'Invalid-session trip')
)
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,state,version)
select f.trip_id,'57500000-0000-4000-8000-000000000001',a.id,f.name,current_date,'ready',1
from area a cross join fixtures f;

insert into trip_private.trip_participants(trip_id,user_id,participant_role) values
  ('57500000-0000-4000-8000-000000000101','57500000-0000-4000-8000-000000000001','creator'),
  ('57500000-0000-4000-8000-000000000102','57500000-0000-4000-8000-000000000001','creator'),
  ('57500000-0000-4000-8000-000000000103','57500000-0000-4000-8000-000000000001','creator'),
  ('57500000-0000-4000-8000-000000000103','57500000-0000-4000-8000-000000000002','partner'),
  ('57500000-0000-4000-8000-000000000104','57500000-0000-4000-8000-000000000001','creator');
insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version)
values (
  '57500000-0000-4000-8000-000000000103',
  '57500000-0000-4000-8000-000000000002',
  extensions.digest(convert_to('device-key-' || repeat('B',43),'utf8'),'sha256'),
  1
);
update trip_private.trips set
  navigator_user_id='57500000-0000-4000-8000-000000000002',
  navigator_device_hash=extensions.digest(convert_to('device-key-' || repeat('B',43),'utf8'),'sha256')
where trip_id='57500000-0000-4000-8000-000000000103';
insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version)
values (
  '57500000-0000-4000-8000-000000000101',
  '57500000-0000-4000-8000-000000000001',
  extensions.digest(convert_to('device-key-' || repeat('A',43),'utf8'),'sha256'),
  1
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57500000-0000-4000-8000-000000000011"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'creator session registers');
select set_config('request.jwt.claims','{"sub":"57500000-0000-4000-8000-000000000002","role":"authenticated","session_id":"57500000-0000-4000-8000-000000000012"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'partner session registers');
select set_config('request.jwt.claims','{"sub":"57500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57500000-0000-4000-8000-000000000011"}',true);

select is(
  (app_public.verify_initial_navigator_device('57500000-0000-4000-8000-000000000101','device-key-' || repeat('A',43))->>'currentDeviceBound')::boolean,
  false,'an existing creator binding does not prove an unassigned Navigator device');
select throws_ok(
  $$select app_public.verify_initial_navigator_device('57500000-0000-4000-8000-000000000101',null)$$,
  'P0001','not_allowed','missing device key is denied during read-only verification');
reset role;
set local role identity_service;
select is((select version from trip_private.trips where trip_id='57500000-0000-4000-8000-000000000101'),1::bigint,'read-only verification leaves trip version unchanged');
select is((select count(*) from trip_private.trip_device_bindings where trip_id='57500000-0000-4000-8000-000000000101'),1::bigint,'read-only verification leaves the existing binding count unchanged');
select is((select state from trip_private.trip_device_bindings where trip_id='57500000-0000-4000-8000-000000000101' and user_id='57500000-0000-4000-8000-000000000001'), 'active','read-only verification leaves the existing binding active');
reset role;
set local role authenticated;
select is(
  app_public.prepare_initial_navigator('57500000-0000-4000-8000-000000000101',1,'device-key-' || repeat('A',43))->>'navigatorUserId',
  '57500000-0000-4000-8000-000000000001','creator becomes the initial Navigator');
select is(
  (app_public.verify_initial_navigator_device('57500000-0000-4000-8000-000000000101','device-key-' || repeat('A',43))->>'currentDeviceBound')::boolean,
  true,'read-only verification confirms the assigned current device');
select is(
  (app_public.prepare_initial_navigator('57500000-0000-4000-8000-000000000101',1,'device-key-' || repeat('A',43))->>'tripVersion')::bigint,
  2::bigint,'same-user/device replay returns the original resulting version');
select is(
  (app_public.verify_initial_navigator_device('57500000-0000-4000-8000-000000000101','device-key-' || repeat('C',43))->>'currentDeviceBound')::boolean,
  false,'a different device cannot prove the assigned binding');
select throws_ok(
  $$select app_public.prepare_initial_navigator('57500000-0000-4000-8000-000000000101',1,'device-key-' || repeat('C',43))$$,
  'P0001','not_allowed','same-user replay from another device is denied neutrally');

select throws_ok(
  $$select app_public.prepare_initial_navigator('57500000-0000-4000-8000-000000000102',1,null)$$,
  'P0001','not_allowed','missing device key is denied before binding');
reset role;
set local role identity_service;
select is((select version from trip_private.trips where trip_id='57500000-0000-4000-8000-000000000102'),1::bigint,'missing-key denial leaves trip version unchanged');
select is((select count(*) from trip_private.trip_device_bindings where trip_id='57500000-0000-4000-8000-000000000102'),0::bigint,'missing-key denial creates no device binding');
reset role;
set local role authenticated;
select throws_ok(
  $$select app_public.prepare_initial_navigator('57500000-0000-4000-8000-000000000102',99,'device-key-' || repeat('A',43))$$,
  'P0001','not_allowed','stale expected version is denied neutrally');
select set_config('request.jwt.claims','{"sub":"57500000-0000-4000-8000-000000000002","role":"authenticated","session_id":"57500000-0000-4000-8000-000000000012"}',true);
select throws_ok(
  $$select app_public.prepare_initial_navigator('57500000-0000-4000-8000-000000000102',1,'device-key-' || repeat('B',43))$$,
  'P0001','not_allowed','a different account cannot self-assign the creator trip');
select set_config('request.jwt.claims','{"sub":"57500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57500000-0000-4000-8000-000000000011"}',true);
select throws_ok(
  $$select app_public.prepare_initial_navigator('57500000-0000-4000-8000-000000000103',1,'device-key-' || repeat('C',43))$$,
  'P0001','not_allowed','another Navigator is never replaced');
select set_config('request.jwt.claims','{"sub":"57500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57500000-0000-4000-8000-000000000099"}',true);
select throws_ok(
  $$select app_public.prepare_initial_navigator('57500000-0000-4000-8000-000000000104',1,'device-key-' || repeat('A',43))$$,
  'P0001','not_allowed','an inactive session is denied neutrally');
reset role;

set local role identity_service;
select is((select version from trip_private.trips where trip_id='57500000-0000-4000-8000-000000000101'),2::bigint,'initial admission increments version exactly once');
select is((select count(*) from trip_private.trip_device_bindings where trip_id='57500000-0000-4000-8000-000000000101' and user_id='57500000-0000-4000-8000-000000000001' and state='active'),1::bigint,'same-user/device replay leaves one active binding');
select is((select count(*) from trip_private.trip_device_bindings where trip_id='57500000-0000-4000-8000-000000000101' and user_id='57500000-0000-4000-8000-000000000001' and device_hash=extensions.digest(convert_to('device-key-' || repeat('C',43),'utf8'),'sha256')),0::bigint,'wrong-device denial makes no binding');
select is((select version from trip_private.trips where trip_id='57500000-0000-4000-8000-000000000102'),1::bigint,'stale-version denial leaves trip version unchanged');
select is((select count(*) from trip_private.trip_device_bindings where trip_id='57500000-0000-4000-8000-000000000102'),0::bigint,'stale-version denial has no binding side effect');
select is((select navigator_user_id from trip_private.trips where trip_id='57500000-0000-4000-8000-000000000103'),'57500000-0000-4000-8000-000000000002'::uuid,'other Navigator remains assigned');
select is((select version from trip_private.trips where trip_id='57500000-0000-4000-8000-000000000103'),1::bigint,'other-Navigator denial leaves trip version unchanged');
select is((select count(*) from trip_private.trip_device_bindings where trip_id='57500000-0000-4000-8000-000000000103' and user_id='57500000-0000-4000-8000-000000000001'),0::bigint,'other-Navigator denial has no binding side effect');
select is((select version from trip_private.trips where trip_id='57500000-0000-4000-8000-000000000104'),1::bigint,'inactive-session denial leaves trip version unchanged');
select is((select count(*) from trip_private.trip_device_bindings where trip_id='57500000-0000-4000-8000-000000000104'),0::bigint,'inactive-session denial has no binding side effect');
reset role;

select * from finish();
rollback;
