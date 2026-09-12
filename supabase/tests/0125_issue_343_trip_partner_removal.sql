begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'app_public','remove_trip_partner',array['text','text','bigint','bigint','text'],
  'creator partner-removal command publishes its replay-safe contract');
select ok(
  has_function_privilege('authenticated','app_public.remove_trip_partner(text,text,bigint,bigint,text)','EXECUTE'),
  'authenticated callers may invoke the guarded command');
select ok(
  not has_function_privilege('anon','app_public.remove_trip_partner(text,text,bigint,bigint,text)','EXECUTE'),
  'anonymous callers cannot invoke the command');
select ok(
  not has_table_privilege('authenticated','trip_private.trip_participants','UPDATE'),
  'the browser cannot bypass the command with a direct membership update');
select ok(
  position('for update' in pg_get_functiondef('app_public.remove_trip_partner(text,text,bigint,bigint,text)'::regprocedure))
    < position('trip_mutation_receipts' in pg_get_functiondef('app_public.remove_trip_partner(text,text,bigint,bigint,text)'::regprocedure)),
  'trip serialization precedes receipt lookup for concurrent same-key replay');
select ok(
  position('for update' in pg_get_functiondef('app_public.assign_navigator(text,text)'::regprocedure))
    < position('trip_device_bindings' in pg_get_functiondef('app_public.assign_navigator(text,text)'::regprocedure))
  and position('trip_participants' in pg_get_functiondef('app_public.assign_navigator(text,text)'::regprocedure))>0,
  'Navigator assignment revalidates active membership and device authority after the trip lock');

insert into auth.users(id,email,email_confirmed_at) values
  ('34300000-0000-4000-8000-000000000001','creator-343@example.invalid',statement_timestamp()),
  ('34300000-0000-4000-8000-000000000002','partner-343@example.invalid',statement_timestamp()),
  ('34300000-0000-4000-8000-000000000003','unrelated-343@example.invalid',statement_timestamp());
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('34300000-0000-4000-8000-000000000011','34300000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
  ('34300000-0000-4000-8000-000000000012','34300000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp()),
  ('34300000-0000-4000-8000-000000000013','34300000-0000-4000-8000-000000000003',statement_timestamp(),statement_timestamp());

set local role identity_service;
update app_private.profiles
set verified_email_snapshot=case user_id
      when '34300000-0000-4000-8000-000000000001' then 'creator-343@example.invalid'
      when '34300000-0000-4000-8000-000000000002' then 'partner-343@example.invalid'
      else 'unrelated-343@example.invalid' end,
    age_18_attested_at=statement_timestamp()
where user_id in (
  '34300000-0000-4000-8000-000000000001',
  '34300000-0000-4000-8000-000000000002',
  '34300000-0000-4000-8000-000000000003');
insert into app_private.role_grants(subject_user_id,role,state) values
  ('34300000-0000-4000-8000-000000000001','shopper','active'),
  ('34300000-0000-4000-8000-000000000002','shopper','active'),
  ('34300000-0000-4000-8000-000000000003','shopper','active');

insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,state,started_at,version)
select '34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000001',id,
  'Selected trip',current_date,'active',statement_timestamp(),1
from app_public.catalog_areas order by sort_order limit 1;
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,state,started_at,version)
select '34300000-0000-4000-8000-000000000102','34300000-0000-4000-8000-000000000003',id,
  'Unrelated trip',current_date,'active',statement_timestamp(),7
from app_public.catalog_areas order by sort_order limit 1;

insert into trip_private.trip_participants(trip_id,user_id,participant_role) values
  ('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000001','creator'),
  ('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002','partner'),
  ('34300000-0000-4000-8000-000000000102','34300000-0000-4000-8000-000000000003','creator'),
  ('34300000-0000-4000-8000-000000000102','34300000-0000-4000-8000-000000000002','partner');

insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version) values
  ('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',extensions.digest(convert_to('device-343-selected','utf8'),'sha256'),1),
  ('34300000-0000-4000-8000-000000000102','34300000-0000-4000-8000-000000000002',extensions.digest(convert_to('device-343-unrelated','utf8'),'sha256'),1);

with payload(trip_id,device_id,value) as (values
  ('34300000-0000-4000-8000-000000000101'::uuid,'device-343-selected',jsonb_build_object(
    'keyId','key-v1','claims',jsonb_build_object('tripId','34300000-0000-4000-8000-000000000101','deviceId','device-343-selected'),'signature',repeat('a',32))),
  ('34300000-0000-4000-8000-000000000102'::uuid,'device-343-unrelated',jsonb_build_object(
    'keyId','key-v1','claims',jsonb_build_object('tripId','34300000-0000-4000-8000-000000000102','deviceId','device-343-unrelated'),'signature',repeat('b',32))))
insert into trip_private.offline_grant_signing_receipts(
  trip_id,user_id,install_id,device_key_id,session_security_version,signed_grant,signed_grant_hash,expires_at)
select trip_id,'34300000-0000-4000-8000-000000000002',
  'install-'||device_id,'key-'||device_id,1,value,extensions.digest(convert_to(value::text,'utf8'),'sha256'),
  statement_timestamp()+interval '1 hour'
from payload;

insert into trip_private.trip_offline_grants(
  trip_id,user_id,device_hash,session_security_version,grant_hash,expires_at)
select trip_id,user_id,
  extensions.digest(convert_to(signed_grant->'claims'->>'deviceId','utf8'),'sha256'),
  session_security_version,signed_grant_hash,expires_at
from trip_private.offline_grant_signing_receipts
where trip_id in ('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000102');

update trip_private.trips
set navigator_user_id='34300000-0000-4000-8000-000000000002',
    navigator_device_hash=case trip_id
      when '34300000-0000-4000-8000-000000000101' then extensions.digest(convert_to('device-343-selected','utf8'),'sha256')
      else extensions.digest(convert_to('device-343-unrelated','utf8'),'sha256') end
where trip_id in ('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000102');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"34300000-0000-4000-8000-000000000011"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'creator session registers');
select set_config('request.jwt.claims','{"sub":"34300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"34300000-0000-4000-8000-000000000012"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'partner session registers');
select set_config('request.jwt.claims','{"sub":"34300000-0000-4000-8000-000000000003","role":"authenticated","session_id":"34300000-0000-4000-8000-000000000013"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'unrelated session registers');

select throws_ok(
  $$select app_public.remove_trip_partner('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',1,1,'unrelated-remove')$$,
  'P0001','authorization_lost','an unrelated account cannot remove the selected partner');
select set_config('request.jwt.claims','{"sub":"34300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"34300000-0000-4000-8000-000000000012"}',true);
select throws_ok(
  $$select app_public.remove_trip_partner('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',1,1,'partner-remove')$$,
  'P0001','authorization_lost','the partner cannot remove their membership through the creator command');

select set_config('request.jwt.claims','{"sub":"34300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"34300000-0000-4000-8000-000000000011"}',true);
select is(
  app_public.remove_trip_partner(
    '34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',1,99,'stale-trip-version')->>'state',
  'conflict','a stale trip version returns a non-mutating conflict');
reset role;
set local role identity_service;
select is(
  (select state from trip_private.trip_participants where trip_id='34300000-0000-4000-8000-000000000101' and user_id='34300000-0000-4000-8000-000000000002'),
  'active','a stale trip version leaves membership unchanged');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"34300000-0000-4000-8000-000000000011"}',true);
select is(
  jsonb_array_length(app_public.remove_trip_partner(
    '34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',1,1,'remove-partner-1')->'collaboration'->'participants'),
  1,'the creator removes exactly the selected active partner');
select is(
  (app_public.remove_trip_partner(
    '34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',1,1,'remove-partner-1')->'collaboration'->>'tripVersion')::bigint,
  2::bigint,'the collaboration result exposes the authoritative resulting trip version');
select is(
  app_public.remove_trip_partner(
    '34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',1,1,'remove-partner-1')->>'state',
  'applied','the same idempotency key replays the original successful result');
select lives_ok(
  $$select app_public.get_trip('34300000-0000-4000-8000-000000000101')$$,
  'remaining creator access is unchanged');

reset role;
set local role identity_service;
select is((select state from trip_private.trip_participants where trip_id='34300000-0000-4000-8000-000000000101' and user_id='34300000-0000-4000-8000-000000000002'),'revoked','selected partner membership is revoked');
select is((select version from trip_private.trip_participants where trip_id='34300000-0000-4000-8000-000000000101' and user_id='34300000-0000-4000-8000-000000000002'),2::bigint,'membership version advances atomically');
select ok((select left_at is not null from trip_private.trip_participants where trip_id='34300000-0000-4000-8000-000000000101' and user_id='34300000-0000-4000-8000-000000000002'),'membership revocation is timestamped');
select is((select state from trip_private.trip_device_bindings where trip_id='34300000-0000-4000-8000-000000000101'),'revoked','selected-trip device authority is revoked');
select is((select revocation_reason from trip_private.trip_device_bindings where trip_id='34300000-0000-4000-8000-000000000101'),'partner_removed','device revocation records its reason');
select is((select state from trip_private.trip_offline_grants where trip_id='34300000-0000-4000-8000-000000000101'),'revoked','selected-trip offline grant is revoked');
select is((select state from trip_private.offline_grant_signing_receipts where trip_id='34300000-0000-4000-8000-000000000101'),'revoked','unused selected-trip signing authority is revoked');
select ok((select navigator_user_id is null and navigator_device_hash is null and state='active' from trip_private.trips where trip_id='34300000-0000-4000-8000-000000000101'),'removing the Navigator pauses Go without ending the trip');
select is((select version from trip_private.trips where trip_id='34300000-0000-4000-8000-000000000101'),2::bigint,'selected trip version advances once');
select is((select state from trip_private.trip_participants where trip_id='34300000-0000-4000-8000-000000000102' and user_id='34300000-0000-4000-8000-000000000002'),'active','unrelated-trip membership is unchanged');
select is((select state from trip_private.trip_device_bindings where trip_id='34300000-0000-4000-8000-000000000102'),'active','unrelated-trip device authority is unchanged');
select is((select state from trip_private.trip_offline_grants where trip_id='34300000-0000-4000-8000-000000000102'),'active','unrelated-trip offline authority is unchanged');
select is((select version from trip_private.trips where trip_id='34300000-0000-4000-8000-000000000102'),7::bigint,'unrelated trip is unchanged');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"34300000-0000-4000-8000-000000000012"}',true);
select throws_ok(
  $$select app_public.get_trip('34300000-0000-4000-8000-000000000101')$$,
  'P0001','authorization_lost','removed partner is denied on the next protected read');
select throws_ok(
  $$select app_public.queue_offline_trip_action('34300000-0000-4000-8000-000000000101','{"kind":"go_action","stop_id":"34300000-0000-4000-8000-000000000201"}'::jsonb)$$,
  'P0001','authorization_lost','removed partner is denied on the next protected write');
select throws_ok(
  $$select app_public.remove_trip_partner('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',1,1,'remove-partner-1')$$,
  'P0001','authorization_lost','a removed partner cannot read the creator receipt by replaying its key');

reset role;
set local role identity_service;
update trip_private.trip_participants
set state='active',left_at=null,version=version+1
where trip_id='34300000-0000-4000-8000-000000000101'
  and user_id='34300000-0000-4000-8000-000000000002';
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"34300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"34300000-0000-4000-8000-000000000011"}',true);
select throws_ok(
  $$select app_public.remove_trip_partner('34300000-0000-4000-8000-000000000101','34300000-0000-4000-8000-000000000002',1,2,'old-membership-generation')$$,
  'P0001','trip_partner_unavailable','a stale command cannot remove a later membership generation');
reset role;
set local role identity_service;
select is((select state from trip_private.trip_participants where trip_id='34300000-0000-4000-8000-000000000101' and user_id='34300000-0000-4000-8000-000000000002'),'active','later membership remains active after stale replay');
select is((select version from trip_private.trip_participants where trip_id='34300000-0000-4000-8000-000000000101' and user_id='34300000-0000-4000-8000-000000000002'),3::bigint,'later membership generation remains unchanged');

reset role;
select * from finish();
rollback;
