select no_plan();

select has_function('app_public', 'set_trip_stop_priority', array['text', 'text', 'text', 'bigint'], 'priority RPC keeps its public signature');
select has_function('app_public', 'set_trip_stop_dwell', array['text', 'text', 'integer', 'bigint'], 'dwell RPC keeps its public signature');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_public' and p.proname = 'set_trip_stop_priority'), 'priority RPC remains SECURITY DEFINER');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_public' and p.proname = 'set_trip_stop_dwell'), 'dwell RPC remains SECURITY DEFINER');
select ok((select r.rolname = 'identity_service' from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner where n.nspname = 'app_public' and p.proname = 'set_trip_stop_priority'), 'priority RPC remains owned by identity_service');
select ok((select r.rolname = 'identity_service' from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner where n.nspname = 'app_public' and p.proname = 'set_trip_stop_dwell'), 'dwell RPC remains owned by identity_service');

begin;

insert into auth.users(id) values
  ('25600000-0000-4000-8000-000000000001'),
  ('25600000-0000-4000-8000-000000000002');
insert into auth.sessions(id, user_id, created_at, updated_at) values
  ('25600000-0000-4000-8000-000000000011', '25600000-0000-4000-8000-000000000001', statement_timestamp(), statement_timestamp()),
  ('25600000-0000-4000-8000-000000000012', '25600000-0000-4000-8000-000000000002', statement_timestamp(), statement_timestamp());
insert into app_private.profiles(user_id, verified_email_snapshot, age_18_attested_at) values
  ('25600000-0000-4000-8000-000000000001', 'issue256-a@example.invalid', statement_timestamp()),
  ('25600000-0000-4000-8000-000000000002', 'issue256-b@example.invalid', statement_timestamp())
on conflict (user_id) do update set
  verified_email_snapshot = excluded.verified_email_snapshot,
  age_18_attested_at = excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id, role) values
  ('25600000-0000-4000-8000-000000000001', 'shopper'),
  ('25600000-0000-4000-8000-000000000002', 'shopper');

insert into trip_private.trips(trip_id, owner_id, area_id, name, local_date, version)
select fixture.trip_id, fixture.owner_id, area.id, fixture.name, date '2026-09-08', 10
  from (values
    ('25600000-0000-4000-8000-000000000101'::uuid, '25600000-0000-4000-8000-000000000001'::uuid, 'Editable trip'),
    ('25600000-0000-4000-8000-000000000102'::uuid, '25600000-0000-4000-8000-000000000002'::uuid, 'Foreign trip')
  ) as fixture(trip_id, owner_id, name)
cross join lateral (select id from app_public.catalog_areas order by sort_order, slug limit 1) as area;

with stores as (
  select s.id, row_number() over (order by s.id)::integer as store_number
    from app_public.stores as s
)
insert into trip_private.trip_stops(stop_id, trip_id, kind, store_id, position, priority, planned_dwell_minutes)
select fixture.stop_id, fixture.trip_id, 'store', stores.id, fixture.position, fixture.priority, fixture.dwell_minutes
  from (values
    ('25600000-0000-4000-8000-000000000201'::uuid, '25600000-0000-4000-8000-000000000101'::uuid, 0, 'flexible', 60, 1),
    ('25600000-0000-4000-8000-000000000202'::uuid, '25600000-0000-4000-8000-000000000101'::uuid, 1, 'prefer', 60, 2),
    ('25600000-0000-4000-8000-000000000203'::uuid, '25600000-0000-4000-8000-000000000102'::uuid, 0, 'flexible', 60, 3)
  ) as fixture(stop_id, trip_id, position, priority, dwell_minutes, store_number)
  join stores on stores.store_number = fixture.store_number;

select set_config('request.jwt.claims', '{"sub":"25600000-0000-4000-8000-000000000001","role":"authenticated","session_id":"25600000-0000-4000-8000-000000000011"}', true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp() + interval '1 hour') * 1000)::bigint), 'authenticated fixture registers an active session');

select set_config('test.priority_result', app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000101', '25600000-0000-4000-8000-000000000201', 'must', 10)::text, true);
select is((current_setting('test.priority_result')::jsonb->>'version')::bigint, 11::bigint, 'priority update returns the incremented trip version');
select is((select item->>'priority' from jsonb_array_elements(current_setting('test.priority_result')::jsonb->'stops') as x(item) where item->>'id' = '25600000-0000-4000-8000-000000000201'), 'must', 'priority update returns the selected stop value');

select set_config('test.dwell_result', app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000101', '25600000-0000-4000-8000-000000000201', 5, 11)::text, true);
select is((current_setting('test.dwell_result')::jsonb->>'version')::bigint, 12::bigint, 'five-minute dwell update returns the incremented trip version');
select is((select (item->>'plannedDwellMinutes')::integer from jsonb_array_elements(current_setting('test.dwell_result')::jsonb->'stops') as x(item) where item->>'id' = '25600000-0000-4000-8000-000000000201'), 5, 'five-minute dwell update returns the selected stop value');

select set_config('test.other_priority_result', app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000101', '25600000-0000-4000-8000-000000000202', 'flexible', 12)::text, true);
select set_config('test.other_dwell_result', app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000101', '25600000-0000-4000-8000-000000000202', 720, 13)::text, true);
select is((current_setting('test.other_dwell_result')::jsonb->>'version')::bigint, 14::bigint, '720-minute dwell update returns the incremented trip version');

set local role identity_service;
select is((select s.priority from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000201'::uuid), 'must', 'selected stop priority is persisted');
select is((select s.planned_dwell_minutes::integer from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000201'::uuid), 5, 'selected stop five-minute dwell is persisted');
select is((select s.priority from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000202'::uuid), 'flexible', 'other stop priority is persisted independently');
select is((select s.planned_dwell_minutes::integer from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000202'::uuid), 720, 'other stop 720-minute dwell is persisted independently');
select is((select s.version from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000201'::uuid), 3::bigint, 'selected stop version increments once per successful edit');
select is((select s.version from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000202'::uuid), 3::bigint, 'other stop version increments once per successful edit');
select is((select t.version from trip_private.trips as t where t.trip_id = '25600000-0000-4000-8000-000000000101'::uuid), 14::bigint, 'successful edits increment the trip version once each');
select is((select s.priority from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000203'::uuid), 'flexible', 'other trip stop priority is unchanged');
select is((select s.planned_dwell_minutes::integer from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000203'::uuid), 60, 'other trip stop dwell is unchanged');
select is((select t.version from trip_private.trips as t where t.trip_id = '25600000-0000-4000-8000-000000000102'::uuid), 10::bigint, 'other trip version is unchanged');

reset role;
set local role authenticated;
select throws_ok($$select app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201',null::text,14)$$, 'P0001', 'validation_failed', 'null priority is rejected before mutation');
select throws_ok($$select app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201','invalid',14)$$, 'P0001', 'validation_failed', 'invalid priority is rejected before mutation');
select throws_ok($$select app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201',null::integer,14)$$, 'P0001', 'validation_failed', 'null dwell is rejected before mutation');
select throws_ok($$select app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201',4,14)$$, 'P0001', 'validation_failed', 'four-minute dwell is rejected before mutation');
select throws_ok($$select app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000201','25600000-0000-4000-8000-000000000201',721,14)$$, 'P0001', 'validation_failed', '721-minute dwell is rejected before mutation');
select throws_ok($$select app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201','prefer',13)$$, 'P0001', 'conflict', 'stale expected version is rejected');
set local role identity_service;
select is((select t.version from trip_private.trips as t where t.trip_id = '25600000-0000-4000-8000-000000000101'::uuid), 14::bigint, 'invalid and stale requests do not mutate the trip version');

reset role;
set local role authenticated;
select throws_ok($$select app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000203','must',14)$$, 'P0001', 'not_found', 'foreign stop is rejected without disclosure');
select throws_ok($$select app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000102','25600000-0000-4000-8000-000000000203',30,10)$$, 'P0001', 'not_allowed', 'foreign trip is rejected without disclosure');
set local role identity_service;
select is((select t.version from trip_private.trips as t where t.trip_id = '25600000-0000-4000-8000-000000000102'::uuid), 10::bigint, 'foreign requests do not mutate the foreign trip');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201','prefer',14)$$, 'P0001', 'not_allowed', 'anonymous priority caller is denied');
select throws_ok($$select app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201',30,14)$$, 'P0001', 'not_allowed', 'anonymous dwell caller is denied');
reset role;

select set_config('request.jwt.claims', '{"sub":"25600000-0000-4000-8000-000000000001","role":"authenticated","session_id":"25600000-0000-4000-8000-000000000011"}', true);
set local role authenticated;
select app_public.revoke_current_session('issue256_revoke');
select throws_ok($$select app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201','prefer',14)$$, 'P0001', 'authorization_lost', 'revoked priority caller is denied');
select throws_ok($$select app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000101','25600000-0000-4000-8000-000000000201',30,14)$$, 'P0001', 'authorization_lost', 'revoked dwell caller is denied');
set local role identity_service;
select is((select t.version from trip_private.trips as t where t.trip_id = '25600000-0000-4000-8000-000000000101'::uuid), 14::bigint, 'revoked requests do not mutate the trip version');

rollback;

begin;
insert into auth.users(id) values ('25600000-0000-4000-8000-000000000902');
insert into auth.sessions(id, user_id, created_at, updated_at) values ('25600000-0000-4000-8000-000000000912', '25600000-0000-4000-8000-000000000902', statement_timestamp(), statement_timestamp());
insert into app_private.profiles(user_id, verified_email_snapshot, age_18_attested_at) values ('25600000-0000-4000-8000-000000000902', 'issue256-c@example.invalid', statement_timestamp());
insert into app_private.role_grants(subject_user_id, role) values ('25600000-0000-4000-8000-000000000902', 'shopper');
insert into trip_private.trips(trip_id, owner_id, area_id, name, local_date, version)
select '25600000-0000-4000-8000-000000000992', '25600000-0000-4000-8000-000000000902', id, 'Conflict trip', date '2026-09-08', 20
  from (select id from app_public.catalog_areas order by sort_order, slug limit 1) as area;
insert into trip_private.trip_stops(stop_id, trip_id, kind, store_id, position)
values ('25600000-0000-4000-8000-000000000994', '25600000-0000-4000-8000-000000000992', 'store', (select id from app_public.stores order by id limit 1), 0),
       ('25600000-0000-4000-8000-000000000995', '25600000-0000-4000-8000-000000000992', 'store', (select id from app_public.stores order by id offset 1 limit 1), 1);

select set_config('request.jwt.claims', '{"sub":"25600000-0000-4000-8000-000000000902","role":"authenticated","session_id":"25600000-0000-4000-8000-000000000912"}', false);
set role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp() + interval '1 hour') * 1000)::bigint), 'conflict fixture registers an active session');
select set_config('test.first_competing_edit', app_public.set_trip_stop_priority('25600000-0000-4000-8000-000000000992', '25600000-0000-4000-8000-000000000994', 'must', 20)::text, false);
select is((current_setting('test.first_competing_edit')::jsonb->>'version')::bigint, 21::bigint, 'first same-version edit succeeds');
select throws_ok($$select app_public.set_trip_stop_dwell('25600000-0000-4000-8000-000000000992','25600000-0000-4000-8000-000000000995',30,20)$$, 'P0001', 'conflict', 'second same-version edit returns a conflict');
reset role;
select is((select s.priority from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000994'::uuid), 'must', 'first competing edit is persisted');
select is((select s.planned_dwell_minutes::integer from trip_private.trip_stops as s where s.stop_id = '25600000-0000-4000-8000-000000000995'::uuid), 60, 'conflicting competing edit does not mutate its stop');
select is((select t.version from trip_private.trips as t where t.trip_id = '25600000-0000-4000-8000-000000000992'::uuid), 21::bigint, 'conflicting competing edit does not increment the trip version');

rollback;

select * from finish();
