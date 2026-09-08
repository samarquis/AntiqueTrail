begin;
select plan(30);

select has_function('app_public','rg01_get_operational_status',array['uuid'],'bounded RG-01 operational projection exists');
select has_function('app_public','rg01_authorize_operational_command',array['text'],'operational command authorization exists');
select has_function('app_public','rg01_execute_operational_command',array['text','jsonb'],'atomic Operations command wrapper exists');
select has_function('app_public','rg01_consume_operational_decision',array['uuid','bytea','bytea','text','text','uuid'],'atomic Product Owner decision wrapper exists');
select ok(has_function_privilege('authenticated','app_public.rg01_get_operational_status(uuid)','EXECUTE'),
  'authenticated may request only the server projection');
select ok(has_function_privilege('authenticated','app_public.rg01_authorize_operational_command(text)','EXECUTE'),
  'authenticated reaches the server command gate');
select ok(has_function_privilege('authenticated','app_public.rg01_execute_operational_command(text,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','app_public.rg01_consume_operational_decision(uuid,bytea,bytea,text,text,uuid)','EXECUTE'),
  'authenticated reaches only the atomic server-owned command wrappers');
select ok(not has_function_privilege('anon','app_public.rg01_get_operational_status(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_public.rg01_authorize_operational_command(text)','EXECUTE')
  and not has_function_privilege('anon','app_public.rg01_execute_operational_command(text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','app_public.rg01_consume_operational_decision(uuid,bytea,bytea,text,text,uuid)','EXECUTE'),
  'anonymous callers cannot reach RG-01 evidence commands');

set local role anon;
select throws_ok($$select app_public.rg01_get_operational_status(null)$$,'42501',null,
  'anonymous execution of the operational projection is denied');
select throws_ok($$select app_public.rg01_authorize_operational_command('begin')$$,'42501',null,
  'anonymous execution of the operations gate is denied');
select throws_ok($$select app_public.rg01_execute_operational_command('begin','{}'::jsonb)$$,'42501',null,
  'anonymous execution of the Operations wrapper is denied');
select throws_ok($$select app_public.rg01_consume_operational_decision(null,null,null,null,null,null)$$,'42501',null,
  'anonymous execution of the Product Owner wrapper is denied');
reset role;

select set_config('request.jwt.claims','{"sub":"26200000-0000-4000-8000-000000000001","session_id":"26200000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select throws_ok($$select app_public.rg01_get_operational_status(null)$$,'42501',null,
  'authenticated execution without a retained responsibility is denied');
select throws_ok($$select app_public.rg01_authorize_operational_command('begin')$$,'42501',null,
  'authenticated execution without live Operations authority is denied');
select throws_ok($$select app_public.rg01_execute_operational_command('begin','{}'::jsonb)$$,'42501',null,
  'authenticated execution without live Operations authority is denied atomically');
select throws_ok($$select app_public.rg01_consume_operational_decision(null,null,null,null,null,null)$$,'42501',null,
  'authenticated execution without Product Owner authority is denied atomically');
reset role;
select is((select count(*) from rg01_private.rg01_command_receipts),0::bigint,
  'denied command attempts do not create durable receipts');

select ok(position('has_current_evidence_responsibility' in lower(pg_get_functiondef('app_public.rg01_get_operational_status(uuid)'::regprocedure)))>0
  and position('operations' in lower(pg_get_functiondef('app_public.rg01_get_operational_status(uuid)'::regprocedure)))>0
  and position('productowner' in lower(pg_get_functiondef('app_public.rg01_get_operational_status(uuid)'::regprocedure)))>0,
  'status requires an exact retained Operations or ProductOwner responsibility');
select ok(position('current_session_is_active' in lower(pg_get_functiondef('rg01_private.has_current_evidence_responsibility(text)'::regprocedure)))>0
  and position('current_user_has_role' in lower(pg_get_functiondef('rg01_private.has_current_evidence_responsibility(text)'::regprocedure)))>0
  and position('administrator' in lower(pg_get_functiondef('rg01_private.has_current_evidence_responsibility(text)'::regprocedure)))>0,
  'revoked sessions and wrong application roles fail closed');
select ok(position('bound_release_id' in lower(pg_get_functiondef('rg01_private.has_live_operations_authority()'::regprocedure)))>0
  and position('release_id' in lower(pg_get_functiondef('rg01_private.has_live_operations_authority()'::regprocedure)))>0,
  'prepare and freeze require the active exact release');
select ok(position('p_operationin(''begin'',''freeze'')' in replace(lower(pg_get_functiondef('app_public.rg01_authorize_operational_command(text)'::regprocedure)),' ',''))>0
  and position('consume_decision' in lower(pg_get_functiondef('app_public.rg01_authorize_operational_command(text)'::regprocedure)))>0,
  'prepare/freeze and provider consumption have separate server gates');
select ok(position('has_live_operations_authority' in lower(pg_get_functiondef('app_public.rg01_execute_operational_command(text,jsonb)'::regprocedure)))>0
  and position('rg01_execute_calculation' in lower(pg_get_functiondef('app_public.rg01_execute_operational_command(text,jsonb)'::regprocedure)))>0
  and position('current_session_has_mfa' in lower(pg_get_functiondef('app_public.rg01_consume_operational_decision(uuid,bytea,bytea,text,text,uuid)'::regprocedure)))>0
  and position('rg01_consume_verified_decision' in lower(pg_get_functiondef('app_public.rg01_consume_operational_decision(uuid,bytea,bytea,text,text,uuid)'::regprocedure)))>0,
  'atomic wrappers recheck server authority and delegate to service-owned operations');

select ok(position('limit25' in replace(lower(pg_get_functiondef('app_public.rg01_get_operational_status(uuid)'::regprocedure)),' ',''))>0,
  'run list is bounded');
select ok(position('first_trip_shoppers' in lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)))>0
  and position('claim_abusive' in lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)))>0,
  'projection exposes only named aggregate metric codes');
select ok(position('subject_id' in lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)))>0
  and position('dedup_hmac' in lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)))=0,
  'projection uses subject linkage only to derive purge status and never returns it');
select ok(position('manifestdigest' in replace(lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)),' ',''))>0
  and position('supersessionstatus' in replace(lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)),' ',''))>0
  and position('purgestatus' in replace(lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)),' ',''))>0,
  'projection returns digest, supersession, and purge status without private payloads');

select ok(position('rg01_execute_calculation' in lower(pg_get_functiondef('app_public.rg01_authorize_operational_command(text)'::regprocedure)))=0,
  'the authorization RPC does not perform a client-controlled calculation');
select ok(position('rg01_authorize_operational_command' in lower(pg_get_functiondef('app_public.rg01_request_decision_challenge(uuid,text,uuid)'::regprocedure)))=0,
  'Product Owner challenge issuance remains its own exact RPC contract');
select ok(position('rg01_authorize_operational_command' in lower(pg_get_functiondef('rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text)'::regprocedure)))=0
  and position('gate_signing_capabilities' in lower(pg_get_functiondef('rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text)'::regprocedure)))>0,
  'provider consumption still relies on the one-use server capability');
select ok(not has_function_privilege('authenticated','rg01_private.operational_run_projection(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','rg01_private.has_live_operations_authority()','EXECUTE'),
  'private projection and authority helpers are not direct browser APIs');
select * from finish();
rollback;
