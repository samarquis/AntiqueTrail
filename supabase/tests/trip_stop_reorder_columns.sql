select no_plan();

-- The command is callable only through the authenticated RPC boundary.
select has_function('app_public', 'reorder_trip_stop', array['text', 'text', 'integer'], 'reorder RPC keeps its public signature');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_public' and p.proname = 'reorder_trip_stop'), 'reorder RPC remains SECURITY DEFINER');
select ok((select r.rolname = 'identity_service' from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner where n.nspname = 'app_public' and p.proname = 'reorder_trip_stop'), 'reorder RPC remains owned by identity_service');
select ok(has_function_privilege('authenticated', 'app_public.reorder_trip_stop(text,text,integer)', 'EXECUTE') and not has_function_privilege('anon', 'app_public.reorder_trip_stop(text,text,integer)', 'EXECUTE'), 'reorder RPC grant remains authenticated-only');

begin;

insert into auth.users(id) values
  ('25700000-0000-4000-8000-000000000001'),
  ('25700000-0000-4000-8000-000000000002');
insert into auth.sessions(id, user_id, created_at, updated_at) values
  ('25700000-0000-4000-8000-000000000011', '25700000-0000-4000-8000-000000000001', statement_timestamp(), statement_timestamp()),
  ('25700000-0000-4000-8000-000000000012', '25700000-0000-4000-8000-000000000002', statement_timestamp(), statement_timestamp());
insert into app_private.profiles(user_id, verified_email_snapshot, age_18_attested_at) values
  ('25700000-0000-4000-8000-000000000001', 'issue257-a@example.invalid', statement_timestamp()),
  ('25700000-0000-4000-8000-000000000002', 'issue257-b@example.invalid', statement_timestamp())
on conflict (user_id) do update set
  verified_email_snapshot = excluded.verified_email_snapshot,
  age_18_attested_at = excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id, role) values
  ('25700000-0000-4000-8000-000000000001', 'shopper'),
  ('25700000-0000-4000-8000-000000000002', 'shopper');

insert into trip_private.trips(trip_id, owner_id, area_id, name, local_date, version)
select trip_id, '25700000-0000-4000-8000-000000000001', area_id, name, date '2026-09-08', 10
  from (values
    ('25700000-0000-4000-8000-000000000101'::uuid, 'Forward trip'),
    ('25700000-0000-4000-8000-000000000102'::uuid, 'Backward trip'),
    ('25700000-0000-4000-8000-000000000103'::uuid, 'Middle trip'),
    ('25700000-0000-4000-8000-000000000104'::uuid, 'Same-position trip'),
    ('25700000-0000-4000-8000-000000000105'::uuid, 'One-stop trip'),
    ('25700000-0000-4000-8000-000000000106'::uuid, 'Maximum trip'),
    ('25700000-0000-4000-8000-000000000107'::uuid, 'Invalid-input trip'),
    ('25700000-0000-4000-8000-000000000108'::uuid, 'Foreign trip')
  ) as fixtures(trip_id, name)
cross join lateral (select id as area_id from app_public.catalog_areas order by sort_order, slug limit 1) as area;
update trip_private.trips
   set owner_id = '25700000-0000-4000-8000-000000000002'
 where trip_id = '25700000-0000-4000-8000-000000000108'::uuid;

with stores as (
  select s.id, row_number() over (order by s.id)::integer as store_number
    from app_public.stores as s
), fixture_trips(trip_id, stop_base, stop_count) as (
  values
    ('25700000-0000-4000-8000-000000000101'::uuid, 201, 4),
    ('25700000-0000-4000-8000-000000000102'::uuid, 211, 4),
    ('25700000-0000-4000-8000-000000000103'::uuid, 221, 4),
    ('25700000-0000-4000-8000-000000000104'::uuid, 231, 4),
    ('25700000-0000-4000-8000-000000000105'::uuid, 241, 1),
    ('25700000-0000-4000-8000-000000000106'::uuid, 251, 8),
    ('25700000-0000-4000-8000-000000000107'::uuid, 261, 4),
    ('25700000-0000-4000-8000-000000000108'::uuid, 271, 4)
), fixture_stops as (
  select ('25700000-0000-4000-8000-' || lpad((f.stop_base + nums.n)::text, 12, '0'))::uuid as stop_id,
         f.trip_id, nums.n as position
    from fixture_trips as f
   cross join lateral generate_series(0, f.stop_count - 1) as nums(n)
)
insert into trip_private.trip_stops(stop_id, trip_id, kind, store_id, position)
select f.stop_id, f.trip_id, 'store', s.id, f.position
  from fixture_stops as f
  join stores as s on s.store_number = f.position + 1;

select set_config('request.jwt.claims', '{"sub":"25700000-0000-4000-8000-000000000001","role":"authenticated","session_id":"25700000-0000-4000-8000-000000000011"}', true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp() + interval '1 hour') * 1000)::bigint), 'actor A registers an active session');

select set_config('test.forward', app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000101', '25700000-0000-4000-8000-000000000204', 0)::text, true);
select is((select array_agg(item->>'id' order by ordinality) from jsonb_array_elements(current_setting('test.forward')::jsonb->'stops') with ordinality as x(item, ordinality)), array['25700000-0000-4000-8000-000000000204','25700000-0000-4000-8000-000000000201','25700000-0000-4000-8000-000000000202','25700000-0000-4000-8000-000000000203']::text[], 'moving D to zero returns D,A,B,C');

select set_config('test.backward', app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000102', '25700000-0000-4000-8000-000000000211', 3)::text, true);
select is((select array_agg(item->>'id' order by ordinality) from jsonb_array_elements(current_setting('test.backward')::jsonb->'stops') with ordinality as x(item, ordinality)), array['25700000-0000-4000-8000-000000000212','25700000-0000-4000-8000-000000000213','25700000-0000-4000-8000-000000000214','25700000-0000-4000-8000-000000000211']::text[], 'moving A to three returns B,C,D,A');

select set_config('test.middle', app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000103', '25700000-0000-4000-8000-000000000221', 2)::text, true);
select is((select array_agg(item->>'id' order by ordinality) from jsonb_array_elements(current_setting('test.middle')::jsonb->'stops') with ordinality as x(item, ordinality)), array['25700000-0000-4000-8000-000000000222','25700000-0000-4000-8000-000000000223','25700000-0000-4000-8000-000000000221','25700000-0000-4000-8000-000000000224']::text[], 'moving B to two returns A,C,B,D');

select set_config('test.same', app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000104', '25700000-0000-4000-8000-000000000232', 1)::text, true);
select is((select array_agg(item->>'id' order by ordinality) from jsonb_array_elements(current_setting('test.same')::jsonb->'stops') with ordinality as x(item, ordinality)), array['25700000-0000-4000-8000-000000000231','25700000-0000-4000-8000-000000000232','25700000-0000-4000-8000-000000000233','25700000-0000-4000-8000-000000000234']::text[], 'moving a stop to its current position preserves order');

select set_config('test.one', app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000105', '25700000-0000-4000-8000-000000000241', 0)::text, true);
select is(jsonb_array_length(current_setting('test.one')::jsonb->'stops'), 1, 'one-stop trip returns one stop');

select set_config('test.maximum', app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000106', '25700000-0000-4000-8000-000000000258', 0)::text, true);
select is(jsonb_array_length(current_setting('test.maximum')::jsonb->'stops'), 8, 'maximum-size trip remains bounded at eight stops');

select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000107','25700000-0000-4000-8000-000000000261',-1)$$, 'P0001', 'trip_position_invalid', 'negative position denied');
select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000107','25700000-0000-4000-8000-000000000261',4)$$, 'P0001', 'trip_position_invalid', 'out-of-range position denied');
select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000107','25700000-0000-4000-8000-000000000261',null)$$, 'P0001', 'trip_position_invalid', 'null position denied');
select throws_ok($$select app_public.reorder_trip_stop('not-a-uuid','25700000-0000-4000-8000-000000000261',0)$$, 'P0001', 'trip_stop_id_invalid', 'malformed trip ID denied');
select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000107','not-a-uuid',0)$$, 'P0001', 'trip_stop_id_invalid', 'malformed stop ID denied');
select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000107',null,0)$$, 'P0001', 'trip_stop_id_invalid', 'null stop ID denied');
select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000107','25700000-0000-4000-8000-000000000201',0)$$, 'P0001', 'trip_position_invalid', 'foreign stop ID denied without disclosure');
select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000108','25700000-0000-4000-8000-000000000271',0)$$, 'P0001', 'authorization_lost', 'foreign trip ID denied without disclosure');

reset role;
select is((select array_agg(s.stop_id::text order by s.position) from trip_private.trip_stops as s where s.trip_id = '25700000-0000-4000-8000-000000000101'::uuid), array['25700000-0000-4000-8000-000000000204','25700000-0000-4000-8000-000000000201','25700000-0000-4000-8000-000000000202','25700000-0000-4000-8000-000000000203']::text[], 'persisted order matches returned order');
select is((select version from trip_private.trips where trip_id = '25700000-0000-4000-8000-000000000101'::uuid), 11::bigint, 'successful reorder increments trip version');
select is((select array_agg(s.position order by s.position) from trip_private.trip_stops as s where s.trip_id = '25700000-0000-4000-8000-000000000106'::uuid), array[0,1,2,3,4,5,6,7]::smallint[], 'maximum-size positions remain contiguous');
select is((select count(distinct s.stop_id) from trip_private.trip_stops as s where s.trip_id = '25700000-0000-4000-8000-000000000106'::uuid), 8::bigint, 'maximum-size trip preserves every stop ID');

set local role anon;
select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000107','25700000-0000-4000-8000-000000000241',0)$$, '42501', null, 'anonymous callers are denied');
reset role;

-- Revocation is checked by the same real session predicate used by the application.
set local role authenticated;
select app_public.revoke_current_session('issue257_revoke');
select throws_ok($$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000107','25700000-0000-4000-8000-000000000261',0)$$, 'P0001', 'authorization_lost', 'revoked session is denied');
reset role;
select is((select version from trip_private.trips where trip_id = '25700000-0000-4000-8000-000000000107'::uuid), 10::bigint, 'denied requests do not mutate the trip version');

rollback;

-- dblink provides two independent authenticated transactions for the lock proof.
create extension if not exists dblink with schema extensions;
begin;
insert into auth.users(id) values ('25700000-0000-4000-8000-000000000901');
insert into auth.sessions(id, user_id, created_at, updated_at) values ('25700000-0000-4000-8000-000000000911', '25700000-0000-4000-8000-000000000901', statement_timestamp(), statement_timestamp());
insert into app_private.profiles(user_id, verified_email_snapshot, age_18_attested_at) values ('25700000-0000-4000-8000-000000000901', 'issue257-race@example.invalid', statement_timestamp())
on conflict (user_id) do update set
  verified_email_snapshot = excluded.verified_email_snapshot,
  age_18_attested_at = excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id, role) values ('25700000-0000-4000-8000-000000000901', 'shopper');
insert into app_private.active_sessions(session_id, user_id, provider_created_at, session_epoch, state, access_token_expires_at)
values ('25700000-0000-4000-8000-000000000911', '25700000-0000-4000-8000-000000000901', statement_timestamp(), 1, 'active', statement_timestamp() + interval '1 hour');
insert into trip_private.trips(trip_id, owner_id, area_id, name, local_date, version)
select '25700000-0000-4000-8000-000000000991', '25700000-0000-4000-8000-000000000901', area_id, 'Concurrency trip', date '2026-09-08', 20
  from (select id as area_id from app_public.catalog_areas order by sort_order, slug limit 1) as area;
insert into trip_private.trip_stops(stop_id, trip_id, kind, store_id, position)
values
  ('25700000-0000-4000-8000-000000000281', '25700000-0000-4000-8000-000000000991', 'store', (select id from app_public.stores order by id limit 1), 0),
  ('25700000-0000-4000-8000-000000000282', '25700000-0000-4000-8000-000000000991', 'store', (select id from app_public.stores order by id offset 1 limit 1), 1),
  ('25700000-0000-4000-8000-000000000283', '25700000-0000-4000-8000-000000000991', 'store', (select id from app_public.stores order by id offset 2 limit 1), 2),
  ('25700000-0000-4000-8000-000000000284', '25700000-0000-4000-8000-000000000991', 'store', (select id from app_public.stores order by id offset 3 limit 1), 3);
commit;

select dblink_connect('issue257_a', 'dbname=postgres');
select dblink_connect('issue257_b', 'dbname=postgres');
select dblink_exec('issue257_a', 'begin; set local role identity_service; do $$begin perform 1 from trip_private.trips where trip_id = ''25700000-0000-4000-8000-000000000991'' for update; end$$; set local role authenticated; set local request.jwt.claims = ''{"sub":"25700000-0000-4000-8000-000000000901","role":"authenticated","session_id":"25700000-0000-4000-8000-000000000911"}'';');
select dblink_send_query('issue257_a', $$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000991','25700000-0000-4000-8000-000000000284',0)$$);
select dblink_exec('issue257_b', 'begin; set local role authenticated; set local request.jwt.claims = ''{"sub":"25700000-0000-4000-8000-000000000901","role":"authenticated","session_id":"25700000-0000-4000-8000-000000000911"}'';');
select dblink_send_query('issue257_b', $$select app_public.reorder_trip_stop('25700000-0000-4000-8000-000000000991','25700000-0000-4000-8000-000000000281',3)$$);
select pg_sleep(0.2);
select set_config('test.race_a', (select value::text from dblink_get_result('issue257_a') as result(value jsonb)), false);
select dblink_exec('issue257_a', 'commit');
select set_config('test.race_b', (select value::text from dblink_get_result('issue257_b') as result(value jsonb)), false);
select dblink_exec('issue257_b', 'commit');
select dblink_disconnect('issue257_a');
select dblink_disconnect('issue257_b');

select is((select array_agg(item->>'id' order by ordinality) from jsonb_array_elements(current_setting('test.race_a')::jsonb->'stops') with ordinality as x(item, ordinality)), array['25700000-0000-4000-8000-000000000284','25700000-0000-4000-8000-000000000281','25700000-0000-4000-8000-000000000282','25700000-0000-4000-8000-000000000283']::text[], 'first concurrent RPC returns a complete order');
select is((select array_agg(item->>'id' order by ordinality) from jsonb_array_elements(current_setting('test.race_b')::jsonb->'stops') with ordinality as x(item, ordinality)), array['25700000-0000-4000-8000-000000000284','25700000-0000-4000-8000-000000000282','25700000-0000-4000-8000-000000000283','25700000-0000-4000-8000-000000000281']::text[], 'second concurrent RPC returns a complete order after waiting for the trip lock');

select is((select array_agg(s.stop_id::text order by s.position) from trip_private.trip_stops as s where s.trip_id = '25700000-0000-4000-8000-000000000991'::uuid), array['25700000-0000-4000-8000-000000000284','25700000-0000-4000-8000-000000000282','25700000-0000-4000-8000-000000000283','25700000-0000-4000-8000-000000000281']::text[], 'concurrent commits preserve every stop in one order');
select is((select version from trip_private.trips where trip_id = '25700000-0000-4000-8000-000000000991'::uuid), 22::bigint, 'concurrent successful reorders each increment the trip version');
delete from trip_private.trip_stops where trip_id = '25700000-0000-4000-8000-000000000991'::uuid;
delete from trip_private.trips where trip_id = '25700000-0000-4000-8000-000000000991'::uuid;
delete from app_private.role_grants where subject_user_id = '25700000-0000-4000-8000-000000000901';
delete from app_private.profiles where user_id = '25700000-0000-4000-8000-000000000901';
delete from auth.sessions where id = '25700000-0000-4000-8000-000000000911';
delete from auth.users where id = '25700000-0000-4000-8000-000000000901';

select * from finish();
