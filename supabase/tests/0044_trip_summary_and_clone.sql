begin;
select plan(6);

select has_column('trip_private','trips','started_at','trip history records an authoritative start');
select has_column('trip_private','trips','completed_at','trip history records an authoritative finish');
select trigger_is('trip_private','trips','stamp_trip_history','trip_private.stamp_trip_history','state transitions stamp immutable history timing');
select has_function('app_public','clone_completed_trip',array['text'],'Plan Again has an atomic server command');
select ok(has_function_privilege('authenticated','app_public.clone_completed_trip(text)','EXECUTE') and not has_function_privilege('anon','app_public.clone_completed_trip(text)','EXECUTE'),'only authenticated members can request a clone');
select ok(position('''durationMinutes''' in pg_get_functiondef('trip_private.trip_command_json(uuid)'::regprocedure))>0 and position('''memoryStatus''' in pg_get_functiondef('trip_private.trip_command_json(uuid)'::regprocedure))>0,'summary projection includes duration and per-author memory status');

select * from finish();
rollback;
