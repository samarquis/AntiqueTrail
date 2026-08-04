begin;
select plan(5);

select ok(position('v_statein(''skipped'',''observed_closed'')' in replace(
  pg_get_functiondef('app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)'::regprocedure),' ',''))>0,
  'latest-device gateway restores skipped and observed-closed stops');
select ok(position('t.version=base_version' in replace(
  pg_get_functiondef('app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)'::regprocedure),' ',''))>0,
  'latest-device gateway binds the signed command to the current trip version');
select ok(position('navigator_device_hash' in pg_get_functiondef(
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)'::regprocedure))>0,
  'latest-device gateway retains the exact Navigator device check');
select ok(position('current_statein(''skipped'',''observed_closed'')' in replace(
  pg_get_functiondef('trip_private.apply_go_stop_command(uuid,uuid,text)'::regprocedure),' ',''))>0,
  'offline replay uses the same exact restore transition');
select ok(not has_function_privilege('authenticated',
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)','EXECUTE')
  and has_function_privilege('trip_go_gateway',
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)','EXECUTE'),
  'only the proof-verifying gateway executes the command');

select * from finish();
rollback;
