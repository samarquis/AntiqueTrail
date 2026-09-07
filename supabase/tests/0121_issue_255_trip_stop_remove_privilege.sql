begin;
select plan(9);

select ok(has_table_privilege('identity_service','trip_private.trip_stops','DELETE'),
  'identity_service has the narrow trip-stop DELETE privilege');
select ok(not has_table_privilege('authenticated','trip_private.trip_stops','DELETE'),
  'authenticated has no direct trip-stop DELETE privilege');
select ok(not has_table_privilege('anon','trip_private.trip_stops','DELETE'),
  'anon has no direct trip-stop DELETE privilege');

insert into auth.users(id) values
  ('25500000-0000-4000-8000-000000000001'),
  ('25500000-0000-4000-8000-000000000002');
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('25500000-0000-4000-8000-000000000011','25500000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
  ('25500000-0000-4000-8000-000000000012','25500000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp());
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at) values
  ('25500000-0000-4000-8000-000000000001','issue-255-owner@invalid.test',statement_timestamp()),
  ('25500000-0000-4000-8000-000000000002','issue-255-foreign@invalid.test',statement_timestamp())
on conflict (user_id) do update set
  verified_email_snapshot=excluded.verified_email_snapshot,
  age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,state) values
  ('25500000-0000-4000-8000-000000000001','shopper','active'),
  ('25500000-0000-4000-8000-000000000002','shopper','active');
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date)
select '25500000-0000-4000-8000-000000000101','25500000-0000-4000-8000-000000000001',id,'Issue 255 trip','2026-09-08'
from app_public.catalog_areas limit 1;
insert into trip_private.trip_stops(stop_id,trip_id,kind,store_id,position) values
  ('25500000-0000-4000-8000-000000000201','25500000-0000-4000-8000-000000000101','store',(select id from app_public.stores order by id limit 1),0);
insert into trip_private.trip_stops(stop_id,trip_id,kind,rest_label,rest_address,position) values
  ('25500000-0000-4000-8000-000000000202','25500000-0000-4000-8000-000000000101','rest','Issue 255 rest stop','Synthetic address',1);
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,state)
select '25500000-0000-4000-8000-000000000102','25500000-0000-4000-8000-000000000002',id,'Foreign trip','2026-09-08','draft'
from app_public.catalog_areas limit 1;
insert into trip_private.trip_stops(stop_id,trip_id,kind,store_id,position)
values ('25500000-0000-4000-8000-000000000203','25500000-0000-4000-8000-000000000102','store',(select id from app_public.stores order by id limit 1),0);
reset role;

select set_config('request.jwt.claims','{"sub":"25500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"25500000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'owner session is registered');
select is((app_public.remove_trip_stop('25500000-0000-4000-8000-000000000101','25500000-0000-4000-8000-000000000201',1)->'stops')->0->>'position','0','first stop is removed and remaining stop is contiguous');
set local role identity_service;
select is((select count(*) from trip_private.trip_stops where trip_id='25500000-0000-4000-8000-000000000101'),1::bigint,'one stop remains after removal');
select is((select version from trip_private.trips where trip_id='25500000-0000-4000-8000-000000000101'),2::bigint,'trip version increments once');
reset role;
set local role authenticated;
select throws_ok($$select app_public.remove_trip_stop('25500000-0000-4000-8000-000000000102','25500000-0000-4000-8000-000000000203',1)$$,'P0001','not_allowed','foreign trip removal is denied');
set local role identity_service;
select is((select count(*) from trip_private.trip_stops where trip_id='25500000-0000-4000-8000-000000000102'),1::bigint,'denied removal preserves foreign trip state');
reset role;

select * from finish();
rollback;
