begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'app_public','use_check_my_day_suggestion',array['text','text','bigint'],
  'Use binds trip ID, request ID, and expected trip revision'
);
select ok(
  to_regprocedure('app_public.save_check_my_day_choice(text,text,text[])') is null,
  'legacy arbitrary-order save command is removed'
);
select ok(
  has_function_privilege('authenticated','app_public.use_check_my_day_suggestion(text,text,bigint)','EXECUTE')
  and not has_function_privilege('anon','app_public.use_check_my_day_suggestion(text,text,bigint)','EXECUTE'),
  'only authenticated users can apply a stored suggestion'
);
select ok(
  not exists(
    select 1 from information_schema.columns
    where table_schema='trip_private' and table_name='check_my_day_requests'
      and column_name in ('use_expected_version','use_result')
  ),
  'request does not duplicate its base revision or persist a private Trip response'
);
select has_column('trip_private','check_my_day_command_evidence','request_id','Use evidence binds to its route request');
select ok(
  exists(select 1 from pg_indexes where schemaname='trip_private'
    and indexname='check_my_day_command_evidence_request_uidx'),
  'at most one Use evidence row can exist per request'
);
select ok(
  exists(
    select 1 from pg_constraint
    where contype='f'
      and conrelid='trip_private.check_my_day_command_evidence'::regclass
      and confrelid='trip_private.check_my_day_requests'::regclass
      and confdeltype='c'
  ),
  'Use evidence follows the existing request deletion lifecycle'
);
select ok(
  position('tripVersion' in pg_get_functiondef('app_public.request_check_my_day(text)'::regprocedure))>0,
  'request returns the trip revision captured in its durable snapshot'
);
select ok(
  position('tripVersion' in pg_get_functiondef('app_public.get_check_my_day_suggestion(text)'::regprocedure))>0,
  'poll returns the same captured trip revision'
);

insert into auth.users(id) values
  ('57300000-0000-4000-8000-000000000001'),
  ('57300000-0000-4000-8000-000000000002');
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('57300000-0000-4000-8000-000000000011','57300000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
  ('57300000-0000-4000-8000-000000000012','57300000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp());
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at) values
  ('57300000-0000-4000-8000-000000000001','issue573-a@example.invalid',statement_timestamp()),
  ('57300000-0000-4000-8000-000000000002','issue573-b@example.invalid',statement_timestamp());
insert into app_private.role_grants(subject_user_id,role) values
  ('57300000-0000-4000-8000-000000000001','shopper'),
  ('57300000-0000-4000-8000-000000000002','shopper');

select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint);
reset role;
select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
select app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint);
reset role;

insert into trip_private.routing_contract_receipts(
  contract_receipt_id,provider_key,provider_version,attribution,max_requests,max_cost_units,
  timeout_ms,state,evidence_hash,accepted_at,revoked_at
) values (
  '57300000-0000-4000-8000-000000000021','fixture','fixture-v1','Synthetic test fixture',
  1,0,100,'revoked',extensions.digest(convert_to('issue-573 synthetic fixture','utf8'),'sha256'),
  statement_timestamp()-interval '1 minute',statement_timestamp()
);

insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date,version)
select fixture.trip_id,'57300000-0000-4000-8000-000000000001',area.id,fixture.name,
  date '2026-10-07',fixture.version
from (values
  ('57300000-0000-4000-8000-000000000101'::uuid,'Use fixture trip',4::bigint),
  ('57300000-0000-4000-8000-000000000102'::uuid,'Trip binding fixture',4::bigint),
  ('57300000-0000-4000-8000-000000000103'::uuid,'Stale fixture trip',5::bigint)
) as fixture(trip_id,name,version)
cross join lateral (
  select id from app_public.catalog_areas order by sort_order,slug limit 1
) as area;
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
values
  ('57300000-0000-4000-8000-000000000101','57300000-0000-4000-8000-000000000001','creator'),
  ('57300000-0000-4000-8000-000000000102','57300000-0000-4000-8000-000000000001','creator'),
  ('57300000-0000-4000-8000-000000000103','57300000-0000-4000-8000-000000000001','creator');
insert into trip_private.trip_stops(stop_id,trip_id,kind,rest_label,rest_address,position)
values
  ('57300000-0000-4000-8000-000000000201','57300000-0000-4000-8000-000000000101','rest','Synthetic A','Fixture address A',0),
  ('57300000-0000-4000-8000-000000000202','57300000-0000-4000-8000-000000000101','rest','Synthetic B','Fixture address B',1),
  ('57300000-0000-4000-8000-000000000221','57300000-0000-4000-8000-000000000102','rest','Bound A','Fixture address A',0),
  ('57300000-0000-4000-8000-000000000222','57300000-0000-4000-8000-000000000102','rest','Bound B','Fixture address B',1),
  ('57300000-0000-4000-8000-000000000211','57300000-0000-4000-8000-000000000103','rest','Stale A','Fixture address A',0),
  ('57300000-0000-4000-8000-000000000212','57300000-0000-4000-8000-000000000103','rest','Stale B','Fixture address B',1);

with source(request_id,trip_id,trip_version,stop_a,stop_b) as (values
  ('57300000-0000-4000-8000-000000000301'::uuid,'57300000-0000-4000-8000-000000000101'::uuid,4::bigint,
    '57300000-0000-4000-8000-000000000201'::uuid,'57300000-0000-4000-8000-000000000202'::uuid),
  ('57300000-0000-4000-8000-000000000302'::uuid,'57300000-0000-4000-8000-000000000103'::uuid,4::bigint,
    '57300000-0000-4000-8000-000000000211'::uuid,'57300000-0000-4000-8000-000000000212'::uuid),
  ('57300000-0000-4000-8000-000000000303'::uuid,'57300000-0000-4000-8000-000000000102'::uuid,4::bigint,
    '57300000-0000-4000-8000-000000000221'::uuid,'57300000-0000-4000-8000-000000000223'::uuid)
), facts as (
  select *,jsonb_build_object('stops',jsonb_build_array(
    jsonb_build_object('id',stop_a::text),jsonb_build_object('id',stop_b::text)
  )) as snapshot from source
)
insert into trip_private.check_my_day_requests(
  request_id,trip_id,actor_user_id,trip_version,facts,facts_hash,state,contract_receipt_id
)
select request_id,trip_id,'57300000-0000-4000-8000-000000000001',trip_version,snapshot,
  extensions.digest(convert_to(snapshot::text,'utf8'),'sha256'),'suggested',
  '57300000-0000-4000-8000-000000000021'
from facts;
with source(request_id,stop_a,stop_b) as (values
  ('57300000-0000-4000-8000-000000000301'::uuid,
    '57300000-0000-4000-8000-000000000201'::uuid,'57300000-0000-4000-8000-000000000202'::uuid),
  ('57300000-0000-4000-8000-000000000302'::uuid,
    '57300000-0000-4000-8000-000000000211'::uuid,'57300000-0000-4000-8000-000000000212'::uuid),
  ('57300000-0000-4000-8000-000000000303'::uuid,
    '57300000-0000-4000-8000-000000000221'::uuid,'57300000-0000-4000-8000-000000000223'::uuid)
), suggestion as (
  select request_id,array[stop_b,stop_a] as ordered_stop_ids,
    jsonb_build_array('Synthetic suggestion') as explanation from source
)
insert into trip_private.check_my_day_suggestions(request_id,ordered_stop_ids,explanation,suggestion_hash)
select request_id,ordered_stop_ids,explanation,
  extensions.digest(convert_to(jsonb_build_object('orderedStopIds',ordered_stop_ids,'explanation',explanation)::text,'utf8'),'sha256')
from suggestion;

select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select set_config('test.issue573.first',app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000101','57300000-0000-4000-8000-000000000301',4
)::text,true);
select is(current_setting('test.issue573.first')::jsonb->>'version','5','first Use applies one trip revision');
select is(
  (select array_agg(stop->>'id' order by ordinality)
   from jsonb_array_elements(current_setting('test.issue573.first')::jsonb->'stops') with ordinality as x(stop,ordinality)),
  array['57300000-0000-4000-8000-000000000202','57300000-0000-4000-8000-000000000201']::text[],
  'first Use applies the stored suggested order'
);
select set_config('test.issue573.replay',app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000101','57300000-0000-4000-8000-000000000301',4
)::text,true);
select is(current_setting('test.issue573.replay'),current_setting('test.issue573.first'),
  'matching retry reconstructs the same current authorized Trip when unchanged');
reset role;
select is((select version from trip_private.trips where trip_id='57300000-0000-4000-8000-000000000101'),5::bigint,
  'matching retry does not increment the trip version again');
select is((select count(*) from trip_private.check_my_day_command_evidence where request_id='57300000-0000-4000-8000-000000000301'),1::bigint,
  'matching retry leaves one Use evidence receipt');
select is((select trip_version from trip_private.check_my_day_requests where request_id='57300000-0000-4000-8000-000000000301'),4::bigint,
  'request revision remains the Use receipt base version');
select is((select trip_version from trip_private.check_my_day_command_evidence where request_id='57300000-0000-4000-8000-000000000301'),5::bigint,
  'linked evidence records the Use result version');
select is(
  (select ordered_stop_ids from trip_private.check_my_day_command_evidence where request_id='57300000-0000-4000-8000-000000000301'),
  array['57300000-0000-4000-8000-000000000202','57300000-0000-4000-8000-000000000201']::uuid[],
  'linked evidence records the applied order identity'
);

select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select set_config('test.issue573.reorder',app_public.reorder_trip_stop(
  '57300000-0000-4000-8000-000000000101','57300000-0000-4000-8000-000000000201',0
)::text,true);
select is(current_setting('test.issue573.reorder')::jsonb->>'version','6',
  'authorized reorder advances the current trip version');
select is(
  (select array_agg(stop->>'id' order by ordinality)
   from jsonb_array_elements(current_setting('test.issue573.reorder')::jsonb->'stops') with ordinality as x(stop,ordinality)),
  array['57300000-0000-4000-8000-000000000201','57300000-0000-4000-8000-000000000202']::text[],
  'authorized reorder reverses the applied suggested order'
);
select set_config('test.issue573.replay_after_reorder',app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000101','57300000-0000-4000-8000-000000000301',4
)::text,true);
select is(current_setting('test.issue573.replay_after_reorder')::jsonb->>'version','6',
  'retry returns the current trip version after a later trip command');
select is(
  (select array_agg(stop->>'id' order by ordinality)
   from jsonb_array_elements(current_setting('test.issue573.replay_after_reorder')::jsonb->'stops') with ordinality as x(stop,ordinality)),
  array['57300000-0000-4000-8000-000000000201','57300000-0000-4000-8000-000000000202']::text[],
  'retry returns the current order instead of replaying an old Trip snapshot'
);
reset role;
select is((select version from trip_private.trips where trip_id='57300000-0000-4000-8000-000000000101'),6::bigint,
  'later-state replay does not apply the suggestion again');
select is((select count(*) from trip_private.check_my_day_command_evidence where request_id='57300000-0000-4000-8000-000000000301'),1::bigint,
  'later-state replay keeps one Use evidence receipt');

select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000013"}',true);
set local role authenticated;
select throws_ok($$select app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000101','57300000-0000-4000-8000-000000000301',4
)$$,'42501','check_my_day_suggestion_unavailable','inactive session cannot replay a Use receipt');
reset role;

select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000002","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
select throws_ok($$select app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000101','57300000-0000-4000-8000-000000000301',4
)$$,'42501','check_my_day_suggestion_unavailable','another account receives a neutral denial');

reset role;
select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select throws_ok($$select app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000102','57300000-0000-4000-8000-000000000301',4
)$$,'42501','check_my_day_suggestion_unavailable','a different trip cannot reuse the receipt');
select throws_ok($$select app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000101','57300000-0000-4000-8000-000000000301',5
)$$,'42501','check_my_day_suggestion_unavailable','a different expected revision cannot reuse the receipt');
reset role;
select is((select version from trip_private.trips where trip_id='57300000-0000-4000-8000-000000000101'),5::bigint,
  'neutral denials do not mutate the trip');
select is((select count(*) from trip_private.check_my_day_command_evidence where request_id='57300000-0000-4000-8000-000000000301'),1::bigint,
  'neutral denials do not add Use evidence');

select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select throws_ok($$select app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000102','57300000-0000-4000-8000-000000000303',4
)$$,'P0001','check_my_day_stop_set_mismatch','changed stop set is rejected');
reset role;
select is((select version from trip_private.trips where trip_id='57300000-0000-4000-8000-000000000102'),4::bigint,
  'stop-set denial preserves the trip revision');
select is(
  (select array_agg(stop_id::text order by position) from trip_private.trip_stops where trip_id='57300000-0000-4000-8000-000000000102'),
  array['57300000-0000-4000-8000-000000000221','57300000-0000-4000-8000-000000000222']::text[],
  'stop-set denial preserves manual order'
);
select is((select count(*) from trip_private.check_my_day_command_evidence where request_id='57300000-0000-4000-8000-000000000303'),0::bigint,
  'stop-set denial writes no Use evidence');

select set_config('request.jwt.claims','{"sub":"57300000-0000-4000-8000-000000000001","role":"authenticated","session_id":"57300000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select throws_ok($$select app_public.use_check_my_day_suggestion(
  '57300000-0000-4000-8000-000000000103','57300000-0000-4000-8000-000000000302',4
)$$,'P0001','check_my_day_suggestion_stale','stale suggestion is rejected');
reset role;
select is((select version from trip_private.trips where trip_id='57300000-0000-4000-8000-000000000103'),5::bigint,
  'stale rejection preserves the current revision');
select is(
  (select array_agg(stop_id::text order by position) from trip_private.trip_stops where trip_id='57300000-0000-4000-8000-000000000103'),
  array['57300000-0000-4000-8000-000000000211','57300000-0000-4000-8000-000000000212']::text[],
  'stale rejection preserves manual stop order'
);
select is((select count(*) from trip_private.check_my_day_command_evidence where request_id='57300000-0000-4000-8000-000000000302'),0::bigint,
  'stale rejection writes no Use evidence');

reset role;
select * from finish();
rollback;
