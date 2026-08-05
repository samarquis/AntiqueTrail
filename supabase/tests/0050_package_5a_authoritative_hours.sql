begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select has_column('trip_private','trips','hours_reviewed_at','trips retain the authoritative review time');
select has_column('trip_private','trips','hours_review_has_unresolved','trips retain unresolved-warning state');
select has_column('trip_private','trips','hours_warnings_acknowledged_at','warning acknowledgement is explicit and durable');
select has_function('trip_private','trip_hours_for_stop',array['uuid','date'],'date-specific store-hours projection exists');
select has_function('trip_private','trip_has_unresolved_hours',array['uuid'],'trip warning aggregation exists');
select has_function('app_public','add_trip_store_stop',array['text','text'],'Add to Trip accepts an exact store id');
select has_function('app_public','review_trip_hours',array['text','boolean'],'hours review accepts explicit warning acknowledgement');

select ok(not has_function_privilege('anon','app_public.add_trip_store_stop(text,text)','EXECUTE')
  and has_function_privilege('authenticated','app_public.add_trip_store_stop(text,text)','EXECUTE'),
  'only authenticated sessions may add an exact catalog store');
select ok(not has_function_privilege('anon','app_public.review_trip_hours(text,boolean)','EXECUTE')
  and has_function_privilege('authenticated','app_public.review_trip_hours(text,boolean)','EXECUTE'),
  'only authenticated sessions may review hours');
select ok(not has_function_privilege('authenticated','app_public.review_trip_hours(text)','EXECUTE'),
  'the obsolete review command cannot bypass acknowledgement');
select ok(not has_function_privilege('authenticated','trip_private.trip_hours_for_stop(uuid,date)','EXECUTE'),
  'browser sessions cannot invoke private hours helpers directly');

select ok(position('catalog_today' in lower(pg_get_functiondef('trip_private.trip_hours_for_stop(uuid,date)'::regprocedure)))>0
  and position('catalog_freshness' in lower(pg_get_functiondef('trip_private.trip_hours_for_stop(uuid,date)'::regprocedure)))>0,
  'review derives the selected date and verification freshness from catalog authority');
select ok(position('target_local_date' in lower(pg_get_functiondef('trip_private.trip_hours_for_stop(uuid,date)'::regprocedure)))>0
  and position('timezone_name' in lower(pg_get_functiondef('trip_private.trip_hours_for_stop(uuid,date)'::regprocedure)))>0,
  'selected-date review uses each store timezone');
select ok(position('''verified''' in lower(pg_get_functiondef('trip_private.trip_hours_for_stop(uuid,date)'::regprocedure)))>0
  and position('''stale''' in lower(pg_get_functiondef('trip_private.trip_hours_for_stop(uuid,date)'::regprocedure)))>0
  and position('''unknown''' in lower(pg_get_functiondef('trip_private.trip_hours_for_stop(uuid,date)'::regprocedure)))>0,
  'hours projection distinguishes verified, stale, and unknown');
select ok(position('closed on this trip date' in lower(pg_get_functiondef('trip_private.trip_hours_for_stop(uuid,date)'::regprocedure)))>0,
  'a current-day closure is an explicit warning');
select ok(position('lower(name)' in lower(pg_get_functiondef('app_public.add_trip_store_stop(text,text)'::regprocedure)))=0
  and position('s.id=target_store' in replace(lower(pg_get_functiondef('app_public.add_trip_store_stop(text,text)'::regprocedure)),' ',''))>0,
  'Add to Trip resolves the stable id, never a name match');
select ok(position('hours_warnings_acknowledged_at' in lower(pg_get_functiondef('app_public.review_trip_hours(text,boolean)'::regprocedure)))>0
  and position('acknowledge_warnings' in lower(pg_get_functiondef('app_public.review_trip_hours(text,boolean)'::regprocedure)))>0,
  'unresolved warnings require explicit acknowledgement');
select ok(position('hours_reviewed_at' in lower(pg_get_functiondef('trip_private.guard_trip_activation()'::regprocedure)))>0
  and position('trip_has_unresolved_hours' in lower(pg_get_functiondef('trip_private.guard_trip_activation()'::regprocedure)))>0,
  'every online and proof-backed start path enforces a current authoritative review');
select ok(exists(select 1 from pg_trigger where tgname='invalidate_trip_hours_after_stop' and not tgisinternal)
  and exists(select 1 from pg_trigger where tgname='invalidate_trip_hours_on_date_change' and not tgisinternal),
  'stop and date changes invalidate the prior review');
select ok(position('''startKind''' in pg_get_functiondef('trip_private.trip_command_json(uuid)'::regprocedure))>0
  and position('''startLabel''' in pg_get_functiondef('trip_private.trip_command_json(uuid)'::regprocedure))>0
  and position('''hoursReview''' in pg_get_functiondef('trip_private.trip_command_json(uuid)'::regprocedure))>0,
  'trip projection exposes manual-start and review state without private coordinates');

select * from finish();
rollback;
