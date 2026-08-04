begin;
select plan(5);

select function_returns(
  'trip_private',
  'trip_command_json',
  array['uuid'],
  'jsonb',
  'trip projection remains a server-owned JSON boundary'
);

select ok(
  position('''storeId''' in pg_get_functiondef('trip_private.trip_command_json(uuid)'::regprocedure))>0,
  'trip store stops expose the stable store identifier needed for private memories'
);

select ok(
  position('current_state in (''skipped'', ''observed_closed'')' in pg_get_functiondef('trip_private.apply_go_stop_command(uuid,uuid,text)'::regprocedure))>0,
  'the Go state machine permits restoring skipped and observed-closed stops'
);

select ok(
  not has_function_privilege('anon','trip_private.apply_go_stop_command(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','trip_private.apply_go_stop_command(uuid,uuid,text)','EXECUTE'),
  'browser roles cannot bypass the verified Go command gateway'
);

select ok(
  has_function_privilege('identity_service','trip_private.apply_go_stop_command(uuid,uuid,text)','EXECUTE'),
  'only the constrained identity service owns the internal Go transition'
);

select * from finish();
rollback;
