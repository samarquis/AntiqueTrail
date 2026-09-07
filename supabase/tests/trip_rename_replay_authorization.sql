begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
  ('99000000-0000-4000-8000-000000000101'),
  ('99000000-0000-4000-8000-000000000102');
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('99000000-0000-4000-8000-000000000111','99000000-0000-4000-8000-000000000101',statement_timestamp(),statement_timestamp()),
  ('99000000-0000-4000-8000-000000000112','99000000-0000-4000-8000-000000000102',statement_timestamp(),statement_timestamp());
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at) values
  ('99000000-0000-4000-8000-000000000101','rename-a@example.invalid',statement_timestamp()),
  ('99000000-0000-4000-8000-000000000102','rename-b@example.invalid',statement_timestamp())
on conflict (user_id) do update set
  verified_email_snapshot=excluded.verified_email_snapshot,
  age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,state) values
  ('99000000-0000-4000-8000-000000000101','shopper','active'),
  ('99000000-0000-4000-8000-000000000102','shopper','active');
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,state,version)
select '99000000-0000-4000-8000-000000000121','99000000-0000-4000-8000-000000000101',id,'Private trip',current_date,'draft',1
from app_public.catalog_areas limit 1;
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
  values('99000000-0000-4000-8000-000000000121','99000000-0000-4000-8000-000000000101','creator');
insert into trip_private.trip_mutation_receipts(trip_id,idempotency_key,base_version,result_state,resulting_version,result_metadata)
  values('99000000-0000-4000-8000-000000000121','replay-key',1,'applied',2,jsonb_build_object('name','Private trip','version',2));
reset role;

select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000101","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000111"}',true);
set local role authenticated;
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'owner session registers');
select is(app_public.rename_trip('99000000-0000-4000-8000-000000000121','ignored',1,'replay-key')->>'name','Private trip','owner replay returns cached result');
set local role identity_service;
select is((select version from trip_private.trips where trip_id='99000000-0000-4000-8000-000000000121'),1::bigint,'owner replay does not write');
set local role authenticated;

select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000102","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000112"}',true);
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'foreign account session registers');
select throws_ok($$select app_public.rename_trip('99000000-0000-4000-8000-000000000121','leak',1,'replay-key')$$,'P0001','not_allowed','foreign account cannot read cached replay');
reset role;

select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select throws_ok($$select app_public.rename_trip('99000000-0000-4000-8000-000000000121','leak',1,'replay-key')$$,'P0001','not_allowed','anonymous caller cannot read cached replay');
reset role;
select * from finish();
rollback;
