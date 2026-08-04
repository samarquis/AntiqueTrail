begin;
select plan(26);

select has_role('trip_go_gateway','constrained Edge gateway role exists');
select ok(pg_has_role('authenticator','trip_go_gateway','member'),'authenticator may assume the constrained gateway role');
select has_table('trip_private','trip_device_proof_nonces','consumed device proofs are recorded');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='trip_private' and c.relname='trip_device_proof_nonces'),'proof nonce ledger forces RLS');
select col_is_pk('trip_private','trip_device_proof_nonces',array['device_key_id','nonce'],'device nonce is globally one-time');
select ok(not has_table_privilege('authenticated','trip_private.trip_device_proof_nonces','SELECT'),'browser cannot inspect proof nonces');

select has_function('app_public','record_verified_offline_grant_receipt',
  array['text','text','text','text','bigint','jsonb','timestamp with time zone','text','timestamp with time zone'],
  'verified grant receipt boundary exists');
select ok(has_function_privilege('trip_grant_signer',
  'app_public.record_verified_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz,text,timestamptz)','EXECUTE'),
  'grant signer may record a verified proof');
select ok(not has_function_privilege('trip_grant_signer',
  'app_public.record_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz)','EXECUTE'),
  'grant signer cannot bypass proof recording');
select ok(position('device_proof_replayed' in pg_get_functiondef(
  'app_public.record_verified_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz,text,timestamptz)'::regprocedure))>0,
  'replayed grant proof is rejected');
select ok(position("->>'deviceId'<>device_key_id" in replace(pg_get_functiondef(
  'app_public.record_verified_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz,text,timestamptz)'::regprocedure),' ',''))>0,
  'grant is bound to the verified public-key thumbprint');

select has_function('app_public','prepare_go_device_command',array['text','text','text','text'],
  'authenticated Go preflight exists');
select ok(has_function_privilege('authenticated','app_public.prepare_go_device_command(text,text,text,text)','EXECUTE'),
  'browser may request only a bound command version');
select ok(position('current_session_is_active' in pg_get_functiondef(
  'app_public.prepare_go_device_command(text,text,text,text)'::regprocedure))>0,
  'preflight requires an active application session');
select ok(position('navigator_device_hash=extensions.digest' in replace(pg_get_functiondef(
  'app_public.prepare_go_device_command(text,text,text,text)'::regprocedure),' ',''))>0,
  'preflight rejects an old key after Navigator transfer');

select has_function('app_public','execute_verified_go_command',
  array['text','text','text','text','text','bigint','text','text','timestamp with time zone'],
  'verified online Go mutation boundary exists');
select ok(has_function_privilege('trip_go_gateway',
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)','EXECUTE'),
  'only the constrained gateway may execute verified Go mutations');
select ok(not has_function_privilege('authenticated',
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)','EXECUTE'),
  'browser cannot invoke the gateway RPC directly');
select ok(position('t.version=base_version' in replace(pg_get_functiondef(
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)'::regprocedure),' ',''))>0,
  'mutation atomically binds the signed base version');
select ok(position('s.session_id=v_session' in replace(pg_get_functiondef(
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)'::regprocedure),' ',''))>0,
  'mutation atomically requires the verified provider session to remain active');
select ok(position('navigator_device_hash=extensions.digest' in replace(pg_get_functiondef(
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)'::regprocedure),' ',''))>0,
  'mutation atomically binds the current Navigator thumbprint');
select ok(position('device_proof_replayed' in pg_get_functiondef(
  'app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)'::regprocedure))>0,
  'replayed Go proof is rejected atomically');

select ok(not has_function_privilege('authenticated','app_public.mark_arrived(text,text)','EXECUTE'),
  'browser cannot bypass the gateway for arrival');
select ok(not has_function_privilege('authenticated','app_public.complete_trip_stop(text,text)','EXECUTE'),
  'browser cannot bypass the gateway for completion');
select ok(not has_function_privilege('authenticated','app_public.skip_trip_stop(text,text)','EXECUTE'),
  'browser cannot bypass the gateway for skip');
select ok(has_function_privilege('authenticated',
  'app_public.replay_trip_mutation(text,jsonb)','EXECUTE'),
  'offline replay remains available through its proof-bound boundary');

select * from finish();
rollback;
